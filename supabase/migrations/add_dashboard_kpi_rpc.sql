-- Dashboard KPI aggregation in Postgres (Phase 2 performance).
-- Replaces shipping up to 100k event rows to Node for calculateMetrics / trends.
-- Called only via the service-role client from /api/metrics.

-- Lead identity key — must match src/lib/metrics.ts leadIdentityKey().
CREATE OR REPLACE FUNCTION public.event_lead_key(
  p_client_id uuid,
  p_ghl_contact_id text,
  p_lead_phone text,
  p_lead_email text,
  p_lead_name text
) RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(p_ghl_contact_id, '')), '') IS NOT NULL THEN
      coalesce(p_client_id::text, '') || '|ghl:' || btrim(p_ghl_contact_id)
    WHEN nullif(regexp_replace(coalesce(p_lead_phone, ''), '\D', '', 'g'), '') IS NOT NULL THEN
      coalesce(p_client_id::text, '') || '|phone:' || regexp_replace(p_lead_phone, '\D', '', 'g')
    WHEN nullif(btrim(lower(coalesce(p_lead_email, ''))), '') IS NOT NULL THEN
      coalesce(p_client_id::text, '') || '|email:' || btrim(lower(p_lead_email))
    WHEN nullif(btrim(lower(coalesce(p_lead_name, ''))), '') IS NOT NULL THEN
      coalesce(p_client_id::text, '') || '|name:' || btrim(lower(p_lead_name))
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION public.event_lead_key(uuid, text, text, text, text) IS
  'Stable lead identity for unique-rate numerators; mirrors src/lib/metrics.ts leadIdentityKey';

-- Hot-path indexes for type + date and scoped type scans.
CREATE INDEX IF NOT EXISTS events_type_occurred_idx
  ON public.events (event_type, occurred_at DESC);

CREATE INDEX IF NOT EXISTS events_client_type_occurred_idx
  ON public.events (client_id, event_type, occurred_at DESC);

-- Raw KPI counts for a filter window. Rates / spend / speed-to-lead stay in app code.
CREATE OR REPLACE FUNCTION public.dashboard_kpi_counts(
  p_client_ids uuid[] DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH scoped AS (
    SELECT
      e.client_id,
      e.event_type,
      e.is_qualified,
      e.is_hot,
      e.is_out_of_state,
      e.is_pickup,
      e.is_conversation,
      e.ghl_contact_id,
      e.lead_phone,
      e.lead_email,
      e.lead_name,
      public.event_lead_key(
        e.client_id, e.ghl_contact_id, e.lead_phone, e.lead_email, e.lead_name
      ) AS lead_key
    FROM public.events e
    WHERE (p_start IS NULL OR e.occurred_at >= p_start)
      AND (p_end IS NULL OR e.occurred_at <= p_end)
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
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
    'shows', COUNT(*) FILTER (WHERE event_type = 'show'),
    'no_shows', COUNT(*) FILTER (WHERE event_type = 'no_show'),
    'lo_bailed', COUNT(*) FILTER (WHERE event_type = 'lo_bailed'),
    'loan_processing',
      COUNT(*) FILTER (WHERE event_type IN ('submission_made', 'loan_processing')),
    'outbound_dials', COUNT(*) FILTER (WHERE event_type = 'dial'),
    'pickups', COUNT(*) FILTER (WHERE event_type = 'dial' AND is_pickup IS TRUE),
    'conversations', COUNT(*) FILTER (WHERE event_type = 'dial' AND is_conversation IS TRUE),
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
    'unique_conversations',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN ('show', 'claimed', 'live_transfer')
      ),
    'proposals_made',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN (
          'proposal_made', 'proposal_sent',
          'submission_made', 'loan_processing',
          'loan_funded', 'closed'
        )
      ),
    'submissions_made',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN (
          'submission_made', 'loan_processing',
          'loan_funded', 'closed'
        )
      ),
    'funded_loans',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN ('loan_funded', 'closed')
      )
  )
  FROM scoped;
