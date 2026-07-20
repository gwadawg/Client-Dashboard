-- Media Buyer post-launch verification checklist (Funnel / Ads Manager / Mr. Waiz).
-- One row per client; timestamps null = not yet checked.

CREATE TABLE IF NOT EXISTS mb_launch_checks (
  client_id                uuid PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
  funnel_checked_at        timestamptz,
  ads_manager_checked_at   timestamptz,
  mr_waiz_checked_at       timestamptz,
  updated_by               uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at               timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE mb_launch_checks IS
  'Media Buyer Command: per-client Funnel / Ads Manager / Mr. Waiz checks for freshly launched accounts.';
