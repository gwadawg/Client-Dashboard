-- Update events.event_type check constraint to allow conversion + other newer event types.
-- Run once in: Supabase Dashboard > SQL Editor > New query.
--
-- Why this is needed: schema.sql defines the events table with
-- `create table if not exists`, so re-running it does NOT change the constraint
-- on an already-existing events table. The live DB kept the old allow-list and
-- rejected proposal_made / submission_made / loan_funded with:
--   new row for relation "events" violates check constraint "events_event_type_check"

alter table events
  drop constraint if exists events_event_type_check;

alter table events
  add constraint events_event_type_check check (
    event_type in (
      'dial', 'lead', 'appointment_booked', 'appointment_cancelled', 'show', 'no_show', 'callback_booked',
      'live_transfer', 'proposal_sent', 'loan_processing', 'closed',
      'proposal_made', 'submission_made', 'loan_funded',
      'out_of_state_lead',
      'lo_bailed', 'lo_audit', 'claimed'
    )
  );
