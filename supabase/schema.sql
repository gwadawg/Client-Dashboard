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
  -- Owner role: always unrestricted, the only role that bypasses permissions.
  is_owner   boolean not null default false,
  -- Legacy per-tab column (superseded by allowed_permissions).
  allowed_views jsonb,
  -- JSON array of permission keys (see src/lib/permissions.ts) this user may use,
  -- covering both views and future features. NULL = no restriction (unrestricted).
  allowed_permissions jsonb,
  created_at timestamptz default now()
);

alter table profiles add column if not exists allowed_views jsonb;
alter table profiles add column if not exists is_owner boolean not null default false;
alter table profiles add column if not exists allowed_permissions jsonb;

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

  -- Lifecycle (mirrors ClickUp "Clients" list)
  lifecycle_status       text default 'active',
  client_stage           text,
  launch_date            date,
  date_signed            date,
  churned_at             date,
  last_status_changed_at timestamptz,

  -- Revenue / contract
  mrr                  numeric,   -- ClickUp "Monthly $"
  daily_adspend        numeric,
  billing_type         text,      -- monthly | pif | pif_monthly
  contract_term_months int,
  contract_end_date    date,

  -- Health
  cs_status text,
  ad_status text,

  -- Offer / identity
  offer               text,       -- RM | HE (mirrors reporting_type)
  nmls                text,
  brokerage_name      text,
  legal_business_name text,
  business_type       text,
  website             text,
  funnel_url          text,
  source              text,
  biography           text,

  -- Contact
  primary_contact_name   text,
  email                  text,
  phone                  text,
  phone_live_transfer    text,
  phone_notifications    text,
  live_transfer_approved boolean default false,
  slack_id               text,
  ghl_subaccount_url     text,

  -- Location
  street_address  text,
  city            text,
  state           text,
  zip_code        text,
  timezone        text,
  states_licensed text[],

  -- Sync key for a future ClickUp → Supabase import
  clickup_task_id text,

  constraint clients_reporting_type_check check (reporting_type in ('RM', 'HE'))
);

-- Additive columns (so re-running on an older clients table backfills them)
alter table clients add column if not exists lifecycle_status       text default 'active';
alter table clients add column if not exists client_stage           text;
alter table clients add column if not exists launch_date            date;
alter table clients add column if not exists date_signed            date;
alter table clients add column if not exists churned_at             date;
alter table clients add column if not exists last_status_changed_at timestamptz;
alter table clients add column if not exists mrr                    numeric;
alter table clients add column if not exists daily_adspend          numeric;
alter table clients add column if not exists billing_type           text;
alter table clients add column if not exists contract_term_months   int;
alter table clients add column if not exists contract_end_date      date;
alter table clients add column if not exists cs_status              text;
alter table clients add column if not exists ad_status              text;
alter table clients add column if not exists offer                  text;
alter table clients add column if not exists nmls                   text;
alter table clients add column if not exists brokerage_name         text;
alter table clients add column if not exists legal_business_name    text;
alter table clients add column if not exists business_type          text;
alter table clients add column if not exists website                text;
alter table clients add column if not exists funnel_url             text;
alter table clients add column if not exists source                 text;
alter table clients add column if not exists biography              text;
alter table clients add column if not exists primary_contact_name   text;
alter table clients add column if not exists email                  text;
alter table clients add column if not exists phone                  text;
alter table clients add column if not exists phone_live_transfer    text;
alter table clients add column if not exists phone_notifications    text;
alter table clients add column if not exists live_transfer_approved boolean default false;
alter table clients add column if not exists slack_id               text;
alter table clients add column if not exists ghl_subaccount_url     text;
alter table clients add column if not exists street_address         text;
alter table clients add column if not exists city                   text;
alter table clients add column if not exists state                  text;
alter table clients add column if not exists zip_code               text;
alter table clients add column if not exists timezone               text;
alter table clients add column if not exists states_licensed        text[];
alter table clients add column if not exists clickup_task_id        text;
alter table clients add column if not exists performance_terms      text;
alter table clients add column if not exists billing_email          text;
alter table clients add column if not exists primary_contact        text;
alter table clients add column if not exists billing_day            smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_billing_day_check') then
    alter table clients add constraint clients_billing_day_check
      check (billing_day is null or (billing_day >= 1 and billing_day <= 31));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_lifecycle_status_check') then
    alter table clients add constraint clients_lifecycle_status_check check (
      lifecycle_status in ('new_account', 'onboarding', 'active', 'paused', 'off_boarding', 'churned')
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'clients_billing_type_check') then
    alter table clients add constraint clients_billing_type_check check (
      billing_type is null or billing_type in ('monthly', 'pif', 'pif_monthly')
    );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'clients_offer_check') then
    alter table clients add constraint clients_offer_check check (
      offer is null or offer in ('RM', 'HE')
    );
  end if;
end $$;

