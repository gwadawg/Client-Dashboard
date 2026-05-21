-- Reporting Dashboard — Single Agency
-- Run this ONE file in: Supabase Dashboard > SQL Editor > New query
-- Creates all tables, columns, indexes, and triggers from scratch.
-- Safe to re-run (all statements use IF NOT EXISTS / CREATE OR REPLACE).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Profiles (team login)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists profiles (
  id         uuid    primary key references auth.users(id) on delete cascade,
  is_admin   boolean not null default false,
  created_at timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Clients (lead sources or service lines)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists clients (
  id               uuid    primary key default gen_random_uuid(),
  name             text    not null unique,
  is_live          boolean not null default true,
  reporting_type   text    not null default 'RM',
  ghl_location_id  text,
  share_token      text,
  created_at       timestamptz default now(),
  constraint clients_reporting_type_check check (reporting_type in ('RM', 'HE'))
);

alter table clients
  add column if not exists reporting_type text not null default 'RM';

update clients
  set reporting_type = 'RM'
  where reporting_type is null or reporting_type not in ('RM', 'HE');

alter table clients
  alter column reporting_type set default 'RM',
  alter column reporting_type set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_reporting_type_check'
  ) then
    alter table clients
      add constraint clients_reporting_type_check check (reporting_type in ('RM', 'HE'));
  end if;
end $$;

create unique index if not exists clients_ghl_location_id_key
  on clients (ghl_location_id) where ghl_location_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Agents (setters)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists agents (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null unique,
  created_at timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Events (all GHL events: dials, leads, bookings, shows, no-shows, callbacks)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists events (
  id          uuid    primary key default gen_random_uuid(),
  client_id   uuid    not null references clients(id) on delete cascade,
  event_type  text    not null,
  occurred_at timestamptz default now(),

  -- Call fields
  duration_seconds   int,
  is_pickup          boolean,
  is_conversation    boolean,
  speed_to_lead_seconds numeric,
  direction          text,       -- inbound | outbound
  call_status        text,       -- completed | voicemail | canceled | no_answer
  recording_url      text,
  call_summary       text,
  phone_number_used  text,
  dial_source        text,       -- dialing software/source, e.g. GHL | HP

  -- Appointment fields
  scheduled_at   timestamptz,   -- when the appointment is scheduled for
  external_id    text,          -- GHL appointment ID — used to flip booked → show/no_show
  calendar_name  text,          -- GHL calendar name
  calendar_id    text,          -- GHL calendar id (which calendar the appointment is on)
  stage_booked   text,          -- e.g. "Day 1 AM"

  -- Lead identity
  lead_name   text,
  lead_phone  text,
  lead_email  text,

  -- Agent
  agent_name      text,
  ghl_contact_id  text,
  raw             jsonb,

  -- Lead flags (meaningful when event_type = 'lead')
  is_qualified    boolean,
  is_hot          boolean,
  is_out_of_state boolean,

  constraint events_event_type_check check (
    event_type in (
      'dial', 'lead', 'appointment_booked', 'appointment_cancelled', 'show', 'no_show', 'callback_booked',
      'live_transfer', 'proposal_sent', 'loan_processing', 'closed', 'out_of_state_lead',
      'lo_bailed', 'lo_audit', 'claimed'
    )
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Ad Spend (daily Meta / Google / Local Services spend by client)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists ad_spend (
  id          uuid    primary key default gen_random_uuid(),
  client_id   uuid    not null references clients(id) on delete cascade,
  spend_date  date    not null,
  platform    text    not null,
  amount      numeric not null default 0,
  created_at  timestamptz default now(),
  constraint ad_spend_platform_check check (platform in ('meta', 'google', 'local_services')),
  unique(client_id, spend_date, platform)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Meta Ad Insights (daily ad-level reporting from Meta Ads)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists meta_ad_insights (
  id                   uuid    primary key default gen_random_uuid(),
  client_id            uuid    not null references clients(id) on delete cascade,
  insight_date         date    not null,
  account_id           text    not null,
  campaign_id          text    not null,
  campaign_name        text,
  adset_id             text    not null,
  adset_name           text,
  ad_id                text    not null,
  ad_name              text,
  spend                numeric not null default 0,
  impressions          bigint  not null default 0,
  clicks               bigint  not null default 0,
  ctr                  numeric,
  cpc                  numeric,
  cpm                  numeric,
  actions              jsonb,
  cost_per_action_type jsonb,
  raw                  jsonb,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  unique(client_id, insight_date, account_id, campaign_id, adset_id, ad_id)
);

-- Daily Meta spend rollup (query via PostgREST as daily_meta_spend)
create or replace view daily_meta_spend as
select
  client_id,
  insight_date as spend_date,
  sum(spend) as amount
from meta_ad_insights
group by client_id, insight_date;

grant select on daily_meta_spend to service_role;
grant select on daily_meta_spend to authenticated;
grant select on daily_meta_spend to anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Setter Availability (recurring weekly windows per agent)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists setter_availability (
  id          uuid    primary key default gen_random_uuid(),
  agent_id    uuid    not null references agents(id) on delete cascade,
  weekday     text    not null,   -- Monday | Tuesday | ... | Sunday
  time_start  text    not null,   -- HH:MM 24-hour
  time_end    text    not null,
  is_live     boolean not null default true,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Client Calling Windows (when each client/lead-source is dialled each week)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_calling_windows (
  id          uuid    primary key default gen_random_uuid(),
  client_id   uuid    not null references clients(id) on delete cascade,
  weekday     text    not null,
  time_slot_1 text,              -- HH:MM 24-hour
  time_slot_2 text,
  is_live     boolean not null default true,
  created_at  timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Watch Schedule (manager assigns setters to specific dates + hours)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists watch_schedule (
  id             uuid primary key default gen_random_uuid(),
  agent_id       uuid not null references agents(id) on delete cascade,
  scheduled_date date not null,
  slot_hour      int  not null,   -- 8–20 (8am–8pm)
  created_at     timestamptz default now(),
  unique(agent_id, scheduled_date, slot_hour)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. PD Schedule (generated power dialer schedule from watch schedule)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists pd_schedule (
  id             uuid    primary key default gen_random_uuid(),
  client_id      uuid    not null references clients(id) on delete cascade,
  agent_id       uuid    references agents(id) on delete set null,
  scheduled_date date    not null,
  slot_time      text    not null,   -- HH:MM 24-hour
  status         text    not null default 'pending',  -- pending | done | skipped | no_setters
  notes          text,
  created_at     timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists events_client_occurred  on events(client_id, occurred_at desc);
create index if not exists events_type             on events(event_type);
create index if not exists events_external_id_idx  on events(external_id)  where external_id is not null;
create index if not exists events_calendar_id_idx  on events(calendar_id)  where calendar_id is not null;
create index if not exists events_agent_name_idx   on events(agent_name)   where agent_name is not null;
create index if not exists events_lead_phone_idx   on events(lead_phone)   where lead_phone is not null;
create index if not exists ad_spend_client_date    on ad_spend(client_id, spend_date desc);
create index if not exists meta_ad_insights_client_date on meta_ad_insights(client_id, insight_date desc);
create index if not exists meta_ad_insights_campaign    on meta_ad_insights(client_id, campaign_id);
create index if not exists meta_ad_insights_ad          on meta_ad_insights(client_id, ad_id);
create index if not exists watch_schedule_date     on watch_schedule(scheduled_date);
create index if not exists pd_schedule_date        on pd_schedule(scheduled_date);
