-- Billing-specific pause: client can stay lifecycle-active while being excluded
-- from the billing queue (Past Due / Upcoming). Distinct from lifecycle pause.

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_paused boolean NOT NULL DEFAULT false;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_paused_at timestamptz;

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS billing_paused_note text;

CREATE INDEX IF NOT EXISTS clients_billing_paused_idx
  ON clients (billing_paused)
  WHERE billing_paused = true;
