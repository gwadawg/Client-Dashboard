-- ─────────────────────────────────────────────────────────────────────────────
-- Business Expenses ledger (transaction-level charges → CEO buckets → rollups)
-- ─────────────────────────────────────────────────────────────────────────────
-- Mirrors client_billings: one row = one card/bank charge (or payroll line).
-- Rolls into business_metrics (marketing_spend / delivery_costs / operating_expenses).
-- No RLS — service-role only via API routes (same as billings).
-- Safe to re-run: IF NOT EXISTS throughout.
-- Run in: Supabase Dashboard > SQL Editor > New query.

-- 1. Finance accounts (cards / banks)
create table if not exists finance_accounts (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  institution   text,
  account_type  text not null default 'credit_card',
  entity        text,
  is_business   boolean not null default true,
  active        boolean not null default true,
  last4         text,
  notes         text,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users(id) on delete set null,
  constraint finance_accounts_type_check check (
    account_type in ('checking', 'credit_card', 'other')
  )
);

create index if not exists finance_accounts_active
  on finance_accounts (active) where active = true;

-- 2. Category rules (merchant / memo → CEO bucket)
create table if not exists expense_category_rules (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  match_type        text not null,
  match_value       text not null,
  amount_min        numeric,
  amount_max        numeric,
  ceo_bucket        text not null,
  subcategory       text,
  exclude_from_pnl  boolean not null default false,
  priority          int not null default 100,
  active            boolean not null default true,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint expense_rules_match_type_check check (
    match_type in ('merchant_contains', 'merchant_equals', 'memo_contains', 'amount_range')
  ),
  constraint expense_rules_bucket_check check (
    ceo_bucket in ('cac', 'fulfillment', 'overhead', 'passthrough', 'owner_draw', 'personal', 'uncategorized')
  )
);

create index if not exists expense_category_rules_active_priority
  on expense_category_rules (active, priority)
  where active = true;

-- 3. Expense ledger
create table if not exists business_expenses (
  id                   uuid primary key default gen_random_uuid(),
  occurred_on          date not null,
  amount               numeric not null,              -- positive = money out
  currency             text not null default 'USD',
  account_id           uuid references finance_accounts(id) on delete set null,
  source               text not null default 'manual',
  merchant_raw         text,
  merchant_normalized  text,
  memo                 text,
  external_id          text,                          -- bank txn id or import hash
  ceo_bucket           text not null default 'uncategorized',
  subcategory          text,
  exclude_from_pnl     boolean not null default false,
  categorized_by       text,                          -- rule | user | import
  rule_id              uuid references expense_category_rules(id) on delete set null,
  payroll_run_id       text,                          -- e.g. 2026-06-01_to_2026-06-30:agent_id
  client_id            uuid references clients(id) on delete set null,
  created_by           uuid references auth.users(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint business_expenses_source_check check (
    source in ('manual', 'csv_import', 'payroll', 'bank_sync')
  ),
  constraint business_expenses_bucket_check check (
    ceo_bucket in ('cac', 'fulfillment', 'overhead', 'passthrough', 'owner_draw', 'personal', 'uncategorized')
  ),
  constraint business_expenses_categorized_by_check check (
    categorized_by is null or categorized_by in ('rule', 'user', 'import')
  )
);

-- Dedupe when bank/import supplies an external_id
create unique index if not exists business_expenses_account_external
  on business_expenses (account_id, external_id)
  where external_id is not null and account_id is not null;

-- Fallback dedupe key (import hash stored as external_id without account still unique per hash)
create unique index if not exists business_expenses_external_id_alone
  on business_expenses (external_id)
  where external_id is not null and account_id is null;

create index if not exists business_expenses_occurred
  on business_expenses (occurred_on desc);

create index if not exists business_expenses_bucket
  on business_expenses (ceo_bucket);

create index if not exists business_expenses_uncategorized
  on business_expenses (occurred_on desc)
  where ceo_bucket = 'uncategorized';

create index if not exists business_expenses_account
  on business_expenses (account_id, occurred_on desc);

create index if not exists business_expenses_payroll_run
  on business_expenses (payroll_run_id)
  where payroll_run_id is not null;
