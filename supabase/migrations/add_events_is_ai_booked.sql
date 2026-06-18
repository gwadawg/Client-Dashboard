-- AI-booked appointments/callbacks are excluded from the agent credit queue but still count toward client KPIs.
alter table events add column if not exists is_ai_booked boolean;

create index if not exists idx_events_credit_queue_ai
  on events (occurred_at desc)
  where event_type in ('appointment_booked', 'callback_booked', 'live_transfer')
    and (is_ai_booked is null or is_ai_booked = false);
