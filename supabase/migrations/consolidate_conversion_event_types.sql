-- Consolidate legacy conversion event types into canonical names.
-- Safe to re-run: each step is idempotent or no-ops when already applied.
--
-- Legacy → Canonical:
--   closed          → loan_funded
--   proposal_sent   → proposal_made
--   loan_processing → submission_made

-- ── loan_funded (from closed) ────────────────────────────────────────────────

-- Drop rows that would duplicate an existing funded event for the same contact.
DELETE FROM events e
WHERE e.event_type = 'closed'
  AND e.ghl_contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM events f
    WHERE f.client_id = e.client_id
      AND f.event_type = 'loan_funded'
      AND f.ghl_contact_id = e.ghl_contact_id
  );

-- Keep earliest closed row per contact before rename.
DELETE FROM events e
USING (
  SELECT id,
    row_number() OVER (
      PARTITION BY client_id, ghl_contact_id
      ORDER BY occurred_at, id
    ) AS rn
  FROM events
  WHERE event_type = 'closed'
    AND ghl_contact_id IS NOT NULL
) d
WHERE e.id = d.id AND d.rn > 1;

UPDATE events
SET event_type = 'loan_funded'
WHERE event_type = 'closed';

-- ── proposal_made (from proposal_sent) ───────────────────────────────────────

DELETE FROM events e
WHERE e.event_type = 'proposal_sent'
  AND e.ghl_contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM events f
    WHERE f.client_id = e.client_id
      AND f.event_type = 'proposal_made'
      AND f.ghl_contact_id = e.ghl_contact_id
  );

DELETE FROM events e
USING (
  SELECT id,
    row_number() OVER (
      PARTITION BY client_id, ghl_contact_id
      ORDER BY occurred_at, id
    ) AS rn
  FROM events
  WHERE event_type = 'proposal_sent'
    AND ghl_contact_id IS NOT NULL
) d
WHERE e.id = d.id AND d.rn > 1;

UPDATE events
SET event_type = 'proposal_made'
WHERE event_type = 'proposal_sent';

-- ── submission_made (from loan_processing) ───────────────────────────────────

DELETE FROM events e
WHERE e.event_type = 'loan_processing'
  AND e.ghl_contact_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM events f
    WHERE f.client_id = e.client_id
      AND f.event_type = 'submission_made'
      AND f.ghl_contact_id = e.ghl_contact_id
  );

DELETE FROM events e
USING (
  SELECT id,
    row_number() OVER (
      PARTITION BY client_id, ghl_contact_id
      ORDER BY occurred_at, id
    ) AS rn
  FROM events
  WHERE event_type = 'loan_processing'
    AND ghl_contact_id IS NOT NULL
) d
WHERE e.id = d.id AND d.rn > 1;

UPDATE events
SET event_type = 'submission_made'
WHERE event_type = 'loan_processing';

-- ── Dedupe canonical conversion events (keep earliest per contact/stage) ───────

DELETE FROM events e
USING (
  SELECT id,
    row_number() OVER (
      PARTITION BY client_id, event_type, ghl_contact_id
      ORDER BY occurred_at, id
    ) AS rn
  FROM events
  WHERE event_type IN ('proposal_made', 'submission_made', 'loan_funded')
    AND ghl_contact_id IS NOT NULL
) d
WHERE e.id = d.id AND d.rn > 1;

-- Enforce one conversion event per contact per stage going forward.
CREATE UNIQUE INDEX IF NOT EXISTS events_conversion_unique
  ON events (client_id, event_type, ghl_contact_id)
  WHERE event_type IN ('proposal_made', 'submission_made', 'loan_funded')
    AND ghl_contact_id IS NOT NULL;
