-- Client Success calendar appointments (onboarding / launch / check-in)
-- Client key is clickup_task_id (soft join to clients). Call type lives only on calendar config.

create table if not exists cs_calendar_config (
  calendar_id   text primary key,
  calendar_name text not null,
  call_type     text not null,
  constraint cs_calendar_config_type_check check (
    call_type in ('onboarding', 'launch', 'checkin')
  )
);

-- Seed when GHL CS calendar IDs are known, e.g.:
-- insert into cs_calendar_config (calendar_id, calendar_name, call_type) values
--   ('REPLACE_ONBOARDING_CAL_ID', 'CS Onboarding', 'onboarding'),
--   ('REPLACE_LAUNCH_CAL_ID', 'CS Launch', 'launch'),
--   ('REPLACE_CHECKIN_CAL_ID', 'CS Check-in', 'checkin')
-- on conflict (calendar_id) do update
--   set calendar_name = excluded.calendar_name,
--       call_type = excluded.call_type;

create table if not exists cs_appointments (
  id                  uuid primary key default gen_random_uuid(),
  clickup_task_id     text not null,
  ghl_appointment_id  text not null,
  calendar_id         text not null,
  calendar_name       text,
  booked_at           timestamptz,
  scheduled_at        timestamptz not null,
  status              text not null default 'scheduled',
  title               text,
  assigned_to         text,
  raw                 jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint cs_appointments_status_check check (
    status in ('scheduled', 'cancelled', 'completed', 'no_show')
  ),
  constraint cs_appointments_ghl_appointment_id_key unique (ghl_appointment_id)
);

create index if not exists cs_appointments_scheduled_upcoming_idx
  on cs_appointments (scheduled_at)
  where status = 'scheduled';

create index if not exists cs_appointments_clickup_scheduled_idx
  on cs_appointments (clickup_task_id, scheduled_at);

create index if not exists cs_appointments_calendar_id_idx
  on cs_appointments (calendar_id);

alter table cs_calendar_config enable row level security;
alter table cs_appointments enable row level security;

do $$ begin
  create policy cs_calendar_config_read on cs_calendar_config
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy cs_appointments_read on cs_appointments
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