create unique index if not exists clients_clickup_task_id_key
  on clients (clickup_task_id) where clickup_task_id is not null;

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
      'live_transfer', 'proposal_sent', 'loan_processing', 'closed',
      'proposal_made', 'submission_made', 'loan_funded',
      'out_of_state_lead',
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
-- 11. Client Health Snapshots (frozen periodic verdicts — progress baselines)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_health_snapshots (
  id                  uuid    primary key default gen_random_uuid(),
  client_id           uuid    not null references clients(id) on delete cascade,
  period_start        date    not null,
  period_end          date    not null,
  window_code         text,                 -- W7 | W14 | W30 | custom
  cpconv              numeric,
  cpql                numeric,
  cpl                 numeric,
  conversation_yield  numeric,
  show_rate           numeric,
  booking_rate        numeric,
  lead_to_qual        numeric,
  attention_score     numeric,
  worst_tier          text,                 -- critical | below | at | above | insufficient
  primary_constraint  text,
  constraint_label    text,
  metrics             jsonb,                -- full MetricsResult snapshot
  ai_diagnosis        jsonb,                -- latest AI verdict for this period (optional)
  created_by          uuid    references auth.users(id) on delete set null,
  created_at          timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Client Action Logs (interventions + outcomes, the change history)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_action_logs (
  id                   uuid    primary key default gen_random_uuid(),
  client_id            uuid    not null references clients(id) on delete cascade,
  created_by           uuid    references auth.users(id) on delete set null,
  created_at           timestamptz default now(),
  title                text    not null,
  layer                text,             -- L1 | L2 | L3 | L4 | DATA
  constraint_label     text,
  change_description   text,
  hypothesis           text,
  baseline_snapshot_id uuid    references client_health_snapshots(id) on delete set null,
  success_metric       text,             -- which KPI must move, e.g. cpconv / show_rate
  baseline_value       numeric,
  target_value         numeric,
  status               text    not null default 'planned',
  review_date          date,
  outcome_value        numeric,
  outcome_notes        text,
  outcome_recorded_at  timestamptz,
  ai_generated         boolean not null default false,
  constraint client_action_logs_status_check check (
    status in ('planned', 'in_progress', 'measuring', 'succeeded', 'failed', 'abandoned')
  )
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 14. Client Status History (append-only log of lifecycle transitions)
--     Backbone for churn timing, reactivations, and tenure.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_status_history (
  id              uuid    primary key default gen_random_uuid(),
  client_id       uuid    not null references clients(id) on delete cascade,
  previous_status text,
  new_status      text    not null,
  mrr_at_change   numeric,
  changed_at      timestamptz not null default now(),
  changed_by      uuid    references auth.users(id) on delete set null,
  source          text    not null default 'manual',  -- manual | clickup_sync | trigger
  note            text
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 15. Client Monthly Snapshots (point-in-time per client per month)
--     Powers MRR-over-time, churn rate, retention/cohort, expansion/contraction.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_monthly_snapshots (
  id               uuid    primary key default gen_random_uuid(),
  client_id        uuid    not null references clients(id) on delete cascade,
  period_month     date    not null,   -- first day of the month
  lifecycle_status text,
  mrr              numeric,
  daily_adspend    numeric,
  cs_status        text,
  client_stage     text,
  is_active        boolean not null default false,
  captured_at      timestamptz not null default now(),
  unique(client_id, period_month)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 16. Status-change trigger (auto-log transitions + maintain churn fields)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.log_client_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.lifecycle_status is distinct from old.lifecycle_status then
    insert into public.client_status_history
      (client_id, previous_status, new_status, mrr_at_change, source)
    values
      (new.id, old.lifecycle_status, new.lifecycle_status, new.mrr, 'trigger');

    new.last_status_changed_at := now();

    if new.lifecycle_status = 'churned' and new.churned_at is null then
      new.churned_at := current_date;
    elsif new.lifecycle_status <> 'churned' then
      new.churned_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_status_change on clients;
create trigger clients_status_change
  before update on clients
  for each row execute function public.log_client_status_change();

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. Business Metrics (company-wide KPI time series for the CEO view)
--     Flexible key/value-over-time table so new high-level metrics can be tracked
--     without schema changes. dimension allows optional slicing (e.g. offer=RM).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists business_metrics (
  id            uuid    primary key default gen_random_uuid(),
  metric_key    text    not null,    -- total_mrr | active_clients | new_clients | churned_clients | headcount | cash_balance | ...
  period_date   date    not null,
  value_numeric numeric,
  value_text    text,
  dimension     text,                -- optional slice label, e.g. 'offer=RM'
  notes         text,
  created_by    uuid    references auth.users(id) on delete set null,
  created_at    timestamptz default now()
);

create unique index if not exists business_metrics_key_period_dim
  on business_metrics (metric_key, period_date, coalesce(dimension, ''));

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. Client Billings (append-only ledger of every billing made per client)
--     Next billing date is DERIVED in app code from billing_type / date_signed
--     + the latest row here; not stored. Reached via service role only (no RLS).
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_billings (
  id                 uuid    primary key default gen_random_uuid(),
  client_id          uuid    not null references clients(id) on delete cascade,
  billed_on          date    not null,                 -- date this billing was issued
  due_date           date,                             -- when payment is due (extendable)
  period_start       date,                             -- service period this covers
  period_end         date,
  amount             numeric not null,                 -- total due = base + performance + late_fee - discount
  base_amount        numeric,                          -- recurring base (defaults to clients.mrr)
  performance_amount numeric default 0,                -- manual performance add-on
  late_fee           numeric default 0,                -- late charge
  discount           numeric default 0,                -- discount applied (reduces total due)
  amount_paid        numeric default 0,                -- actually collected (partial = 0 < paid < amount)
  status             text    not null default 'pending',  -- pending | partial | paid | overdue | failed | refunded
  paid_on            date,
  method             text,                             -- card | ach | wire | stripe | manual
  invoice_ref        text,                             -- external invoice / Stripe id
  note               text,
  created_by         uuid    references auth.users(id) on delete set null,
  created_at         timestamptz default now()
);

-- Additive columns (so re-running on an older client_billings table backfills them)
alter table client_billings add column if not exists due_date           date;
alter table client_billings add column if not exists base_amount        numeric;
alter table client_billings add column if not exists performance_amount numeric default 0;
alter table client_billings add column if not exists late_fee           numeric default 0;
alter table client_billings add column if not exists discount           numeric default 0;
alter table client_billings add column if not exists amount_paid        numeric default 0;
update client_billings set base_amount = amount   where base_amount is null;
update client_billings set due_date    = billed_on where due_date is null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'client_billings_status_check') then
    alter table client_billings drop constraint client_billings_status_check;
  end if;
  alter table client_billings add constraint client_billings_status_check check (
    status in ('pending', 'partial', 'paid', 'overdue', 'failed', 'refunded')
  );
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 13. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists events_client_occurred  on events(client_id, occurred_at desc);
create index if not exists events_type             on events(event_type);
create index if not exists events_external_id_idx  on events(external_id)  where external_id is not null;
create index if not exists events_calendar_id_idx  on events(calendar_id)  where calendar_id is not null;
create index if not exists events_agent_name_idx   on events(agent_name)   where agent_name is not null;
create index if not exists events_lead_phone_idx   on events(lead_phone)   where lead_phone is not null;
-- One conversion event per contact per stage (idempotent LO pipeline ingest)
create unique index if not exists events_conversion_unique
  on events (client_id, event_type, ghl_contact_id)
  where event_type in ('proposal_made','submission_made','loan_funded')
    and ghl_contact_id is not null;
create index if not exists ad_spend_client_date    on ad_spend(client_id, spend_date desc);
create index if not exists meta_ad_insights_client_date on meta_ad_insights(client_id, insight_date desc);
create index if not exists meta_ad_insights_campaign    on meta_ad_insights(client_id, campaign_id);
create index if not exists meta_ad_insights_ad          on meta_ad_insights(client_id, ad_id);
create index if not exists watch_schedule_date     on watch_schedule(scheduled_date);
create index if not exists pd_schedule_date        on pd_schedule(scheduled_date);
create index if not exists client_health_snapshots_client_period on client_health_snapshots(client_id, period_end desc);
create index if not exists client_action_logs_client_created     on client_action_logs(client_id, created_at desc);
create index if not exists client_action_logs_status             on client_action_logs(status);
create index if not exists clients_lifecycle_status_idx          on clients(lifecycle_status);
create index if not exists clients_churned_at_idx                on clients(churned_at) where churned_at is not null;
create index if not exists client_status_history_client          on client_status_history(client_id, changed_at desc);
create index if not exists client_status_history_new             on client_status_history(new_status);
create index if not exists client_monthly_snapshots_period       on client_monthly_snapshots(period_month);
create index if not exists client_monthly_snapshots_client       on client_monthly_snapshots(client_id, period_month desc);
create index if not exists business_metrics_key_period           on business_metrics(metric_key, period_date desc);
create index if not exists client_billings_client_billed         on client_billings(client_id, billed_on desc);
create index if not exists client_billings_open_status           on client_billings(status, billed_on) where status in ('pending', 'overdue');

-- ─────────────────────────────────────────────────────────────────────────────
-- 17. Starter CEO views (lightweight; grow into a real dashboard later)
-- ─────────────────────────────────────────────────────────────────────────────

-- Current active recurring revenue.
create or replace view v_active_mrr as
select
  count(*) filter (where lifecycle_status = 'active') as active_clients,
  coalesce(sum(mrr) filter (where lifecycle_status = 'active'), 0) as active_mrr
from clients;

grant select on v_active_mrr to service_role;
grant select on v_active_mrr to authenticated;
grant select on v_active_mrr to anon;

-- Churn events per month (count of transitions into 'churned').
create or replace view v_monthly_churn as
select
  date_trunc('month', changed_at)::date as period_month,
  count(*) as churned_count
from client_status_history
where new_status = 'churned'
group by date_trunc('month', changed_at);

grant select on v_monthly_churn to service_role;
grant select on v_monthly_churn to authenticated;
grant select on v_monthly_churn to anon;
