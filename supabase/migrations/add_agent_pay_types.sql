-- Unified employee pay types: call_rep (fulfillment) and b2b_setter (acquisition).

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'call_rep';

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_pay_type_check;
ALTER TABLE agents ADD CONSTRAINT agents_pay_type_check
  CHECK (pay_type IN ('call_rep', 'b2b_setter'));

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS pay_per_qualified_demo numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS pay_per_close numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS base_salary_prorate_days int;

ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS monthly_bonus numeric(10,2) NOT NULL DEFAULT 0;

-- Migrate active acquisition sales_reps into agents (skip duplicates by name).
INSERT INTO agents (
  name,
  phone,
  pay_type,
  base_salary,
  pay_per_qualified_demo,
  pay_per_close,
  monthly_bonus
)
SELECT
  sr.name,
  'b2b-' || sr.id::text,
  'b2b_setter',
  COALESCE((v.rates->>'base_salary')::numeric, 0),
  COALESCE((v.rates->>'demo_showed_qualified')::numeric, 0),
  COALESCE((v.rates->>'close_bonus')::numeric, 0),
  COALESCE((v.rates->>'monthly_bonus')::numeric, 0)
FROM sales_reps sr
LEFT JOIN LATERAL (
  SELECT rates
  FROM sales_rep_compensation_versions
  WHERE sales_rep_id = sr.id
  ORDER BY effective_from DESC
  LIMIT 1
) v ON true
WHERE sr.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM agents a WHERE lower(trim(a.name)) = lower(trim(sr.name))
  )
ON CONFLICT (phone) DO NOTHING;