$$;

COMMENT ON FUNCTION public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz) IS
  'Aggregated fulfillment KPI counts for dashboard filters; mirrors calculateMetrics numerators';

-- Daily event buckets for cost / KPI timelines (spend joined in app).
CREATE OR REPLACE FUNCTION public.dashboard_kpi_daily(
  p_client_ids uuid[] DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS TABLE (
  bucket_date date,
  leads bigint,
  qualified_leads bigint,
  booked bigint,
  shows bigint,
  no_shows bigint,
  lo_bailed bigint,
  cancelled bigint,
  live_transfers bigint,
  claimed bigint,
  unique_booked_leads bigint,
  unique_hand_raise_leads bigint,
  unique_conversation_leads bigint
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH bounds AS (
    SELECT
      coalesce(p_start, (SELECT min(occurred_at::date) FROM public.events)) AS d0,
      coalesce(p_end, (SELECT max(occurred_at::date) FROM public.events)) AS d1
  ),
  days AS (
    SELECT generate_series(b.d0, b.d1, interval '1 day')::date AS bucket_date
    FROM bounds b
  ),
  scoped AS (
    SELECT
      e.occurred_at::date AS bucket_date,
      e.event_type,
      e.is_qualified,
      public.event_lead_key(
        e.client_id, e.ghl_contact_id, e.lead_phone, e.lead_email, e.lead_name
      ) AS lead_key
    FROM public.events e
    CROSS JOIN bounds b
    WHERE e.occurred_at >= b.d0::timestamptz
      AND e.occurred_at < (b.d1 + 1)::timestamptz
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
      ) AS unique_hand_raise_leads,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
      ) AS unique_conversation_leads
    FROM scoped s
    GROUP BY s.bucket_date
  )
  SELECT
    d.bucket_date,
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
    coalesce(a.unique_conversation_leads, 0)::bigint
  FROM days d
  LEFT JOIN agg a ON a.bucket_date = d.bucket_date
  ORDER BY d.bucket_date;
$$;

COMMENT ON FUNCTION public.dashboard_kpi_daily(uuid[], date, date) IS
  'Per-day KPI numerators for dashboard trends; spend joined in application code';

REVOKE ALL ON FUNCTION public.event_lead_key(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_kpi_daily(uuid[], date, date) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.event_lead_key(uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_daily(uuid[], date, date) TO service_role;

-- Day/week timeline with correct unique counts per bucket (week ≠ Monday UTC).
CREATE OR REPLACE FUNCTION public.dashboard_kpi_timeline(
  p_client_ids uuid[] DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE (
  bucket_date date,
  leads bigint,
  qualified_leads bigint,
  booked bigint,
  shows bigint,
  no_shows bigint,
  lo_bailed bigint,
  cancelled bigint,
  live_transfers bigint,
  claimed bigint,
  unique_booked_leads bigint,
  unique_hand_raise_leads bigint,
  unique_conversation_leads bigint
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
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
    WHERE e.occurred_at >= (b.d0::timestamp AT TIME ZONE 'UTC')
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
      ) AS unique_hand_raise_leads,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
      ) AS unique_conversation_leads
    FROM scoped s
    GROUP BY s.bucket_date
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
    coalesce(a.unique_conversation_leads, 0)::bigint
  FROM buckets b
  LEFT JOIN agg a ON a.bucket_date = b.bucket_date
  ORDER BY b.bucket_date;
$$;

COMMENT ON FUNCTION public.dashboard_kpi_timeline(uuid[], date, date, text) IS
  'Day or week KPI numerators for dashboard trends; unique counts are distinct within each bucket';

REVOKE ALL ON FUNCTION public.dashboard_kpi_timeline(uuid[], date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_timeline(uuid[], date, date, text) TO service_role;
