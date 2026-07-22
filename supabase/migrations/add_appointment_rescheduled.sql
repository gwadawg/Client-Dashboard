-- Reschedule disposition for client-fulfillment appointments.
-- When a lead rebooks (new GHL appointment id), the prior pending booking is
-- marked appointment_rescheduled so it drops out of pending / overdue / appts
-- to take place, while absolute Appointments Booked stays an event count.

ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (
  event_type IN (
    'dial', 'lead', 'appointment_booked', 'appointment_cancelled', 'appointment_rescheduled',
    'show', 'no_show', 'callback_booked',
    'live_transfer', 'proposal_sent', 'loan_processing', 'closed',
    'proposal_made', 'submission_made', 'loan_funded',
    'out_of_state_lead',
    'lo_bailed', 'lo_audit', 'claimed',
    'manual_dq'
  )
);

DROP INDEX IF EXISTS public.events_outcome_external_id_idx;
CREATE INDEX events_outcome_external_id_idx
  ON public.events (external_id)
  WHERE event_type IN (
    'show', 'no_show', 'appointment_cancelled', 'appointment_rescheduled', 'lo_bailed'
  )
  AND external_id IS NOT NULL;

-- Overdue count must treat rescheduled as dispositioned.
CREATE OR REPLACE FUNCTION public.count_overdue_undispositioned(
  p_client_ids uuid[] DEFAULT NULL,
  p_as_of timestamptz DEFAULT now()
)
RETURNS bigint
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH bookings AS (
    SELECT
      e.id,
      e.external_id,
      e.ghl_contact_id,
      e.scheduled_at,
      (EXTRACT(EPOCH FROM e.scheduled_at) * 1000)::bigint AS sched_ms
    FROM public.events e
    WHERE e.event_type = 'appointment_booked'
      AND e.scheduled_at IS NOT NULL
      AND e.scheduled_at < p_as_of
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
  ),
  outcomes AS (
    SELECT
      e.external_id,
      e.ghl_contact_id,
      e.scheduled_at,
      nullif(e.raw->>'appointment_event_id', '') AS appointment_event_id,
      CASE
        WHEN e.scheduled_at IS NOT NULL
        THEN (EXTRACT(EPOCH FROM e.scheduled_at) * 1000)::bigint
        ELSE NULL
      END AS sched_ms
    FROM public.events e
    WHERE e.event_type IN (
      'show', 'no_show', 'appointment_cancelled', 'appointment_rescheduled', 'lo_bailed'
    )
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
  )
  SELECT COUNT(*)::bigint
  FROM bookings b
  WHERE NOT EXISTS (
    SELECT 1 FROM outcomes o
    WHERE (
      b.external_id IS NOT NULL
      AND o.external_id IS NOT NULL
      AND b.external_id = o.external_id
    )
    OR (
      o.appointment_event_id IS NOT NULL
      AND o.appointment_event_id = b.id::text
    )
    OR (
      b.ghl_contact_id IS NOT NULL
      AND o.ghl_contact_id IS NOT NULL
      AND b.sched_ms IS NOT NULL
      AND o.sched_ms IS NOT NULL
      AND b.ghl_contact_id = o.ghl_contact_id
      AND b.sched_ms = o.sched_ms
    )
  );
$$;

COMMENT ON FUNCTION public.count_overdue_undispositioned(uuid[], timestamptz) IS
  'Count past-due appointment_booked rows with no matching outcome (incl. rescheduled)';

-- Include rescheduled in dashboard KPI aggregates (appts_to_take_place subtracts it in app).
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
