-- Billing data foundation: CEO revenue tags, Stripe linkage, audit events.
-- Idempotent — safe to re-run.

-- ── Expand revenue_type taxonomy ─────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'client_billings_revenue_type_check') then
    alter table client_billings drop constraint client_billings_revenue_type_check;
  end if;
  alter table client_billings add constraint client_billings_revenue_type_check
    check (revenue_type is null or revenue_type in (
      'mrr', 'pif', 'performance', 'passthrough', 'upsell', 'one_off'
    ));
end $$;

-- ── Stripe ids + first-payment flag on ledger ────────────────────────────────
alter table client_billings add column if not exists stripe_invoice_id text;
alter table client_billings add column if not exists stripe_payment_intent_id text;
alter table client_billings add column if not exists is_first_payment boolean not null default false;

create unique index if not exists client_billings_stripe_invoice_uid
  on client_billings (stripe_invoice_id)
  where stripe_invoice_id is not null;

create unique index if not exists client_billings_stripe_payment_intent_uid
  on client_billings (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

create index if not exists client_billings_is_first_payment
  on client_billings (client_id, paid_on)
  where is_first_payment = true;

-- ── Append-only billing events ───────────────────────────────────────────────
create table if not exists billing_events (
  id          uuid primary key default gen_random_uuid(),
  billing_id  uuid not null references client_billings(id) on delete cascade,
  client_id   uuid not null references clients(id) on delete cascade,
  event_type  text not null
    check (event_type in ('created', 'updated', 'payment', 'voided', 'status_changed')),
  actor_id    uuid references auth.users(id) on delete set null,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists billing_events_billing_created
  on billing_events (billing_id, created_at desc);

create index if not exists billing_events_client_created
  on billing_events (client_id, created_at desc);

-- ── Stripe invoice staging (webhook sync later) ──────────────────────────────
create table if not exists stripe_invoices (
  id                   uuid primary key default gen_random_uuid(),
  stripe_invoice_id    text not null unique,
  stripe_customer_id   text,
  customer_email       text,
  amount_due           numeric,
  amount_paid          numeric,
  status               text,
  currency             text default 'usd',
  hosted_invoice_url   text,
  raw                  jsonb not null default '{}'::jsonb,
  matched_billing_id   uuid references client_billings(id) on delete set null,
  matched_client_id    uuid references clients(id) on delete set null,
  matched_at           timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists stripe_invoices_customer
  on stripe_invoices (stripe_customer_id)
  where stripe_customer_id is not null;

create index if not exists stripe_invoices_unmatched
  on stripe_invoices (status, created_at desc)
  where matched_billing_id is null;
