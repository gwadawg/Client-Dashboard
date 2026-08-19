-- Client → agent routing for tickets, plus a native bug-type library.

create table if not exists closebot_agent_clients (
  agent_id   uuid not null references closebot_agents (id) on delete cascade,
  client_id  uuid not null references clients (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (agent_id, client_id),
  constraint closebot_agent_clients_client_unique unique (client_id)
);

create index if not exists closebot_agent_clients_agent_idx
  on closebot_agent_clients (agent_id);

create table if not exists closebot_bug_types (
  slug         text primary key,
  name         text not null,
  short_code   text not null,
  description  text,
  sort_order   integer not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint closebot_bug_types_slug_check check (slug ~ '^[a-z][a-z0-9_]{0,63}$'),
  constraint closebot_bug_types_code_check check (char_length(short_code) between 2 and 8)
);

insert into closebot_bug_types (slug, name, short_code, sort_order)
values
  ('wrong_reply', 'Wrong reply', 'WRONG', 10),
  ('booking_fail', 'Booking failed', 'BOOK', 20),
  ('transfer_fail', 'Transfer failed', 'XFER', 30),
  ('loop_stuck', 'Loop / stuck', 'LOOP', 40),
  ('persona_tone', 'Persona / tone', 'TONE', 50),
  ('compliance', 'Compliance', 'COMP', 60),
  ('integration', 'Integration', 'INTG', 70),
  ('other', 'Other', 'OTHR', 80)
on conflict (slug) do nothing;

alter table closebot_tickets
  drop constraint if exists closebot_tickets_bug_type_check;

alter table closebot_tickets
  alter column bug_type drop not null;

alter table closebot_tickets
  drop constraint if exists closebot_tickets_bug_type_fk;

alter table closebot_tickets
  add constraint closebot_tickets_bug_type_fk
  foreign key (bug_type) references closebot_bug_types (slug);
