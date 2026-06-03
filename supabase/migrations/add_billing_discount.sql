-- ─────────────────────────────────────────────────────────────────────────────
-- Billing discount
-- ─────────────────────────────────────────────────────────────────────────────
-- A discount applied to a billing (e.g. when we cover something for a client).
-- The total due is reduced by it:
--   amount = base_amount + performance_amount + late_fee - discount
-- Safe to re-run.
-- Run in: Supabase Dashboard > SQL Editor > New query.

alter table client_billings add column if not exists discount numeric default 0;
