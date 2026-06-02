-- ─────────────────────────────────────────────────────────────────────────────
-- Client Billings (append-only ledger of every billing made per client)
-- ─────────────────────────────────────────────────────────────────────────────
-- One row = one billing event. The dashboard's Billing tab reads this to show
-- per-client history, status, and totals; the "next billing date" is DERIVED in
-- application code from clients.billing_type / date_signed + the latest row here
-- (not stored), so it never drifts.
--
-- Waiz is the sole owner of billing data (no ClickUp sync). Reached only via the
-- service-role client in API routes, matching every other table (no RLS).
--
-- Safe to re-run: all statements use IF NOT EXISTS.
-- Run in: Supabase Dashboard > SQL Editor > New query.

create table if not exists client_billings (
  id           uuid    primary key default gen_random_uuid(),
  client_id    uuid    not null references clients(id) on delete cascade,
  billed_on    date    not null,                 -- date this billing was issued
  period_start date,                             -- service period this covers
  period_end   date,
  amount       numeric not null,
  status       text    not null default 'pending',  -- pending | paid | overdue | failed | refunded
  paid_on      date,
  method       text,                             -- card | ach | wire | stripe | manual
  invoice_ref  text,                             -- external invoice / Stripe id
  note         text,
  created_by   uuid    references auth.users(id) on delete set null,
  created_at   timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_billings_status_check') then
    alter table client_billings add constraint client_billings_status_check check (
      status in ('pending', 'paid', 'overdue', 'failed', 'refunded')
    );
  end if;
end $$;

-- Per-client history, newest first (drives the expandable ledger).
create index if not exists client_billings_client_billed
  on client_billings (client_id, billed_on desc);

-- Hot path for the reminder job + "overdue" rollups: only unpaid rows.
create index if not exists client_billings_open_status
  on client_billings (status, billed_on)
  where status in ('pending', 'overdue');
