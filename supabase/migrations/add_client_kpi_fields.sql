-- Lead flags (set on event_type = 'lead' via webhook)
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_qualified boolean;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_hot boolean;
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_out_of_state boolean;

-- Expand event types for client KPIs
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (
  event_type IN (
    'dial', 'lead', 'appointment_booked', 'show', 'no_show', 'callback_booked',
    'live_transfer', 'proposal_sent', 'closed', 'out_of_state_lead'
  )
);
