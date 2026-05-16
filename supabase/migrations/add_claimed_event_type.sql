-- Client manually contacted / spoke with a lead outside the setter workflow.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_event_type_check;
ALTER TABLE events ADD CONSTRAINT events_event_type_check CHECK (
  event_type IN (
    'dial', 'lead', 'appointment_booked', 'appointment_cancelled', 'show', 'no_show', 'callback_booked',
    'live_transfer', 'proposal_sent', 'loan_processing', 'closed', 'out_of_state_lead',
    'lo_bailed', 'lo_audit', 'claimed'
  )
);
