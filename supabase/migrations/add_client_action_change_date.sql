-- When the intervention actually went live (may differ from created_at if logged after the fact).
alter table client_action_logs
  add column if not exists change_date date;

-- Backfill: treat existing logs as change_date = log date.
update client_action_logs
set change_date = (created_at at time zone 'UTC')::date
where change_date is null;
