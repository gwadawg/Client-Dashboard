-- ─────────────────────────────────────────────────────────────────────────────
-- Explicit billing day of month
-- ─────────────────────────────────────────────────────────────────────────────
-- The day of the month (1-31) a client should be billed. When set, this is the
-- source of truth for the recurring billing day; otherwise the app falls back
-- to the launch-date day. Days past a short month's length clamp to month end
-- (handled in app code). Safe to re-run.
-- Run in: Supabase Dashboard > SQL Editor > New query.

alter table clients add column if not exists billing_day smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clients_billing_day_check') then
    alter table clients add constraint clients_billing_day_check
      check (billing_day is null or (billing_day >= 1 and billing_day <= 31));
  end if;
end $$;
