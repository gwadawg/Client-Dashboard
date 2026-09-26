-- Split dial aggregates out of dashboard_kpi_* scoped CTEs.
-- Dial volume dominates events; unique-lead / booking / show math never needs dial rows.
-- outbound_dials / pickups / conversations stay identical via a narrow dial_stats CTE.

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
      AND (p_start IS NULL OR e.occurred_at >= p_start)
      AND (p_end IS NULL OR e.occurred_at <= p_end)
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
  ),
  dial_stats AS (
    SELECT
      COUNT(*)::bigint AS outbound_dials,
      COUNT(*) FILTER (WHERE e.is_pickup IS TRUE)::bigint AS pickups,
      COUNT(*) FILTER (WHERE e.is_conversation IS TRUE)::bigint AS conversations
    FROM public.events e
    WHERE e.event_type = 'dial'
      AND (p_start IS NULL OR e.occurred_at >= p_start)
      AND (p_end IS NULL OR e.occurred_at <= p_end)
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
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
    'unique_conversations',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN ('show', 'claimed', 'live_transfer')
      ),
    'billable_conversations',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN ('show', 'live_transfer')
      ),
    'claimed_after_booked',
      (SELECT claimed_after_booked FROM claimed_after),
    'unique_booked_converted',
      (SELECT unique_booked_converted FROM booked_converted),
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
  'Dashboard KPI numerators; dials aggregated separately from scoped (non-dial) CTE.';

CREATE OR REPLACE FUNCTION public.dashboard_kpi_counts_by_client(
  p_client_ids uuid[] DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL
)
RETURNS TABLE (
  client_id uuid,
  new_leads bigint,
  qualified_leads bigint,
  hot_leads bigint,
  out_of_state_leads bigint,
  booked_appointments bigint,
  appointment_cancelled bigint,
  appointment_rescheduled bigint,
  shows bigint,
  no_shows bigint,
  lo_bailed bigint,
  loan_processing bigint,
  outbound_dials bigint,
  pickups bigint,
  conversations bigint,
  callbacks bigint,
  live_transfers bigint,
  claimed bigint,
  proposals_sent bigint,
  closed bigint,
  unique_booked_appointments bigint,
  unique_hand_raises bigint,
  unique_conversations bigint,
  billable_conversations bigint,
  claimed_after_booked bigint,
  unique_booked_converted bigint,
  proposals_made bigint,
  submissions_made bigint,
  funded_loans bigint
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH scoped AS (
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
      AND (p_start IS NULL OR e.occurred_at >= p_start)
      AND (p_end IS NULL OR e.occurred_at <= p_end)
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
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
      AND (p_start IS NULL OR e.occurred_at >= p_start)
      AND (p_end IS NULL OR e.occurred_at <= p_end)
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
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
    COALESCE(k.client_id, d.client_id),
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
    COALESCE(k.unique_conversations, 0),
    COALESCE(k.billable_conversations, 0),
    COALESCE(k.claimed_after_booked, 0),
    COALESCE(k.unique_booked_converted, 0),
    COALESCE(k.proposals_made, 0),
    COALESCE(k.submissions_made, 0),
    COALESCE(k.funded_loans, 0)
  FROM kpi k
  FULL OUTER JOIN dial_stats d ON d.client_id = k.client_id
  WHERE COALESCE(k.client_id, d.client_id) IS NOT NULL;
$$;

COMMENT ON FUNCTION public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) IS
  'Per-client KPI numerators; dials aggregated separately so dial-only clients still appear.';

REVOKE ALL ON FUNCTION public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) TO service_role;
