-- Overdue undispositioned appointment count + per-client KPI counts for Client Health.
-- Mirrors src/lib/appointments.ts matchOutcome and dashboard_kpi_counts (per client).

CREATE INDEX IF NOT EXISTS events_scheduled_at_idx
  ON public.events (scheduled_at)
  WHERE scheduled_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_outcome_external_id_idx
  ON public.events (external_id)
  WHERE event_type IN ('show', 'no_show', 'appointment_cancelled', 'lo_bailed')
    AND external_id IS NOT NULL;

-- Past-due bookings with no matching show / no_show / cancel / lo_bail.
-- Match order mirrors matchOutcome(): external_id → raw.appointment_event_id → contact+time.
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
    WHERE e.event_type IN ('show', 'no_show', 'appointment_cancelled', 'lo_bailed')
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
  'Count past-due appointment_booked rows with no matching outcome; mirrors countOverdueUndispositioned';

REVOKE ALL ON FUNCTION public.count_overdue_undispositioned(uuid[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.count_overdue_undispositioned(uuid[], timestamptz) TO service_role;

-- Same numerators as dashboard_kpi_counts, grouped by client_id.
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
      e.is_qualified,
      e.is_hot,
      e.is_out_of_state,
      e.is_pickup,
      e.is_conversation,
      public.event_lead_key(
        e.client_id, e.ghl_contact_id, e.lead_phone, e.lead_email, e.lead_name
      ) AS lead_key
    FROM public.events e
    WHERE (p_start IS NULL OR e.occurred_at >= p_start)
      AND (p_end IS NULL OR e.occurred_at <= p_end)
      AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
  )
  SELECT
    s.client_id,
    COUNT(*) FILTER (WHERE s.event_type = 'lead'),
    COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_qualified IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_hot IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_out_of_state IS TRUE)
      + COUNT(*) FILTER (WHERE s.event_type = 'out_of_state_lead'),
    COUNT(*) FILTER (WHERE s.event_type = 'appointment_booked'),
    COUNT(*) FILTER (WHERE s.event_type = 'appointment_cancelled'),
    COUNT(*) FILTER (WHERE s.event_type = 'show'),
    COUNT(*) FILTER (WHERE s.event_type = 'no_show'),
    COUNT(*) FILTER (WHERE s.event_type = 'lo_bailed'),
    COUNT(*) FILTER (WHERE s.event_type IN ('submission_made', 'loan_processing')),
    COUNT(*) FILTER (WHERE s.event_type = 'dial'),
    COUNT(*) FILTER (WHERE s.event_type = 'dial' AND s.is_pickup IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'dial' AND s.is_conversation IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'callback_booked'),
    COUNT(*) FILTER (WHERE s.event_type = 'live_transfer'),
    COUNT(*) FILTER (WHERE s.event_type = 'claimed'),
    COUNT(*) FILTER (WHERE s.event_type IN ('proposal_made', 'proposal_sent')),
    COUNT(*) FILTER (WHERE s.event_type IN ('loan_funded', 'closed')),
    COUNT(DISTINCT s.lead_key) FILTER (WHERE s.event_type = 'appointment_booked'),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN ('appointment_booked', 'live_transfer', 'claimed')
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN (
        'proposal_made', 'proposal_sent',
        'submission_made', 'loan_processing',
        'loan_funded', 'closed'
      )
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN (
        'submission_made', 'loan_processing',
        'loan_funded', 'closed'
      )
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN ('loan_funded', 'closed')
    )
  FROM scoped s
  WHERE s.client_id IS NOT NULL
  GROUP BY s.client_id;
$$;

COMMENT ON FUNCTION public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) IS
  'Per-client KPI numerators for Client Health / Ops; same fields as dashboard_kpi_counts';

REVOKE ALL ON FUNCTION public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz) TO service_role;

