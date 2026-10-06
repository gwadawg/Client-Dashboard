-- Client KPI reads after the lead-milestone cutover.
-- A function-level statement_timeout blocked inlining, and
-- "client_id IS NULL OR client_id = ANY(...)" could not use an index, so
-- dashboard_kpi_counts seq-scanned events (~18s for one client / 90 days).
-- The SQL bodies stay inlineable. The plpgsql wrappers only raise the
-- PostgREST 8s statement timeout for wide ranges.
-- Run VACUUM (ANALYZE) on events and leads once after a bulk lead backfill;
-- that is what makes the index-only scans actually skip the heap.

create index if not exists events_client_nondial_occurred_idx
  on public.events (client_id, occurred_at desc)
  include (
    event_type,
    is_qualified,
    is_hot,
    is_out_of_state,
    ghl_contact_id,
    lead_phone,
    lead_email,
    lead_name
  )
  where event_type <> 'dial';

CREATE OR REPLACE FUNCTION public.dashboard_kpi_counts_body(p_client_ids uuid[] DEFAULT NULL::uuid[], p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  WITH scoped AS MATERIALIZED (
    SELECT
      e.client_id,
      e.event_type,
      e.occurred_at,
      e.is_qualified,
      e.is_hot,
      e.is_out_of_state,
      e.ghl_contact_id,
      e.lead_phone,
      e.lead_email,
      e.lead_name,
      public.event_lead_key(
        e.client_id, e.ghl_contact_id, e.lead_phone, e.lead_email, e.lead_name
      ) AS lead_key
    FROM public.events e
    WHERE e.event_type <> 'dial'
      AND (e.occurred_at >= COALESCE(p_start, '-infinity'::timestamptz))
      AND (e.occurred_at <= COALESCE(p_end, 'infinity'::timestamptz))
      AND e.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
  ),
  dial_stats AS (
    SELECT
      COUNT(*)::bigint AS outbound_dials,
      COUNT(*) FILTER (WHERE e.is_pickup IS TRUE)::bigint AS pickups,
      COUNT(*) FILTER (WHERE e.is_conversation IS TRUE)::bigint AS conversations
    FROM public.events e
    WHERE e.event_type = 'dial'
      AND (e.occurred_at >= COALESCE(p_start, '-infinity'::timestamptz))
      AND (e.occurred_at <= COALESCE(p_end, 'infinity'::timestamptz))
      AND e.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
  ),
  earliest_book AS (
    SELECT lead_key, MIN(occurred_at) AS first_book
    FROM scoped
    WHERE event_type = 'appointment_booked'
      AND lead_key IS NOT NULL
    GROUP BY lead_key
  ),
  earliest_claim AS (
    SELECT lead_key, MIN(occurred_at) AS first_claim
    FROM scoped
    WHERE event_type = 'claimed'
      AND lead_key IS NOT NULL
    GROUP BY lead_key
  ),
  claimed_after AS (
    SELECT COUNT(*)::bigint AS claimed_after_booked
    FROM earliest_book b
    INNER JOIN earliest_claim c ON c.lead_key = b.lead_key
    WHERE c.first_claim > b.first_book
  ),
  booked_leads AS (
    SELECT DISTINCT lead_key
    FROM scoped
    WHERE event_type = 'appointment_booked'
      AND lead_key IS NOT NULL
  ),
  spoken_leads AS (
    SELECT DISTINCT lead_key
    FROM scoped
    WHERE event_type IN ('show', 'claimed', 'live_transfer')
      AND lead_key IS NOT NULL
  ),
  booked_converted AS (
    SELECT COUNT(*)::bigint AS unique_booked_converted
    FROM booked_leads b
    INNER JOIN spoken_leads s ON s.lead_key = b.lead_key
  )
  SELECT jsonb_build_object(
    'new_leads', COUNT(*) FILTER (WHERE event_type = 'lead'),
    'qualified_leads', COUNT(*) FILTER (WHERE event_type = 'lead' AND is_qualified IS TRUE),
    'hot_leads', COUNT(*) FILTER (WHERE event_type = 'lead' AND is_hot IS TRUE),
    'out_of_state_leads',
      COUNT(*) FILTER (WHERE event_type = 'lead' AND is_out_of_state IS TRUE)
      + COUNT(*) FILTER (WHERE event_type = 'out_of_state_lead'),
    'booked_appointments', COUNT(*) FILTER (WHERE event_type = 'appointment_booked'),
    'appointment_cancelled', COUNT(*) FILTER (WHERE event_type = 'appointment_cancelled'),
    'appointment_rescheduled', COUNT(*) FILTER (WHERE event_type = 'appointment_rescheduled'),
    'shows', COUNT(*) FILTER (WHERE event_type = 'show'),
    'no_shows', COUNT(*) FILTER (WHERE event_type = 'no_show'),
    'lo_bailed', COUNT(*) FILTER (WHERE event_type = 'lo_bailed'),
    'loan_processing',
      COUNT(*) FILTER (WHERE event_type IN ('submission_made', 'loan_processing')),
    'outbound_dials', (SELECT outbound_dials FROM dial_stats),
    'pickups', (SELECT pickups FROM dial_stats),
    'conversations', (SELECT conversations FROM dial_stats),
    'callbacks', COUNT(*) FILTER (WHERE event_type = 'callback_booked'),
    'live_transfers', COUNT(*) FILTER (WHERE event_type = 'live_transfer'),
    'claimed', COUNT(*) FILTER (WHERE event_type = 'claimed'),
    'proposals_sent',
      COUNT(*) FILTER (WHERE event_type IN ('proposal_made', 'proposal_sent')),
    'closed', COUNT(*) FILTER (WHERE event_type IN ('loan_funded', 'closed')),
    'unique_booked_appointments',
      COUNT(DISTINCT lead_key) FILTER (WHERE event_type = 'appointment_booked'),
    'unique_hand_raises',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN ('appointment_booked', 'live_transfer', 'claimed')
      ),
    'unique_conversations', (
      SELECT COUNT(*)::bigint FROM public.leads l
      WHERE l.merged_into_id IS NULL
        AND l.conversation_at IS NOT NULL
        AND (l.conversation_at >= COALESCE(p_start, '-infinity'::timestamptz))
        AND (l.conversation_at <= COALESCE(p_end, 'infinity'::timestamptz))
        AND l.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
    ),
    'billable_conversations',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN ('show', 'live_transfer')
      ),
    'claimed_after_booked',
      (SELECT claimed_after_booked FROM claimed_after),
    'unique_booked_converted',
      (SELECT unique_booked_converted FROM booked_converted),
    'proposals_made', (
      SELECT COUNT(*)::bigint FROM public.leads l
      WHERE l.merged_into_id IS NULL
        AND l.proposal_at IS NOT NULL
        AND (l.proposal_at >= COALESCE(p_start, '-infinity'::timestamptz))
        AND (l.proposal_at <= COALESCE(p_end, 'infinity'::timestamptz))
        AND l.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
    ),
    'submissions_made', (
      SELECT COUNT(*)::bigint FROM public.leads l
      WHERE l.merged_into_id IS NULL
        AND l.submission_at IS NOT NULL
        AND (l.submission_at >= COALESCE(p_start, '-infinity'::timestamptz))
        AND (l.submission_at <= COALESCE(p_end, 'infinity'::timestamptz))
        AND l.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
    ),
    'funded_loans', (
      SELECT COUNT(*)::bigint FROM public.leads l
      WHERE l.merged_into_id IS NULL
        AND l.funded_at IS NOT NULL
        AND (l.funded_at >= COALESCE(p_start, '-infinity'::timestamptz))
        AND (l.funded_at <= COALESCE(p_end, 'infinity'::timestamptz))
        AND l.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
    )
  )
  FROM scoped;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpi_counts(p_client_ids uuid[] DEFAULT NULL::uuid[], p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  perform set_config('statement_timeout', '60s', true);
  return public.dashboard_kpi_counts_body(p_client_ids, p_start, p_end);
end
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpi_counts_by_client_body(p_client_ids uuid[] DEFAULT NULL::uuid[], p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(client_id uuid, new_leads bigint, qualified_leads bigint, hot_leads bigint, out_of_state_leads bigint, booked_appointments bigint, appointment_cancelled bigint, appointment_rescheduled bigint, shows bigint, no_shows bigint, lo_bailed bigint, loan_processing bigint, outbound_dials bigint, pickups bigint, conversations bigint, callbacks bigint, live_transfers bigint, claimed bigint, proposals_sent bigint, closed bigint, unique_booked_appointments bigint, unique_hand_raises bigint, unique_conversations bigint, billable_conversations bigint, claimed_after_booked bigint, unique_booked_converted bigint, proposals_made bigint, submissions_made bigint, funded_loans bigint)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  WITH scoped AS MATERIALIZED (
    SELECT
      e.client_id,
      e.event_type,
      e.occurred_at,
      e.is_qualified,
      e.is_hot,
      e.is_out_of_state,
      public.event_lead_key(
        e.client_id, e.ghl_contact_id, e.lead_phone, e.lead_email, e.lead_name
      ) AS lead_key
    FROM public.events e
    WHERE e.event_type <> 'dial'
      AND (e.occurred_at >= COALESCE(p_start, '-infinity'::timestamptz))
      AND (e.occurred_at <= COALESCE(p_end, 'infinity'::timestamptz))
      AND e.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
  ),
  dial_stats AS (
    SELECT
      e.client_id,
      COUNT(*)::bigint AS outbound_dials,
      COUNT(*) FILTER (WHERE e.is_pickup IS TRUE)::bigint AS pickups,
      COUNT(*) FILTER (WHERE e.is_conversation IS TRUE)::bigint AS conversations
    FROM public.events e
    WHERE e.event_type = 'dial'
      AND e.client_id IS NOT NULL
      AND (e.occurred_at >= COALESCE(p_start, '-infinity'::timestamptz))
      AND (e.occurred_at <= COALESCE(p_end, 'infinity'::timestamptz))
      AND e.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
    GROUP BY e.client_id
  ),
  earliest_book AS (
    SELECT s.client_id, s.lead_key, MIN(s.occurred_at) AS first_book
    FROM scoped s
    WHERE s.event_type = 'appointment_booked'
      AND s.lead_key IS NOT NULL
      AND s.client_id IS NOT NULL
    GROUP BY s.client_id, s.lead_key
  ),
  earliest_claim AS (
    SELECT s.client_id, s.lead_key, MIN(s.occurred_at) AS first_claim
    FROM scoped s
    WHERE s.event_type = 'claimed'
      AND s.lead_key IS NOT NULL
      AND s.client_id IS NOT NULL
    GROUP BY s.client_id, s.lead_key
  ),
  claimed_after AS (
    SELECT
      b.client_id,
      COUNT(*)::bigint AS claimed_after_booked
    FROM earliest_book b
    INNER JOIN earliest_claim c
      ON c.client_id = b.client_id
     AND c.lead_key = b.lead_key
    WHERE c.first_claim > b.first_book
    GROUP BY b.client_id
  ),
  booked_converted AS (
    SELECT
      b.client_id,
      COUNT(DISTINCT b.lead_key)::bigint AS unique_booked_converted
    FROM (
      SELECT DISTINCT s.client_id, s.lead_key
      FROM scoped s
      WHERE s.event_type = 'appointment_booked'
        AND s.lead_key IS NOT NULL
        AND s.client_id IS NOT NULL
    ) b
    INNER JOIN (
      SELECT DISTINCT s.client_id, s.lead_key
      FROM scoped s
      WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
        AND s.lead_key IS NOT NULL
        AND s.client_id IS NOT NULL
    ) sp
      ON sp.client_id = b.client_id
     AND sp.lead_key = b.lead_key
    GROUP BY b.client_id
  ),
  milestone AS (
    SELECT
      l.client_id,
      COUNT(*) FILTER (
        WHERE l.conversation_at IS NOT NULL
          AND (l.conversation_at >= COALESCE(p_start, '-infinity'::timestamptz))
          AND (l.conversation_at <= COALESCE(p_end, 'infinity'::timestamptz))
      )::bigint AS unique_conversations,
      COUNT(*) FILTER (
        WHERE l.proposal_at IS NOT NULL
          AND (l.proposal_at >= COALESCE(p_start, '-infinity'::timestamptz))
          AND (l.proposal_at <= COALESCE(p_end, 'infinity'::timestamptz))
      )::bigint AS proposals_made,
      COUNT(*) FILTER (
        WHERE l.submission_at IS NOT NULL
          AND (l.submission_at >= COALESCE(p_start, '-infinity'::timestamptz))
          AND (l.submission_at <= COALESCE(p_end, 'infinity'::timestamptz))
      )::bigint AS submissions_made,
      COUNT(*) FILTER (
        WHERE l.funded_at IS NOT NULL
          AND (l.funded_at >= COALESCE(p_start, '-infinity'::timestamptz))
          AND (l.funded_at <= COALESCE(p_end, 'infinity'::timestamptz))
      )::bigint AS funded_loans
    FROM public.leads l
    WHERE l.merged_into_id IS NULL
      AND l.client_id IS NOT NULL
      AND l.client_id = ANY (COALESCE(p_client_ids, (SELECT array_agg(id) FROM public.clients)))
      AND (
        (l.conversation_at IS NOT NULL AND (l.conversation_at >= COALESCE(p_start, '-infinity'::timestamptz)) AND (l.conversation_at <= COALESCE(p_end, 'infinity'::timestamptz)))
        OR (l.proposal_at IS NOT NULL AND (l.proposal_at >= COALESCE(p_start, '-infinity'::timestamptz)) AND (l.proposal_at <= COALESCE(p_end, 'infinity'::timestamptz)))
        OR (l.submission_at IS NOT NULL AND (l.submission_at >= COALESCE(p_start, '-infinity'::timestamptz)) AND (l.submission_at <= COALESCE(p_end, 'infinity'::timestamptz)))
        OR (l.funded_at IS NOT NULL AND (l.funded_at >= COALESCE(p_start, '-infinity'::timestamptz)) AND (l.funded_at <= COALESCE(p_end, 'infinity'::timestamptz)))
      )
    GROUP BY l.client_id
  ),
  kpi AS (
    SELECT
      s.client_id,
      COUNT(*) FILTER (WHERE s.event_type = 'lead') AS new_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_qualified IS TRUE) AS qualified_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_hot IS TRUE) AS hot_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_out_of_state IS TRUE)
        + COUNT(*) FILTER (WHERE s.event_type = 'out_of_state_lead') AS out_of_state_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_booked') AS booked_appointments,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_cancelled') AS appointment_cancelled,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_rescheduled') AS appointment_rescheduled,
      COUNT(*) FILTER (WHERE s.event_type = 'show') AS shows,
      COUNT(*) FILTER (WHERE s.event_type = 'no_show') AS no_shows,
      COUNT(*) FILTER (WHERE s.event_type = 'lo_bailed') AS lo_bailed,
      COUNT(*) FILTER (WHERE s.event_type IN ('submission_made', 'loan_processing')) AS loan_processing,
      COUNT(*) FILTER (WHERE s.event_type = 'callback_booked') AS callbacks,
      COUNT(*) FILTER (WHERE s.event_type = 'live_transfer') AS live_transfers,
      COUNT(*) FILTER (WHERE s.event_type = 'claimed') AS claimed,
      COUNT(*) FILTER (WHERE s.event_type IN ('proposal_made', 'proposal_sent')) AS proposals_sent,
      COUNT(*) FILTER (WHERE s.event_type IN ('loan_funded', 'closed')) AS closed,
      COUNT(DISTINCT s.lead_key) FILTER (WHERE s.event_type = 'appointment_booked') AS unique_booked_appointments,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('appointment_booked', 'live_transfer', 'claimed')
      ) AS unique_hand_raises,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
      ) AS unique_conversations,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('show', 'live_transfer')
      ) AS billable_conversations,
      COALESCE((SELECT ca.claimed_after_booked FROM claimed_after ca WHERE ca.client_id = s.client_id), 0)
        AS claimed_after_booked,
      COALESCE((SELECT bc.unique_booked_converted FROM booked_converted bc WHERE bc.client_id = s.client_id), 0)
        AS unique_booked_converted,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN (
          'proposal_made', 'proposal_sent',
          'submission_made', 'loan_processing',
          'loan_funded', 'closed'
        )
      ) AS proposals_made,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN (
          'submission_made', 'loan_processing',
          'loan_funded', 'closed'
        )
      ) AS submissions_made,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('loan_funded', 'closed')
      ) AS funded_loans
    FROM scoped s
    WHERE s.client_id IS NOT NULL
    GROUP BY s.client_id
  )
  SELECT
    COALESCE(k.client_id, d.client_id, m.client_id),
    COALESCE(k.new_leads, 0),
    COALESCE(k.qualified_leads, 0),
    COALESCE(k.hot_leads, 0),
    COALESCE(k.out_of_state_leads, 0),
    COALESCE(k.booked_appointments, 0),
    COALESCE(k.appointment_cancelled, 0),
    COALESCE(k.appointment_rescheduled, 0),
    COALESCE(k.shows, 0),
    COALESCE(k.no_shows, 0),
    COALESCE(k.lo_bailed, 0),
    COALESCE(k.loan_processing, 0),
    COALESCE(d.outbound_dials, 0),
    COALESCE(d.pickups, 0),
    COALESCE(d.conversations, 0),
    COALESCE(k.callbacks, 0),
    COALESCE(k.live_transfers, 0),
    COALESCE(k.claimed, 0),
    COALESCE(k.proposals_sent, 0),
    COALESCE(k.closed, 0),
    COALESCE(k.unique_booked_appointments, 0),
    COALESCE(k.unique_hand_raises, 0),
    COALESCE(m.unique_conversations, 0),
    COALESCE(k.billable_conversations, 0),
    COALESCE(k.claimed_after_booked, 0),
    COALESCE(k.unique_booked_converted, 0),
    COALESCE(m.proposals_made, 0),
    COALESCE(m.submissions_made, 0),
    COALESCE(m.funded_loans, 0)
  FROM kpi k
  FULL OUTER JOIN dial_stats d ON d.client_id = k.client_id
  FULL OUTER JOIN milestone m ON m.client_id = COALESCE(k.client_id, d.client_id)
  WHERE COALESCE(k.client_id, d.client_id, m.client_id) IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpi_counts_by_client(p_client_ids uuid[] DEFAULT NULL::uuid[], p_start timestamp with time zone DEFAULT NULL::timestamp with time zone, p_end timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS TABLE(client_id uuid, new_leads bigint, qualified_leads bigint, hot_leads bigint, out_of_state_leads bigint, booked_appointments bigint, appointment_cancelled bigint, appointment_rescheduled bigint, shows bigint, no_shows bigint, lo_bailed bigint, loan_processing bigint, outbound_dials bigint, pickups bigint, conversations bigint, callbacks bigint, live_transfers bigint, claimed bigint, proposals_sent bigint, closed bigint, unique_booked_appointments bigint, unique_hand_raises bigint, unique_conversations bigint, billable_conversations bigint, claimed_after_booked bigint, unique_booked_converted bigint, proposals_made bigint, submissions_made bigint, funded_loans bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  perform set_config('statement_timeout', '60s', true);
  return query select * from public.dashboard_kpi_counts_by_client_body(p_client_ids, p_start, p_end);
end
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpi_timeline_body(p_client_ids uuid[] DEFAULT NULL::uuid[], p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_granularity text DEFAULT 'day'::text)
 RETURNS TABLE(bucket_date date, leads bigint, qualified_leads bigint, booked bigint, shows bigint, no_shows bigint, lo_bailed bigint, cancelled bigint, live_transfers bigint, claimed bigint, unique_booked_leads bigint, unique_hand_raise_leads bigint, unique_conversation_leads bigint)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  WITH bounds AS (
    SELECT
      coalesce(p_start, (SELECT min((occurred_at AT TIME ZONE 'UTC')::date) FROM public.events)) AS d0,
      coalesce(p_end, (SELECT max((occurred_at AT TIME ZONE 'UTC')::date) FROM public.events)) AS d1
  ),
  days AS (
    SELECT generate_series(b.d0, b.d1, interval '1 day')::date AS day_date
    FROM bounds b
  ),
  buckets AS (
    SELECT DISTINCT
      CASE
        WHEN lower(coalesce(p_granularity, 'day')) = 'week' THEN
          day_date - ((EXTRACT(ISODOW FROM day_date)::integer) - 1)
        ELSE day_date
      END AS bucket_date
    FROM days
  ),
  scoped AS (
    SELECT
      CASE
        WHEN lower(coalesce(p_granularity, 'day')) = 'week' THEN
          d - ((EXTRACT(ISODOW FROM d)::integer) - 1)
        ELSE d
      END AS bucket_date,
      e.event_type,
      e.is_qualified,
      public.event_lead_key(
        e.client_id, e.ghl_contact_id, e.lead_phone, e.lead_email, e.lead_name
      ) AS lead_key
    FROM public.events e
    CROSS JOIN bounds b
    CROSS JOIN LATERAL (
      SELECT (e.occurred_at AT TIME ZONE 'UTC')::date AS d
    ) z
    WHERE e.event_type <> 'dial'
      AND e.occurred_at >= (b.d0::timestamp AT TIME ZONE 'UTC')
      AND e.occurred_at < ((b.d1 + 1)::timestamp AT TIME ZONE 'UTC')
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
  ),
  agg AS (
    SELECT
      s.bucket_date,
      COUNT(*) FILTER (WHERE s.event_type = 'lead') AS leads,
      COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_qualified IS TRUE) AS qualified_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_booked') AS booked,
      COUNT(*) FILTER (WHERE s.event_type = 'show') AS shows,
      COUNT(*) FILTER (WHERE s.event_type = 'no_show') AS no_shows,
      COUNT(*) FILTER (WHERE s.event_type = 'lo_bailed') AS lo_bailed,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_cancelled') AS cancelled,
      COUNT(*) FILTER (WHERE s.event_type = 'live_transfer') AS live_transfers,
      COUNT(*) FILTER (WHERE s.event_type = 'claimed') AS claimed,
      COUNT(DISTINCT s.lead_key) FILTER (WHERE s.event_type = 'appointment_booked')
        AS unique_booked_leads,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('appointment_booked', 'live_transfer', 'claimed')
      ) AS unique_hand_raise_leads
    FROM scoped s
    GROUP BY s.bucket_date
  ),
  conv AS (
    SELECT
      CASE
        WHEN lower(coalesce(p_granularity, 'day')) = 'week' THEN
          d - ((EXTRACT(ISODOW FROM d)::integer) - 1)
        ELSE d
      END AS bucket_date,
      COUNT(*)::bigint AS unique_conversation_leads
    FROM public.leads l
    CROSS JOIN bounds b
    CROSS JOIN LATERAL (
      SELECT (l.conversation_at AT TIME ZONE 'UTC')::date AS d
    ) z
    WHERE l.merged_into_id IS NULL
      AND l.conversation_at IS NOT NULL
      AND l.conversation_at >= (b.d0::timestamp AT TIME ZONE 'UTC')
      AND l.conversation_at < ((b.d1 + 1)::timestamp AT TIME ZONE 'UTC')
      AND (p_client_ids IS NULL OR l.client_id = ANY (p_client_ids))
    GROUP BY 1
  )
  SELECT
    b.bucket_date,
    coalesce(a.leads, 0)::bigint,
    coalesce(a.qualified_leads, 0)::bigint,
    coalesce(a.booked, 0)::bigint,
    coalesce(a.shows, 0)::bigint,
    coalesce(a.no_shows, 0)::bigint,
    coalesce(a.lo_bailed, 0)::bigint,
    coalesce(a.cancelled, 0)::bigint,
    coalesce(a.live_transfers, 0)::bigint,
    coalesce(a.claimed, 0)::bigint,
    coalesce(a.unique_booked_leads, 0)::bigint,
    coalesce(a.unique_hand_raise_leads, 0)::bigint,
    coalesce(c.unique_conversation_leads, 0)::bigint
  FROM buckets b
  LEFT JOIN agg a ON a.bucket_date = b.bucket_date
  LEFT JOIN conv c ON c.bucket_date = b.bucket_date
  ORDER BY b.bucket_date;
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_kpi_timeline(p_client_ids uuid[] DEFAULT NULL::uuid[], p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date, p_granularity text DEFAULT 'day'::text)
 RETURNS TABLE(bucket_date date, leads bigint, qualified_leads bigint, booked bigint, shows bigint, no_shows bigint, lo_bailed bigint, cancelled bigint, live_transfers bigint, claimed bigint, unique_booked_leads bigint, unique_hand_raise_leads bigint, unique_conversation_leads bigint)
 LANGUAGE plpgsql
 STABLE
