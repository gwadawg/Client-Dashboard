-- One-time backfill: rewrite legacy conversion events to canonical names.
-- Safe to re-run because updates are idempotent.

UPDATE events
SET event_type = 'proposal_made'
WHERE event_type = 'proposal_sent';

UPDATE events
SET event_type = 'submission_made'
WHERE event_type = 'loan_processing';

UPDATE events
SET event_type = 'loan_funded'
WHERE event_type = 'closed';
