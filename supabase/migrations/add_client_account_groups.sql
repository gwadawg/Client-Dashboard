-- Multi-offer / upsell: LO account groups linking sibling client rows (one per GHL subaccount).
-- Idempotent — safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. client_account_groups — LO / person identity (no billing, no GHL)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_account_groups (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null,
  primary_email text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists client_account_groups_primary_email_idx
  on client_account_groups (lower(primary_email))
  where primary_email is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. clients — link to account group + engagement lineage
-- ─────────────────────────────────────────────────────────────────────────────
alter table clients add column if not exists account_group_id uuid;
alter table clients add column if not exists engagement_kind text not null default 'initial';
alter table clients add column if not exists origin_client_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_account_group_id_fkey'
  ) then
    alter table clients
      add constraint clients_account_group_id_fkey
      foreign key (account_group_id) references client_account_groups(id) on delete restrict;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_origin_client_id_fkey'
  ) then
    alter table clients
      add constraint clients_origin_client_id_fkey
      foreign key (origin_client_id) references clients(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'clients_engagement_kind_check'
  ) then
    alter table clients
      add constraint clients_engagement_kind_check
      check (engagement_kind in ('initial', 'upsell', 'cross_sell'));
  end if;
end $$;

create index if not exists clients_account_group_id_idx on clients (account_group_id);

create index if not exists clients_origin_client_id_idx
  on clients (origin_client_id)
  where origin_client_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. client_engagements — append-only upsell / cross-sell audit log
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists client_engagements (
  id                   uuid primary key default gen_random_uuid(),
  account_group_id     uuid not null references client_account_groups(id) on delete restrict,
  from_client_id       uuid references clients(id) on delete set null,
  to_client_id         uuid not null references clients(id) on delete restrict,
  engagement_kind      text not null,
  reporting_type       text not null,
  sales_package        text,
  mrr_snapshot         numeric(12, 2),
  closed_at            date,
  logged_by            uuid references profiles(id) on delete set null,
  acquisition_close_id uuid,
  created_at           timestamptz not null default now(),
  constraint client_engagements_engagement_kind_check
    check (engagement_kind in ('initial', 'upsell', 'cross_sell'))
);

create index if not exists client_engagements_account_group_id_idx
  on client_engagements (account_group_id);

create index if not exists client_engagements_account_group_id_created_at_idx
  on client_engagements (account_group_id, created_at desc);

create index if not exists client_engagements_from_client_id_idx
  on client_engagements (from_client_id)
  where from_client_id is not null;

create index if not exists client_engagements_to_client_id_idx
  on client_engagements (to_client_id);
