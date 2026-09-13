-- Speed up webhook resolve / dial speed-to-lead / DQ lead linking by contact id.
-- Without this, eq(ghl_contact_id) scans the full events table (~2s+).
create index if not exists events_ghl_contact_id_idx
  on events (ghl_contact_id)
  where ghl_contact_id is not null;

-- Dial/lead ingest looks up prior rows by (client_id, event_type, ghl_contact_id).
create index if not exists events_client_type_contact_idx
  on events (client_id, event_type, ghl_contact_id)
  where ghl_contact_id is not null;
