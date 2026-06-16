-- Additional contacts per client account (LOA, Co-LO, etc.)
-- Primary account holder remains on clients.primary_contact_name / email / phone.

create table if not exists client_contacts (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients(id) on delete cascade,
  contact_type     text not null,
  name             text not null,
  email            text,
  phone            text,
  nmls             text,
  states_licensed  text[],
  notes            text,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz,
  created_by       uuid references auth.users(id) on delete set null,
  updated_by       uuid references auth.users(id) on delete set null,
  constraint client_contacts_type_check check (
    contact_type in ('loa', 'co_lo', 'other')
  )
);

create index if not exists idx_client_contacts_client_id on client_contacts(client_id);
