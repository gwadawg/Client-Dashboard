-- Lead's real creation timestamp, captured from the dialer (HP) payload's lead_created_date.
-- Speed-to-lead uses this precise lead instant when present, even if the lead event itself
-- was ingested date-only. Anchored to the dialer zone (DIAL_SOURCE_TIMEZONE) at ingest.
alter table public.events add column if not exists lead_created_at timestamptz;
