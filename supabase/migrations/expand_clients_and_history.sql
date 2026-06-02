-- Expand Client Database for Long-Term History & CEO Metrics
-- Grows the thin `clients` table into a full client record and adds append-only
-- history so churn / MRR / retention can be measured over time.
-- Schema only — no data import. All statements are idempotent (ADD COLUMN IF NOT
-- EXISTS / CREATE ... IF NOT EXISTS / CREATE OR REPLACE), safe to re-run.
-- Run in: Supabase Dashboard > SQL Editor > New query.
--
-- ── ClickUp "Clients" list (Client Hub) → Supabase column mapping ─────────────
-- Source of truth list id: 901314164414
--   ClickUp task id                  → clients.clickup_task_id
--   ClickUp task `status`            → clients.lifecycle_status (normalized on import:
--                                       new account→new_account, onboarding→onboarding,
--                                       active→active, off boarding→off_boarding,
--                                       churned/churnned→churned)
--   Client Stage                     → clients.client_stage
--   Launch Date                      → clients.launch_date
--   Date Signed                      → clients.date_signed
--   date churned                     → clients.churned_at
--   Last Status Updated              → clients.last_status_changed_at
--   Monthly $                        → clients.mrr
--   Daily Adspend                    → clients.daily_adspend
--   Billing Type (Monthly/PIF/...)   → clients.billing_type (monthly|pif|pif_monthly)
--   Contract Term                    → clients.contract_term_months
--   Contract End Date                → clients.contract_end_date
--   CS Status                        → clients.cs_status
--   Ad Status                        → clients.ad_status
--   Offer (RM/HE)                    → clients.offer (also mirrored by reporting_type)
--   NMLS                             → clients.nmls
--   Brokerage/Lender Name            → clients.brokerage_name
--   Legal Business Name              → clients.legal_business_name
--   Business Type / Legal Bus. Type  → clients.business_type
--   Website                          → clients.website
--   Funnel URL                       → clients.funnel_url
--   Source                           → clients.source
--   Biography                        → clients.biography
--   Primary Contact                  → clients.primary_contact_name
--   Email Address                    → clients.email
--   Phone number                     → clients.phone
--   Phone # Live Transfer            → clients.phone_live_transfer
--   Phone # to Receive Notifications → clients.phone_notifications
--   Live Transfer Approved           → clients.live_transfer_approved
--   Slack ID                         → clients.slack_id
--   Subaccount Link                  → clients.ghl_subaccount_url
--   Street Address                   → clients.street_address
--   City                             → clients.city
--   State                            → clients.state
--   Zip code                         → clients.zip_code
--   Time Zone                        → clients.timezone
--   States Licensed                  → clients.states_licensed (text[] of 2-letter codes)
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Expand `clients` (all new columns nullable / additive)
-- ─────────────────────────────────────────────────────────────────────────────

-- Lifecycle
alter table clients add column if not exists lifecycle_status       text default 'active';
alter table clients add column if not exists client_stage           text;
alter table clients add column if not exists launch_date            date;
alter table clients add column if not exists date_signed            date;
alter table clients add column if not exists churned_at             date;
alter table clients add column if not exists last_status_changed_at timestamptz;

-- Revenue / contract
alter table clients add column if not exists mrr                  numeric;
alter table clients add column if not exists daily_adspend        numeric;
alter table clients add column if not exists billing_type         text;
alter table clients add column if not exists contract_term_months int;
alter table clients add column if not exists contract_end_date    date;

-- Health
alter table clients add column if not exists cs_status text;
alter table clients add column if not exists ad_status text;

-- Offer / identity
alter table clients add column if not exists offer               text;
alter table clients add column if not exists nmls                text;
alter table clients add column if not exists brokerage_name      text;
alter table clients add column if not exists legal_business_name text;
alter table clients add column if not exists business_type       text;
alter table clients add column if not exists website             text;
alter table clients add column if not exists funnel_url          text;
alter table clients add column if not exists source              text;
alter table clients add column if not exists biography           text;

-- Contact
alter table clients add column if not exists primary_contact_name  text;
alter table clients add column if not exists email                 text;
alter table clients add column if not exists phone                 text;
alter table clients add column if not exists phone_live_transfer   text;
alter table clients add column if not exists phone_notifications   text;
alter table clients add column if not exists live_transfer_approved boolean default false;
alter table clients add column if not exists slack_id              text;
alter table clients add column if not exists ghl_subaccount_url    text;

-- Location
alter table clients add column if not exists street_address  text;
alter table clients add column if not exists city            text;
alter table clients add column if not exists state           text;
alter table clients add column if not exists zip_code        text;
alter table clients add column if not exists timezone        text;
alter table clients add column if not exists states_licensed text[];

-- Sync key for a future ClickUp → Supabase import (upsert by ClickUp task id)
alter table clients add column if not exists clickup_task_id text;

create unique index if not exists clients_clickup_task_id_key
  on clients (clickup_task_id) where clickup_task_id is not null;

-- CHECK constraints (added defensively so re-runs don't duplicate them)
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. client_status_history — append-only log of every lifecycle transition.
--    Backbone for churn timing, reactivations, and tenure.
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
-- 3. client_monthly_snapshots — one point-in-time row per client per month.
--    Powers MRR-over-time, churn rate, retention/cohort, expansion/contraction.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_monthly_snapshots (
  id               uuid    primary key default gen_random_uuid(),
  client_id        uuid    not null references clients(id) on delete cascade,
  period_month     date    not null,   -- first day of the month, e.g. 2026-05-01
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
-- 4. Trigger — auto-log lifecycle_status changes and maintain churn fields.
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

    -- Stamp / clear the churn date automatically.
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
-- 5. Indexes
-- ─────────────────────────────────────────────────────────────────────────────
create index if not exists clients_lifecycle_status_idx on clients(lifecycle_status);
create index if not exists clients_churned_at_idx        on clients(churned_at) where churned_at is not null;
create index if not exists client_status_history_client  on client_status_history(client_id, changed_at desc);
create index if not exists client_status_history_new     on client_status_history(new_status);
create index if not exists client_monthly_snapshots_period on client_monthly_snapshots(period_month);
create index if not exists client_monthly_snapshots_client on client_monthly_snapshots(client_id, period_month desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Starter CEO views (lightweight; grow into a real dashboard later)
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
