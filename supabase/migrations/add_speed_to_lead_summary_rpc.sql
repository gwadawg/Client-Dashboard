-- Speed-to-lead summary in Postgres (dashboard metrics hot path).
-- Mirrors src/lib/speed-to-lead.ts computeSpeedToLead for summary fields only.
-- Optimized plpgsql + temp staging.

CREATE OR REPLACE FUNCTION public.stl_normalize_phone(p_phone text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN digits IS NULL OR digits = '' THEN ''
    WHEN length(digits) = 11 AND left(digits, 1) = '1' THEN substr(digits, 2)
    ELSE digits
  END
  FROM (
    SELECT nullif(regexp_replace(coalesce(p_phone, ''), '\D', '', 'g'), '') AS digits
  ) s;
$$;

COMMENT ON FUNCTION public.stl_normalize_phone(text) IS
  'Digits-only phone; strip leading US 1 on 11-digit — mirrors src/lib/contact-key.ts normalizePhone';

CREATE OR REPLACE FUNCTION public.stl_contact_key(
  p_client_id uuid,
  p_ghl_contact_id text,
  p_lead_phone text,
  p_phone_number_used text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(p_ghl_contact_id, '')), '') IS NOT NULL THEN
      btrim(p_ghl_contact_id)
    WHEN nullif(public.stl_normalize_phone(coalesce(p_lead_phone, p_phone_number_used)), '') IS NOT NULL THEN
      'ldr:' || p_client_id::text || ':' ||
        public.stl_normalize_phone(coalesce(p_lead_phone, p_phone_number_used))
    ELSE
      'ldr:' || p_client_id::text || ':unknown'
  END;
$$;

COMMENT ON FUNCTION public.stl_contact_key(uuid, text, text, text) IS
  'STL pairing key — mirrors buildContactKey(clientId, eventPhone(row), ghl_contact_id)';

