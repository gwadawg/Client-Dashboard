-- Acquisition cost channel taxonomy on the expense ledger.
-- Meta media dollars for CAC KPIs come from acquisition_meta_ad_insights;
-- ledger meta_media rows are reconcile-only (exclude_from_pnl) so card charges
-- do not double-count Graph spend.
-- Safe to re-run.

ALTER TABLE business_expenses
  ADD COLUMN IF NOT EXISTS acquisition_cost_channel text;

ALTER TABLE expense_category_rules
  ADD COLUMN IF NOT EXISTS acquisition_cost_channel text;

ALTER TABLE business_expenses DROP CONSTRAINT IF EXISTS business_expenses_acq_channel_check;
ALTER TABLE business_expenses ADD CONSTRAINT business_expenses_acq_channel_check
  CHECK (
    acquisition_cost_channel IS NULL OR acquisition_cost_channel IN (
      'meta_media',
      'creative_production',
      'paid_other',
      'referral_partner',
      'acquisition_labor'
    )
  );

ALTER TABLE expense_category_rules DROP CONSTRAINT IF EXISTS expense_rules_acq_channel_check;
ALTER TABLE expense_category_rules ADD CONSTRAINT expense_rules_acq_channel_check
  CHECK (
    acquisition_cost_channel IS NULL OR acquisition_cost_channel IN (
      'meta_media',
      'creative_production',
      'paid_other',
      'referral_partner',
      'acquisition_labor'
    )
  );

CREATE INDEX IF NOT EXISTS business_expenses_acq_channel
  ON business_expenses (acquisition_cost_channel)
  WHERE acquisition_cost_channel IS NOT NULL;

-- Backfill channel from subcategory / merchant for existing CAC rows
UPDATE business_expenses e
SET acquisition_cost_channel = CASE
  WHEN e.ceo_bucket <> 'cac' THEN NULL
  WHEN lower(coalesce(e.subcategory, '')) IN ('ad spend', 'adspend') THEN 'meta_media'
  WHEN lower(coalesce(e.merchant_normalized, e.merchant_raw, ''))
    ~ '(meta platforms|facebook|^fb$|adspend|b2b adspend)' THEN 'meta_media'
  WHEN lower(coalesce(e.merchant_normalized, e.merchant_raw, ''))
    ~ '(ben edit|pk media)' THEN 'creative_production'
  WHEN lower(coalesce(e.subcategory, '')) IN ('commissions', 'payroll') THEN 'acquisition_labor'
  WHEN e.source = 'payroll' AND e.ceo_bucket = 'cac' THEN 'acquisition_labor'
  WHEN lower(coalesce(e.subcategory, '')) IN ('marketing', 'media', 'contractor')
    THEN 'creative_production'
  WHEN lower(coalesce(e.merchant_normalized, e.merchant_raw, '')) ~ 'linkedin'
    OR lower(coalesce(e.subcategory, '')) = 'software' THEN 'paid_other'
  WHEN lower(coalesce(e.subcategory, '')) ~ 'refer' THEN 'referral_partner'
  ELSE coalesce(e.acquisition_cost_channel, 'creative_production')
END
WHERE e.ceo_bucket = 'cac';

-- Meta media ledger = reconcile vs Graph (exclude from P&L rollups)
UPDATE business_expenses
SET exclude_from_pnl = true
WHERE ceo_bucket = 'cac'
  AND acquisition_cost_channel = 'meta_media'
  AND coalesce(exclude_from_pnl, false) = false;

UPDATE expense_category_rules
SET acquisition_cost_channel = 'meta_media',
    exclude_from_pnl = true
WHERE ceo_bucket = 'cac'
  AND (
    lower(match_value) ~ '(adspend|meta platforms|facebook|^fb$)'
    OR lower(name) ~ '(ad spend|adspend|meta|facebook|^fb )'
  );

UPDATE expense_category_rules
SET acquisition_cost_channel = 'creative_production'
WHERE ceo_bucket = 'cac'
  AND acquisition_cost_channel IS NULL
  AND lower(match_value) ~ '(ben edit|pk media)';

UPDATE expense_category_rules
SET acquisition_cost_channel = 'paid_other'
WHERE ceo_bucket = 'cac'
  AND acquisition_cost_channel IS NULL
  AND lower(match_value) ~ 'linkedin';