-- Fresh-launch window counts: each client's [launch_date, min(today, launch+13d)].
CREATE OR REPLACE FUNCTION public.fresh_launch_kpi_counts_by_client(
  p_client_ids uuid[] DEFAULT NULL,
  p_today date DEFAULT (timezone('utc', now()))::date,
  p_fresh_days integer DEFAULT 14
)
RETURNS TABLE (
  client_id uuid,
  launch_date date,
  window_start date,
  window_end date,
  new_leads bigint,
  qualified_leads bigint,
  hot_leads bigint,
  out_of_state_leads bigint,
  booked_appointments bigint,
  appointment_cancelled bigint,
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
  proposals_made bigint,
  submissions_made bigint,
  funded_loans bigint
)
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  WITH fresh_clients AS (
    SELECT
      c.id AS client_id,
      c.launch_date::date AS launch_date,
      c.launch_date::date AS window_start,
      LEAST(
        p_today,
        (c.launch_date::date + (p_fresh_days - 1))
      ) AS window_end
    FROM public.clients c
    WHERE c.launch_date IS NOT NULL
      AND c.launch_date::date <= p_today
      AND (p_today - c.launch_date::date) < p_fresh_days
      AND (p_client_ids IS NULL OR c.id = ANY (p_client_ids))
  ),
  scoped AS (
    SELECT
      f.client_id,
      f.launch_date,
      f.window_start,
      f.window_end,
      e.event_type,
      e.is_qualified,
      e.is_hot,
      e.is_out_of_state,
      e.is_pickup,
      e.is_conversation,
      public.event_lead_key(
        e.client_id, e.ghl_contact_id, e.lead_phone, e.lead_email, e.lead_name
      ) AS lead_key
    FROM fresh_clients f
    JOIN public.events e ON e.client_id = f.client_id
    WHERE e.occurred_at >= (f.window_start::timestamp AT TIME ZONE 'UTC')
      AND e.occurred_at <= (f.window_end::timestamp AT TIME ZONE 'UTC' + interval '1 day' - interval '1 millisecond')
  )
  SELECT
    s.client_id,
    s.launch_date,
    s.window_start,
    s.window_end,
    COUNT(*) FILTER (WHERE s.event_type = 'lead'),
    COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_qualified IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_hot IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_out_of_state IS TRUE)
      + COUNT(*) FILTER (WHERE s.event_type = 'out_of_state_lead'),
    COUNT(*) FILTER (WHERE s.event_type = 'appointment_booked'),
    COUNT(*) FILTER (WHERE s.event_type = 'appointment_cancelled'),
    COUNT(*) FILTER (WHERE s.event_type = 'show'),
    COUNT(*) FILTER (WHERE s.event_type = 'no_show'),
    COUNT(*) FILTER (WHERE s.event_type = 'lo_bailed'),
    COUNT(*) FILTER (WHERE s.event_type IN ('submission_made', 'loan_processing')),
    COUNT(*) FILTER (WHERE s.event_type = 'dial'),
    COUNT(*) FILTER (WHERE s.event_type = 'dial' AND s.is_pickup IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'dial' AND s.is_conversation IS TRUE),
    COUNT(*) FILTER (WHERE s.event_type = 'callback_booked'),
    COUNT(*) FILTER (WHERE s.event_type = 'live_transfer'),
    COUNT(*) FILTER (WHERE s.event_type = 'claimed'),
    COUNT(*) FILTER (WHERE s.event_type IN ('proposal_made', 'proposal_sent')),
    COUNT(*) FILTER (WHERE s.event_type IN ('loan_funded', 'closed')),
    COUNT(DISTINCT s.lead_key) FILTER (WHERE s.event_type = 'appointment_booked'),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN ('appointment_booked', 'live_transfer', 'claimed')
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN (
        'proposal_made', 'proposal_sent',
        'submission_made', 'loan_processing',
        'loan_funded', 'closed'
      )
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN (
        'submission_made', 'loan_processing',
        'loan_funded', 'closed'
      )
    ),
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN ('loan_funded', 'closed')
    )
  FROM scoped s
  GROUP BY s.client_id, s.launch_date, s.window_start, s.window_end;
$$;

COMMENT ON FUNCTION public.fresh_launch_kpi_counts_by_client(uuid[], date, integer) IS
  'Per-client KPI counts for clients still inside the fresh-launch window';

REVOKE ALL ON FUNCTION public.fresh_launch_kpi_counts_by_client(uuid[], date, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fresh_launch_kpi_counts_by_client(uuid[], date, integer) TO service_role;
