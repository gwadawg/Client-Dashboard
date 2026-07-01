-- Link roster offer rows that share one LO identity (phone, NMLS, licenses, etc.).
-- identity_client_id points at the canonical client row holding shared profile data.
-- The identity row has identity_client_id = null.

alter table clients
  add column if not exists identity_client_id uuid references clients(id) on delete set null;

create index if not exists clients_identity_client_id_idx
  on clients (identity_client_id)
  where identity_client_id is not null;

comment on column clients.identity_client_id is
  'When set, shared profile fields (contact, NMLS, licenses, location) live on the linked identity row; this row is an additional offer engagement.';
