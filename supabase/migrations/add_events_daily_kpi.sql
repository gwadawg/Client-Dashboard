-- Daily per-client KPI numerators (materialized).
-- Used for closed date ranges so dashboard_kpi_counts can sum pre-aggregated days.
-- Unique-rate fields (unique_*) are approximate when summed across days (same lead
-- on two days can double-count). Read path only uses this for date ranges that are
-- fully covered AND prefers live RPC when the range includes "today".
-- Refresh via refresh_events_daily_kpi() from cron / admin.

CREATE TABLE IF NOT EXISTS public.events_daily_kpi (
  bucket_date date NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  new_leads integer NOT NULL DEFAULT 0,
  qualified_leads integer NOT NULL DEFAULT 0,
  hot_leads integer NOT NULL DEFAULT 0,
  out_of_state_leads integer NOT NULL DEFAULT 0,
  booked_appointments integer NOT NULL DEFAULT 0,
  appointment_cancelled integer NOT NULL DEFAULT 0,
  appointment_rescheduled integer NOT NULL DEFAULT 0,
  shows integer NOT NULL DEFAULT 0,
  no_shows integer NOT NULL DEFAULT 0,
  lo_bailed integer NOT NULL DEFAULT 0,
  loan_processing integer NOT NULL DEFAULT 0,
  outbound_dials integer NOT NULL DEFAULT 0,
  pickups integer NOT NULL DEFAULT 0,
  conversations integer NOT NULL DEFAULT 0,
  callbacks integer NOT NULL DEFAULT 0,
  live_transfers integer NOT NULL DEFAULT 0,
  claimed integer NOT NULL DEFAULT 0,
  proposals_sent integer NOT NULL DEFAULT 0,
  closed integer NOT NULL DEFAULT 0,
  -- Day-local unique counts (NOT cross-day unique). Summed only for volume-style KPIs
  -- in app when using this table; unique_* rates still come from live RPC.
  unique_booked_appointments integer NOT NULL DEFAULT 0,
  unique_hand_raises integer NOT NULL DEFAULT 0,
  unique_conversations integer NOT NULL DEFAULT 0,
  billable_conversations integer NOT NULL DEFAULT 0,
  claimed_after_booked integer NOT NULL DEFAULT 0,
  unique_booked_converted integer NOT NULL DEFAULT 0,
  proposals_made integer NOT NULL DEFAULT 0,
  submissions_made integer NOT NULL DEFAULT 0,
  funded_loans integer NOT NULL DEFAULT 0,
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (bucket_date, client_id)
);

CREATE INDEX IF NOT EXISTS events_daily_kpi_client_date_idx
  ON public.events_daily_kpi (client_id, bucket_date);

