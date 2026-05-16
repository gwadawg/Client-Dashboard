-- GHL calendar id for filtering/grouping appointments (run in Supabase SQL editor if schema.sql wasn't reapplied)
alter table public.events add column if not exists calendar_id text;
create index if not exists events_calendar_id_idx
  on public.events (calendar_id) where calendar_id is not null;