AS $function$
begin
  perform set_config('statement_timeout', '60s', true);
  return query select * from public.dashboard_kpi_timeline_body(p_client_ids, p_start, p_end, p_granularity);
end
$function$;

CREATE OR REPLACE FUNCTION public.lead_first_touch_ads(p_ids uuid[])
 RETURNS TABLE(id uuid, utm_content text, ad_name text)
 LANGUAGE sql
 STABLE PARALLEL SAFE
AS $function$
  select l.id, l.utm_content, l.ad_name
  from unnest(p_ids) as i(id)
  join public.leads l on l.id = i.id
$function$;

revoke all on function public.dashboard_kpi_counts_body(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.dashboard_kpi_counts_body(uuid[], timestamptz, timestamptz) to service_role;
revoke all on function public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz) to service_role;
revoke all on function public.dashboard_kpi_counts_by_client_body(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.dashboard_kpi_counts_by_client_body(uuid[], timestamptz, timestamptz) to service_role;
revoke all on function public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) to service_role;
revoke all on function public.dashboard_kpi_timeline_body(uuid[], date, date, text) from public, anon, authenticated;
grant execute on function public.dashboard_kpi_timeline_body(uuid[], date, date, text) to service_role;
revoke all on function public.dashboard_kpi_timeline(uuid[], date, date, text) from public, anon, authenticated;
grant execute on function public.dashboard_kpi_timeline(uuid[], date, date, text) to service_role;
revoke all on function public.lead_first_touch_ads(uuid[]) from public, anon, authenticated;
grant execute on function public.lead_first_touch_ads(uuid[]) to service_role;

-- This function inlines once the timeout setting is gone (44ms vs ~4s).
alter function public.dashboard_kpi_timeline_by_client(uuid[], date, date, text)
  reset statement_timeout;
