-- ─────────────────────────────────────────────────────────────────────────────
-- Billing breakdown + partial payments
-- ─────────────────────────────────────────────────────────────────────────────
-- Extends client_billings so a single billing can carry a base fee, a manual
-- performance add-on, and a late fee, and can be partially paid / extended.
--   amount      = total due = base_amount + performance_amount + late_fee
--   amount_paid = actually collected (0 < paid < amount => 'partial')
--   due_date    = when payment is due (separate from billed_on; pushing it later
--                 is an "extension")
-- Adds clients.performance_terms to record how a client's perf pricing is
-- calculated (so it's repeatable). Safe to re-run.
-- Run in: Supabase Dashboard > SQL Editor > New query.

alter table client_billings add column if not exists base_amount        numeric;
alter table client_billings add column if not exists performance_amount numeric default 0;
alter table client_billings add column if not exists late_fee           numeric default 0;
alter table client_billings add column if not exists amount_paid        numeric default 0;
alter table client_billings add column if not exists due_date           date;

-- Backfill existing rows: the old single amount becomes the base, and the due
-- date defaults to the billed date.
update client_billings set base_amount = amount where base_amount is null;
update client_billings set due_date    = billed_on where due_date is null;

-- Allow a 'partial' status alongside the existing set.
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'client_billings_status_check') then
    alter table client_billings drop constraint client_billings_status_check;
  end if;
  alter table client_billings add constraint client_billings_status_check check (
    status in ('pending', 'partial', 'paid', 'overdue', 'failed', 'refunded')
  );
end $$;

-- How a client's performance-based pricing is calculated (manual reference).
alter table clients add column if not exists performance_terms text;
