-- Make conversion-event ingest idempotent: no duplicate proposal/submission/funded
-- rows for the same contact, even when GHL/Make re-fires a pipeline update.
-- Run once in: Supabase Dashboard > SQL Editor > New query.

-- 1. Remove existing duplicate conversion events, keeping the earliest per
--    (client, contact, stage). Must run before the unique index can be created.
delete from events e
using (
  select id,
    row_number() over (
      partition by client_id, event_type, ghl_contact_id
      order by occurred_at, id
    ) as rn
  from events
  where event_type in ('proposal_made','submission_made','loan_funded')
    and ghl_contact_id is not null
) d
where e.id = d.id and d.rn > 1;

-- 2. Enforce one conversion event per contact per stage going forward.
--    Partial index: only canonical conversion types, and only when we have an
--    identity to dedupe on (ghl_contact_id). The webhook catches the resulting
--    unique-violation (SQLSTATE 23505) and returns success with skipped:true.
create unique index if not exists events_conversion_unique
  on events (client_id, event_type, ghl_contact_id)
  where event_type in ('proposal_made','submission_made','loan_funded')
    and ghl_contact_id is not null;
