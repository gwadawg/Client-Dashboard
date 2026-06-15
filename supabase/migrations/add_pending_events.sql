-- Events that arrived before a client sub-account name existed in the roster.
create table if not exists pending_events (
  id                    uuid primary key default gen_random_uuid(),
  client_name           text not null,
  ghl_location_id       text,
  event_type            text not null,
  source_event_type     text not null,
  normalized_event_type text not null,
  payload               jsonb not null,
  ghl_contact_id        text,
  occurred_at           timestamptz,
  status                text not null default 'pending'
    check (status in ('pending', 'resolved', 'skipped')),
  resolved_client_id    uuid references clients(id) on delete set null,
  resolved_event_id     uuid references events(id) on delete set null,
  resolved_at           timestamptz,
  error_message         text,
  received_at           timestamptz not null default now(),
  replay_attempts       int not null default 0
);

create index if not exists pending_events_status_received
  on pending_events (status, received_at desc)
  where status = 'pending';

create index if not exists pending_events_client_name_pending
  on pending_events (client_name)
  where status = 'pending';

create index if not exists pending_events_ghl_location_pending
  on pending_events (ghl_location_id)
  where status = 'pending' and ghl_location_id is not null;
