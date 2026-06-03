-- ─────────────────────────────────────────────────────────────────────────────
-- Client contact fields
-- ─────────────────────────────────────────────────────────────────────────────
-- Identity datapoints surfaced in the Client Roster so the roster can hold all
-- of a client's data (billing contact + email). Safe to re-run.
-- Run in: Supabase Dashboard > SQL Editor > New query.

alter table clients add column if not exists billing_email   text;
alter table clients add column if not exists primary_contact text;
