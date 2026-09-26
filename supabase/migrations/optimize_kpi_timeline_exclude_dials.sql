-- Timeline KPIs never use dial rows (only lead/booking/show/claim types).
-- Excluding dials (~88% of recent events) keeps all-clients month views under
-- statement timeout when counts + timeline + STL run together.

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
SET statement_timeout TO '60s'
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
  'Day/week KPI numerators for trends; dials excluded (unused); unique counts per bucket.';

-- Give the heavy all-clients counts / STL paths room when they are not parallelized.
ALTER FUNCTION public.dashboard_kpi_counts(uuid[], timestamptz, timestamptz)
  SET statement_timeout TO '60s';
ALTER FUNCTION public.dashboard_speed_to_lead_summary(uuid[], timestamptz, timestamptz, text, boolean, integer, integer)
  SET statement_timeout TO '60s';
ALTER FUNCTION public.dashboard_kpi_counts_by_client(uuid[], timestamptz, timestamptz)
  SET statement_timeout TO '60s';