CREATE OR REPLACE FUNCTION public.stl_parse_hhmm_minutes(p_time text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_time IS NULL OR btrim(p_time) = '' THEN NULL
    WHEN btrim(p_time) ~ '^\d{1,2}:\d{2}(:\d{2})?$' THEN
      (split_part(btrim(p_time), ':', 1)::int * 60)
      + split_part(btrim(p_time), ':', 2)::int
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.dashboard_speed_to_lead_summary(
  p_client_ids uuid[] DEFAULT NULL,
  p_start timestamptz DEFAULT NULL,
  p_end timestamptz DEFAULT NULL,
  p_time_zone text DEFAULT 'America/Sao_Paulo',
  p_ignore_availability boolean DEFAULT false,
  p_lead_after_min integer DEFAULT NULL,
  p_lead_before_min integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_tz text := coalesce(nullif(btrim(p_time_zone), ''), 'America/Sao_Paulo');
  v_apply_availability boolean;
  v_live_window_count integer;
  v_sample_size integer;
  v_median_seconds double precision;
  v_excl_off integer;
  v_excl_no_time integer;
  v_excl_before integer;
  v_excl_after integer;
BEGIN
  DROP TABLE IF EXISTS stl_windows;
  DROP TABLE IF EXISTS stl_events;
  DROP TABLE IF EXISTS stl_included;
  DROP TABLE IF EXISTS stl_excluded;

  CREATE TEMP TABLE stl_windows (
    weekday_num int NOT NULL,
    start_min int NOT NULL,
    end_min int NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO stl_windows (weekday_num, start_min, end_min)
  SELECT w.weekday_num, w.start_min, w.end_min
  FROM (
    SELECT
      CASE lower(btrim(sa.weekday))
        WHEN 'sunday' THEN 0 WHEN 'monday' THEN 1 WHEN 'tuesday' THEN 2
        WHEN 'wednesday' THEN 3 WHEN 'thursday' THEN 4 WHEN 'friday' THEN 5
        WHEN 'saturday' THEN 6 ELSE NULL
      END AS weekday_num,
      public.stl_parse_hhmm_minutes(sa.time_start) AS start_min,
      public.stl_parse_hhmm_minutes(sa.time_end) AS end_min
    FROM public.setter_availability sa
    WHERE sa.is_live = true
  ) w
  WHERE w.weekday_num IS NOT NULL
    AND w.start_min IS NOT NULL
    AND w.end_min IS NOT NULL
    AND w.end_min > w.start_min;

  SELECT count(*)::int INTO v_live_window_count FROM stl_windows;
  v_apply_availability := v_live_window_count > 0 AND NOT coalesce(p_ignore_availability, false);

  CREATE TEMP TABLE stl_events (
    event_type text NOT NULL,
    contact_key text NOT NULL,
    occurred_at timestamptz NOT NULL,
    occurred_at_has_time boolean,
    lead_created_at timestamptz
  ) ON COMMIT DROP;

  INSERT INTO stl_events (event_type, contact_key, occurred_at, occurred_at_has_time, lead_created_at)
  SELECT
    e.event_type,
    public.stl_contact_key(e.client_id, e.ghl_contact_id, e.lead_phone, e.phone_number_used),
    e.occurred_at,
    e.occurred_at_has_time,
    e.lead_created_at
  FROM public.events e
  WHERE e.event_type IN ('lead', 'dial')
    AND e.client_id IS NOT NULL
    AND (p_client_ids IS NULL OR e.client_id = ANY (p_client_ids))
    AND (p_start IS NULL OR e.occurred_at >= p_start)
    AND (p_end IS NULL OR e.occurred_at <= p_end);

  CREATE INDEX stl_events_type_key_at ON stl_events (event_type, contact_key, occurred_at);

  CREATE TEMP TABLE stl_included (
    seconds double precision NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE stl_excluded (
    reason text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO stl_included (seconds)
  SELECT extract(epoch FROM (d.dial_at - x.lead_at))
  FROM (
    SELECT DISTINCT ON (contact_key)
      contact_key,
      occurred_at AS dial_at,
      occurred_at_has_time AS dial_has_time,
      lead_created_at
    FROM stl_events
    WHERE event_type = 'dial'
    ORDER BY contact_key, occurred_at ASC
  ) d
  LEFT JOIN LATERAL (
    SELECT
      CASE
        WHEN d.lead_created_at IS NOT NULL THEN d.lead_created_at
        ELSE l.lead_occurred_at
      END AS lead_at,
      CASE
        WHEN d.lead_created_at IS NOT NULL THEN true
        ELSE (l.lead_has_time IS DISTINCT FROM false)
      END AS lead_precise
    FROM (
      SELECT occurred_at AS lead_occurred_at, occurred_at_has_time AS lead_has_time
      FROM stl_events
      WHERE event_type = 'lead' AND contact_key = d.contact_key
      ORDER BY occurred_at ASC
      LIMIT 1
    ) l
  ) x ON true
  WHERE x.lead_at IS NOT NULL
    AND d.dial_at > x.lead_at
    AND x.lead_precise
    AND (d.dial_has_time IS DISTINCT FROM false)
    AND (
      NOT v_apply_availability
      OR EXISTS (
        SELECT 1
        FROM stl_windows w
        WHERE w.weekday_num = extract(dow FROM timezone(v_tz, x.lead_at))::int
          AND (
            extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
            + extract(minute FROM timezone(v_tz, x.lead_at))::int
          ) >= w.start_min
          AND (
            extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
            + extract(minute FROM timezone(v_tz, x.lead_at))::int
          ) < w.end_min
      )
    )
    AND (p_lead_after_min IS NULL OR (
      extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
      + extract(minute FROM timezone(v_tz, x.lead_at))::int
    ) >= p_lead_after_min)
    AND (p_lead_before_min IS NULL OR (
      extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
      + extract(minute FROM timezone(v_tz, x.lead_at))::int
    ) < p_lead_before_min);

  -- Exclusion counts (same pairing base, reject reasons only).
  INSERT INTO stl_excluded (reason)
  SELECT reason
  FROM (
    SELECT
      CASE
        WHEN (NOT x.lead_precise) OR (d.dial_has_time IS NOT DISTINCT FROM false) THEN 'no_time'
        WHEN v_apply_availability AND NOT EXISTS (
          SELECT 1
          FROM stl_windows w
          WHERE w.weekday_num = extract(dow FROM timezone(v_tz, x.lead_at))::int
            AND (
              extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
              + extract(minute FROM timezone(v_tz, x.lead_at))::int
            ) >= w.start_min
            AND (
              extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
              + extract(minute FROM timezone(v_tz, x.lead_at))::int
            ) < w.end_min
        ) THEN 'off_hours'
        WHEN p_lead_after_min IS NOT NULL AND (
          extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
          + extract(minute FROM timezone(v_tz, x.lead_at))::int
        ) < p_lead_after_min THEN 'before_cutoff'
        WHEN p_lead_before_min IS NOT NULL AND (
          extract(hour FROM timezone(v_tz, x.lead_at))::int * 60
          + extract(minute FROM timezone(v_tz, x.lead_at))::int
        ) >= p_lead_before_min THEN 'after_cutoff'
        ELSE NULL
      END AS reason
    FROM (
      SELECT DISTINCT ON (contact_key)
        contact_key,
        occurred_at AS dial_at,
        occurred_at_has_time AS dial_has_time,
        lead_created_at
      FROM stl_events
      WHERE event_type = 'dial'
      ORDER BY contact_key, occurred_at ASC
    ) d
    LEFT JOIN LATERAL (
      SELECT
        CASE
          WHEN d.lead_created_at IS NOT NULL THEN d.lead_created_at
          ELSE l.lead_occurred_at
        END AS lead_at,
        CASE
          WHEN d.lead_created_at IS NOT NULL THEN true
          ELSE (l.lead_has_time IS DISTINCT FROM false)
        END AS lead_precise
      FROM (
        SELECT occurred_at AS lead_occurred_at, occurred_at_has_time AS lead_has_time
        FROM stl_events
        WHERE event_type = 'lead' AND contact_key = d.contact_key
        ORDER BY occurred_at ASC
        LIMIT 1
      ) l
    ) x ON true
    WHERE x.lead_at IS NOT NULL
      AND d.dial_at > x.lead_at
  ) classified
  WHERE reason IS NOT NULL;

  SELECT count(*)::int INTO v_sample_size FROM stl_included;
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY seconds)
    INTO v_median_seconds
  FROM stl_included;

  SELECT count(*)::int INTO v_excl_off FROM stl_excluded WHERE reason = 'off_hours';
  SELECT count(*)::int INTO v_excl_no_time FROM stl_excluded WHERE reason = 'no_time';
  SELECT count(*)::int INTO v_excl_before FROM stl_excluded WHERE reason = 'before_cutoff';
  SELECT count(*)::int INTO v_excl_after FROM stl_excluded WHERE reason = 'after_cutoff';

  RETURN jsonb_build_object(
    'median_min',
      CASE
        WHEN v_sample_size = 0 THEN NULL
        ELSE round((v_median_seconds / 60.0)::numeric, 1)
      END,
    'sample_size', v_sample_size,
    'excluded_out_of_window', v_excl_off,
    'excluded_no_time', v_excl_no_time,
    'excluded_before_cutoff', v_excl_before,
    'excluded_after_cutoff', v_excl_after,
    'time_zone', v_tz,
    'live_window_count', v_live_window_count
  );
END;
$$;

COMMENT ON FUNCTION public.dashboard_speed_to_lead_summary(uuid[], timestamptz, timestamptz, text, boolean, integer, integer) IS
  'Median speed-to-lead + exclusion counts; mirrors src/lib/speed-to-lead.ts computeSpeedToLead summary fields';

REVOKE ALL ON FUNCTION public.stl_normalize_phone(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stl_contact_key(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.stl_parse_hhmm_minutes(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dashboard_speed_to_lead_summary(uuid[], timestamptz, timestamptz, text, boolean, integer, integer) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.stl_normalize_phone(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stl_contact_key(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.stl_parse_hhmm_minutes(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.dashboard_speed_to_lead_summary(uuid[], timestamptz, timestamptz, text, boolean, integer, integer) TO service_role;
