-- Account-management calls (onboarding, launch, check-in, churn) per client.

create table if not exists client_calls (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  call_type     text not null,
  called_at     timestamptz not null,
  recording_url text,
  transcript    text,
  notes         text,
  attendees     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  updated_by    uuid references auth.users(id) on delete set null,
  constraint client_calls_type_check check (
    call_type in ('onboarding', 'launch', 'checkin', 'churn', 'other')
  )
);

create index if not exists client_calls_client_called on client_calls(client_id, called_at desc);
create index if not exists client_calls_called on client_calls(called_at desc);
