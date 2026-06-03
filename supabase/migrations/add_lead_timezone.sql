-- The lead/contact's own IANA timezone (e.g. "America/New_York"), captured from the GHL
-- payload's `timezone` field at ingest. Heat maps bucket each event by the lead's LOCAL
-- time of day using this zone; rows without it fall back to a configurable default zone.
alter table public.events add column if not exists lead_timezone text;
