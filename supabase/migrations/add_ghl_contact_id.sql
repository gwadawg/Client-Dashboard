-- GHL Client Success contact (from Step 1 new client form) for tags/workflows on OB complete.

alter table clients add column if not exists ghl_contact_id text;
alter table clients add column if not exists ghl_cs_location_id text;

create unique index if not exists clients_ghl_contact_id_key
  on clients (ghl_contact_id) where ghl_contact_id is not null;
