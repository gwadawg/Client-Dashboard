-- Weekly Focus: timed client focus blocks (replaces PD generate workflow)
create table if not exists focus_schedule (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete cascade,
  agent_id       uuid references agents(id) on delete set null,
  scheduled_date date not null,
  time_start     text not null,  -- HH:MM 24-hour
  time_end       text not null,  -- HH:MM 24-hour; must be after time_start
  status         text not null default 'scheduled'
                 check (status in ('scheduled', 'done', 'skipped')),
  notes          text,
  created_at     timestamptz not null default now()
);

create index if not exists focus_schedule_date_idx
  on focus_schedule (scheduled_date);

create index if not exists focus_schedule_client_date_idx
  on focus_schedule (client_id, scheduled_date);
