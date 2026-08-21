-- Ads spend pause: client can stay lifecycle-active while Meta/ads are off.
-- Distinct from lifecycle pause (account offline) and billing_paused.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS ads_paused boolean NOT NULL DEFAULT false;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS ads_paused_at timestamptz;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS ads_paused_note text;

CREATE INDEX IF NOT EXISTS clients_ads_paused_idx
  ON clients (ads_paused)
  WHERE ads_paused = true;

-- Best-effort backfill from legacy ClickUp free-text ad_status.
UPDATE clients
SET ads_paused = true
WHERE ads_paused = false
  AND ad_status IS NOT NULL
  AND lower(trim(ad_status)) IN (
    'paused',
    'off',
    'stopped',
    'inactive',
    'turned off',
    'ads paused',
    'paused ads'
  );
