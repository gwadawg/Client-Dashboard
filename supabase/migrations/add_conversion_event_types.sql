-- Add canonical conversion lifecycle event types while keeping legacy aliases.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (
  event_type IN (
    'dial', 'lead', 'appointment_booked', 'appointment_cancelled', 'show', 'no_show', 'callback_booked',
    'live_transfer', 'proposal_sent', 'loan_processing', 'closed',
    'proposal_made', 'submission_made', 'loan_funded',
    'out_of_state_lead', 'lo_bailed', 'lo_audit', 'claimed'
  )
);
