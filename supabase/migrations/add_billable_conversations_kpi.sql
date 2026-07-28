-- Call Center billable conversations + claimed-after-booked for dashboard_kpi_counts.
-- Billable = unique leads with show ∪ live_transfer (claimed excluded).
-- Claimed after booked = unique leads where earliest claim > earliest book in range.

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
    'billable_conversations',
      COUNT(DISTINCT lead_key) FILTER (
        WHERE event_type IN ('show', 'live_transfer')
      ),
    'claimed_after_booked',
      (SELECT claimed_after_booked FROM claimed_after),
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
  'Dashboard KPI numerators; includes billable_conversations (show∪LT) and claimed_after_booked.';
