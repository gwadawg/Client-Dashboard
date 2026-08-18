-- Per-client day/week numerators for Client Compare cost history.
-- Unlike dashboard_kpi_timeline, this keeps client_id so each account
-- can be plotted as its own CPL / CPQL / CPConv line.

CREATE OR REPLACE FUNCTION public.dashboard_kpi_timeline_by_client(
  p_client_ids uuid[] DEFAULT NULL,
  p_start date DEFAULT NULL,
  p_end date DEFAULT NULL,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE (
  client_id uuid,
  bucket_date date,
  leads bigint,
  qualified_leads bigint,
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
  scoped AS (
    SELECT
      e.client_id,
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
  )
  SELECT
    s.client_id,
    s.bucket_date,
    COUNT(*) FILTER (WHERE s.event_type = 'lead')::bigint AS leads,
    COUNT(*) FILTER (WHERE s.event_type = 'lead' AND s.is_qualified IS TRUE)::bigint AS qualified_leads,
    COUNT(DISTINCT s.lead_key) FILTER (
      WHERE s.event_type IN ('show', 'claimed', 'live_transfer')
    )::bigint AS unique_conversation_leads
  FROM scoped s
  GROUP BY s.client_id, s.bucket_date
  ORDER BY s.client_id, s.bucket_date;
$$;

COMMENT ON FUNCTION public.dashboard_kpi_timeline_by_client(uuid[], date, date, text) IS
  'Per-client day or week lead / qualified / unique-conversation counts for cost-history charts';

REVOKE ALL ON FUNCTION public.dashboard_kpi_timeline_by_client(uuid[], date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dashboard_kpi_timeline_by_client(uuid[], date, date, text) TO service_role;
