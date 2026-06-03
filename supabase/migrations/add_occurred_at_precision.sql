-- Track whether an event's occurred_at carries a real time of day.
-- Speed-to-lead requires precise timestamps on BOTH the lead and its first dial;
-- date-only leads (occurred_at_has_time = false) are excluded from the metric.
alter table public.events add column if not exists occurred_at_has_time boolean;

-- Backfill: leads historically imported with only a date were defaulted to
-- midnight/noon UTC and carry no usable time of day.
update public.events
  set occurred_at_has_time = false
  where event_type = 'lead'
    and occurred_at_has_time is null
    and occurred_at::time in ('00:00:00', '12:00:00');

-- Everything else is assumed to have carried a real time (best-effort for legacy rows).
update public.events
  set occurred_at_has_time = true
  where occurred_at_has_time is null;