CREATE TABLE IF NOT EXISTS public.events_daily_kpi_coverage (
  bucket_date date PRIMARY KEY,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.events_daily_kpi IS
  'Per-client per-UTC-day KPI numerators; refresh_events_daily_kpi maintains rows.';

-- Rebuild one inclusive UTC date range from events (same filters as dashboard_kpi_counts_by_client).
CREATE OR REPLACE FUNCTION public.refresh_events_daily_kpi(
  p_start date,
  p_end date
)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_start timestamptz := p_start::timestamptz;
  v_end timestamptz := (p_end + 1)::timestamptz - interval '1 millisecond';
  v_rows integer;
BEGIN
  IF p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN
    RAISE EXCEPTION 'refresh_events_daily_kpi requires p_start <= p_end';
  END IF;

  DELETE FROM public.events_daily_kpi
  WHERE bucket_date >= p_start AND bucket_date <= p_end;

  WITH scoped AS (
    SELECT
      (e.occurred_at AT TIME ZONE 'UTC')::date AS bucket_date,
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
      AND e.occurred_at >= v_start
      AND e.occurred_at <= v_end
      AND e.client_id IS NOT NULL
  ),
  dial_stats AS (
    SELECT
      (e.occurred_at AT TIME ZONE 'UTC')::date AS bucket_date,
      e.client_id,
      COUNT(*)::integer AS outbound_dials,
      COUNT(*) FILTER (WHERE e.is_pickup IS TRUE)::integer AS pickups,
      COUNT(*) FILTER (WHERE e.is_conversation IS TRUE)::integer AS conversations
    FROM public.events e
    WHERE e.event_type = 'dial'
      AND e.occurred_at >= v_start
      AND e.occurred_at <= v_end
      AND e.client_id IS NOT NULL
    GROUP BY 1, 2
  ),
  earliest_book AS (
    SELECT bucket_date, client_id, lead_key, MIN(occurred_at) AS first_book
    FROM scoped
    WHERE event_type = 'appointment_booked' AND lead_key IS NOT NULL
    GROUP BY 1, 2, 3
  ),
  earliest_claim AS (
    SELECT bucket_date, client_id, lead_key, MIN(occurred_at) AS first_claim
    FROM scoped
    WHERE event_type = 'claimed' AND lead_key IS NOT NULL
    GROUP BY 1, 2, 3
  ),
  claimed_after AS (
    SELECT
      b.bucket_date,
      b.client_id,
      COUNT(*)::integer AS claimed_after_booked
    FROM earliest_book b
    INNER JOIN earliest_claim c
      ON c.bucket_date = b.bucket_date
     AND c.client_id = b.client_id
     AND c.lead_key = b.lead_key
    WHERE c.first_claim > b.first_book
    GROUP BY 1, 2
  ),
  booked_converted AS (
    SELECT
      b.bucket_date,
      b.client_id,
      COUNT(DISTINCT b.lead_key)::integer AS unique_booked_converted
    FROM (
      SELECT DISTINCT bucket_date, client_id, lead_key
      FROM scoped
      WHERE event_type = 'appointment_booked' AND lead_key IS NOT NULL
    ) b
    INNER JOIN (
      SELECT DISTINCT bucket_date, client_id, lead_key
      FROM scoped
      WHERE event_type IN ('show', 'claimed', 'live_transfer') AND lead_key IS NOT NULL
    ) s
      ON s.bucket_date = b.bucket_date
     AND s.client_id = b.client_id
     AND s.lead_key = b.lead_key
    GROUP BY 1, 2
  ),
  kpi AS (
    SELECT
      s.bucket_date,
      s.client_id,
      COUNT(*) FILTER (WHERE s.event_type = 'lead')::integer AS new_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_qualified IS TRUE)::integer AS qualified_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_hot IS TRUE)::integer AS hot_leads,
      (
        COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_out_of_state IS TRUE)
        + COUNT(*) FILTER (WHERE s.event_type = 'out_of_state_lead')
      )::integer AS out_of_state_leads,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_booked')::integer AS booked_appointments,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_cancelled')::integer AS appointment_cancelled,
      COUNT(*) FILTER (WHERE s.event_type = 'appointment_rescheduled')::integer AS appointment_rescheduled,
      COUNT(*) FILTER (WHERE s.event_type = 'show')::integer AS shows,
      COUNT(*) FILTER (WHERE s.event_type = 'no_show')::integer AS no_shows,
      COUNT(*) FILTER (WHERE s.event_type = 'lo_bailed')::integer AS lo_bailed,
      COUNT(*) FILTER (WHERE s.event_type IN ('submission_made', 'loan_processing'))::integer AS loan_processing,
      COUNT(*) FILTER (WHERE s.event_type = 'callback_booked')::integer AS callbacks,
      COUNT(*) FILTER (WHERE s.event_type = 'live_transfer')::integer AS live_transfers,
      COUNT(*) FILTER (WHERE s.event_type = 'claimed')::integer AS claimed,
      COUNT(*) FILTER (WHERE s.event_type IN ('proposal_made', 'proposal_sent'))::integer AS proposals_sent,
      COUNT(*) FILTER (WHERE s.event_type IN ('loan_funded', 'closed'))::integer AS closed,
      COUNT(DISTINCT s.lead_key) FILTER (WHERE s.event_type = 'appointment_booked')::integer AS unique_booked_appointments,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('appointment_booked', 'live_transfer', 'claimed')
      )::integer AS unique_hand_raises,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
      )::integer AS unique_conversations,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('show', 'live_transfer')
      )::integer AS billable_conversations,
      COALESCE((
        SELECT ca.claimed_after_booked FROM claimed_after ca
        WHERE ca.bucket_date = s.bucket_date AND ca.client_id = s.client_id
      ), 0) AS claimed_after_booked,
      COALESCE((
        SELECT bc.unique_booked_converted FROM booked_converted bc
        WHERE bc.bucket_date = s.bucket_date AND bc.client_id = s.client_id
      ), 0) AS unique_booked_converted,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN (
          'proposal_made', 'proposal_sent',
          'submission_made', 'loan_processing',
          'loan_funded', 'closed'
        )
      )::integer AS proposals_made,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN (
          'submission_made', 'loan_processing',
          'loan_funded', 'closed'
        )
      )::integer AS submissions_made,
      COUNT(DISTINCT s.lead_key) FILTER (
        WHERE s.event_type IN ('loan_funded', 'closed')
      )::integer AS funded_loans
    FROM scoped s
    GROUP BY s.bucket_date, s.client_id
  )
  INSERT INTO public.events_daily_kpi (
    bucket_date, client_id,
    new_leads, qualified_leads, hot_leads, out_of_state_leads,
    booked_appointments, appointment_cancelled, appointment_rescheduled,
    shows, no_shows, lo_bailed, loan_processing,
    outbound_dials, pickups, conversations,
    callbacks, live_transfers, claimed, proposals_sent, closed,
    unique_booked_appointments, unique_hand_raises, unique_conversations,
    billable_conversations, claimed_after_booked, unique_booked_converted,
    proposals_made, submissions_made, funded_loans,
    refreshed_at
  )
  SELECT
    COALESCE(k.bucket_date, d.bucket_date),
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
    COALESCE(k.funded_loans, 0),
    now()
  FROM kpi k
  FULL OUTER JOIN dial_stats d
    ON d.bucket_date = k.bucket_date AND d.client_id = k.client_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  INSERT INTO public.events_daily_kpi_coverage (bucket_date, refreshed_at)
  SELECT d::date, now()
  FROM generate_series(p_start, p_end, interval '1 day') AS d
  ON CONFLICT (bucket_date) DO UPDATE
    SET refreshed_at = EXCLUDED.refreshed_at;

  RETURN v_rows;
