-- One-time backfill for billings missing revenue tags (UI writes before foundation).
-- Safe to re-run; only touches rows with null/empty type or segment.

WITH ranked AS (
  SELECT
    b.id,
    b.client_id,
    ROW_NUMBER() OVER (
      PARTITION BY b.client_id
      ORDER BY coalesce(b.paid_on, b.billed_on), b.created_at
    ) AS paid_ord
  FROM client_billings b
  WHERE b.status <> 'voided'
    AND coalesce(b.revenue_type, '') <> 'passthrough'
    AND (coalesce(b.amount_paid, 0) > 0 OR b.status = 'paid')
),
untagged AS (
  SELECT
    b.id,
    b.client_id,
    c.billing_type,
    c.contract_term_months,
    c.source,
    EXISTS (
      SELECT 1 FROM ranked r
      WHERE r.client_id = b.client_id
        AND r.id <> b.id
        AND r.paid_ord < coalesce(
          (SELECT r2.paid_ord FROM ranked r2 WHERE r2.id = b.id),
          9999
        )
    ) AS has_prior_paid
  FROM client_billings b
  JOIN clients c ON c.id = b.client_id
  WHERE b.status <> 'voided'
    AND (
      b.revenue_type IS NULL OR b.revenue_type = ''
      OR b.revenue_segment IS NULL OR b.revenue_segment = ''
    )
)
UPDATE client_billings b
SET
  revenue_type = coalesce(
    nullif(b.revenue_type, ''),
    CASE
      WHEN u.billing_type = 'pif' THEN 'pif'
      WHEN u.billing_type IN ('monthly', 'pif_monthly') THEN 'mrr'
      ELSE 'mrr'
    END
  ),
  revenue_segment = coalesce(
    nullif(b.revenue_segment, ''),
    CASE
      WHEN NOT u.has_prior_paid
        AND (coalesce(b.amount_paid, 0) > 0 OR b.status = 'paid')
      THEN 'front_end'
      ELSE 'back_end'
    END
  ),
  term_months = CASE
    WHEN coalesce(
      nullif(b.revenue_type, ''),
      CASE WHEN u.billing_type = 'pif' THEN 'pif' ELSE null END
    ) = 'pif'
    THEN coalesce(b.term_months, u.contract_term_months)
    ELSE b.term_months
  END,
  lead_source = coalesce(nullif(b.lead_source, ''), u.source),
  is_first_payment = CASE
    WHEN NOT u.has_prior_paid
      AND (coalesce(b.amount_paid, 0) > 0 OR b.status = 'paid')
      AND coalesce(b.revenue_type, '') IS DISTINCT FROM 'passthrough'
    THEN true
    ELSE b.is_first_payment
  END
FROM untagged u
WHERE b.id = u.id;
