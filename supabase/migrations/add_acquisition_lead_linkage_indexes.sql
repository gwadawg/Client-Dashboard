-- Phone-based linkage backfill for acquisition child tables.
-- Prefer leads that already have ghl_contact_id when multiple phone matches exist.
-- Run after GHL contact index backfill (scripts/backfill-acquisition-ghl-linkage.mjs).

-- Appointments → leads
WITH phone_match AS (
  SELECT DISTINCT ON (a.id)
    a.id AS appt_id,
    l.id AS lead_id
  FROM acquisition_appointments a
  JOIN acquisition_leads l
    ON right(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g'), 10)
     = right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10)
    AND length(regexp_replace(coalesce(a.phone, ''), '\D', '', 'g')) >= 10
  WHERE a.lead_id IS NULL
  ORDER BY a.id, (l.ghl_contact_id IS NOT NULL) DESC, l.created_at DESC
)
UPDATE acquisition_appointments a
SET lead_id = pm.lead_id, updated_at = now()
FROM phone_match pm
WHERE a.id = pm.appt_id AND a.lead_id IS NULL;

-- Offers → leads (sheet import phone in raw)
WITH phone_match AS (
  SELECT DISTINCT ON (o.id)
    o.id AS offer_id,
    l.id AS lead_id
  FROM acquisition_offers o
  JOIN acquisition_leads l
    ON right(regexp_replace(coalesce(o.raw->'sheet'->>'Phone Number', o.raw->>'phone', ''), '\D', '', 'g'), 10)
     = right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10)
    AND length(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g')) >= 10
  WHERE o.lead_id IS NULL
  ORDER BY o.id, (l.ghl_contact_id IS NOT NULL) DESC, l.created_at DESC
)
UPDATE acquisition_offers o
SET lead_id = pm.lead_id, updated_at = now()
FROM phone_match pm
WHERE o.id = pm.offer_id AND o.lead_id IS NULL;

-- Dials → leads
WITH phone_match AS (
  SELECT DISTINCT ON (d.id)
    d.id AS dial_id,
    l.id AS lead_id
  FROM acquisition_dials d
  JOIN acquisition_leads l
    ON right(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g'), 10)
     = right(regexp_replace(coalesce(l.phone, ''), '\D', '', 'g'), 10)
    AND length(regexp_replace(coalesce(d.phone, ''), '\D', '', 'g')) >= 10
  WHERE d.lead_id IS NULL
  ORDER BY d.id, (l.ghl_contact_id IS NOT NULL) DESC, l.created_at DESC
)
UPDATE acquisition_dials d
SET lead_id = pm.lead_id
FROM phone_match pm
WHERE d.id = pm.dial_id AND d.lead_id IS NULL;

create index if not exists acquisition_leads_email_lower_idx
  on acquisition_leads (lower(email))
  where email is not null;