END;
$$;

COMMENT ON FUNCTION public.refresh_events_daily_kpi(date, date) IS
  'Rebuild events_daily_kpi + coverage for inclusive UTC dates; returns inserted row count.';

-- Sum volume-safe numerators for a closed window (unique_* are day-local — do not use for rates).
CREATE OR REPLACE FUNCTION public.dashboard_kpi_counts_from_daily(
  p_client_ids uuid[] DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT jsonb_build_object(
    'new_leads', COALESCE(SUM(new_leads), 0),
    'qualified_leads', COALESCE(SUM(qualified_leads), 0),
    'hot_leads', COALESCE(SUM(hot_leads), 0),
    'out_of_state_leads', COALESCE(SUM(out_of_state_leads), 0),
    'booked_appointments', COALESCE(SUM(booked_appointments), 0),
    'appointment_cancelled', COALESCE(SUM(appointment_cancelled), 0),
    'appointment_rescheduled', COALESCE(SUM(appointment_rescheduled), 0),
    'shows', COALESCE(SUM(shows), 0),
    'no_shows', COALESCE(SUM(no_shows), 0),
    'lo_bailed', COALESCE(SUM(lo_bailed), 0),
    'loan_processing', COALESCE(SUM(loan_processing), 0),
    'outbound_dials', COALESCE(SUM(outbound_dials), 0),
    'pickups', COALESCE(SUM(pickups), 0),
    'conversations', COALESCE(SUM(conversations), 0),
    'callbacks', COALESCE(SUM(callbacks), 0),
    'live_transfers', COALESCE(SUM(live_transfers), 0),
    'claimed', COALESCE(SUM(claimed), 0),
    'proposals_sent', COALESCE(SUM(proposals_sent), 0),
    'closed', COALESCE(SUM(closed), 0),
    -- Day-local uniques summed — ONLY safe as volume proxies; live RPC for rates.
    'unique_booked_appointments', COALESCE(SUM(unique_booked_appointments), 0),
    'unique_hand_raises', COALESCE(SUM(unique_hand_raises), 0),
    'unique_conversations', COALESCE(SUM(unique_conversations), 0),
    'billable_conversations', COALESCE(SUM(billable_conversations), 0),
    'claimed_after_booked', COALESCE(SUM(claimed_after_booked), 0),
    'unique_booked_converted', COALESCE(SUM(unique_booked_converted), 0),
    'proposals_made', COALESCE(SUM(proposals_made), 0),
    'submissions_made', COALESCE(SUM(submissions_made), 0),
    'funded_loans', COALESCE(SUM(funded_loans), 0),
    'from_daily', true
  )
  FROM public.events_daily_kpi d
  WHERE (p_start IS NULL OR d.bucket_date >= p_start)
    AND (p_end IS NULL OR d.bucket_date <= p_end)
    AND (p_client_ids IS NULL OR d.client_id = ANY (p_client_ids));
$$;

-- True when every UTC day in [p_start, p_end] has been refreshed.
CREATE OR REPLACE FUNCTION public.events_daily_kpi_range_covered(
  p_start date,
  p_end date
)
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_start IS NULL OR p_end IS NULL OR p_end < p_start THEN false
    ELSE (
      SELECT COUNT(*)::integer
      FROM public.events_daily_kpi_coverage c
      WHERE c.bucket_date >= p_start AND c.bucket_date <= p_end
    ) = (p_end - p_start + 1)
  END;
$$;

REVOKE ALL ON FUNCTION public.refresh_events_daily_kpi(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_kpi_counts_from_daily(uuid[], date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.events_daily_kpi_range_covered(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_events_daily_kpi(date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_counts_from_daily(uuid[], date, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.events_daily_kpi_range_covered(date, date) TO service_role;

-- Exact counts cache for closed calendar windows (preserves unique-lead math).
CREATE TABLE IF NOT EXISTS public.metrics_range_cache (
  cache_key text PRIMARY KEY,
  start_date date NOT NULL,
  end_date date NOT NULL,
  client_scope text NOT NULL DEFAULT '',
  counts jsonb NOT NULL,
  refreshed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS metrics_range_cache_window_idx
  ON public.metrics_range_cache (start_date, end_date);

COMMENT ON TABLE public.metrics_range_cache IS
  'Exact dashboard_kpi_counts payloads for closed UTC windows; unique rates stay correct.';

-- BRIN for large occurred_at range scans.
-- Full RANGE partitioning deferred: events ~121k rows / ~131MB (2026-09) — rewrite risk > benefit.
CREATE INDEX IF NOT EXISTS events_occurred_at_brin
  ON public.events USING brin (occurred_at)
  WITH (pages_per_range = 32);
