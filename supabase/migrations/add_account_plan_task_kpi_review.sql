-- Target KPI + team review fields on account plan tasks.
-- Complements scheduled work without merging into Client Success action logs unless opted in.

ALTER TABLE account_plan_tasks
  ADD COLUMN IF NOT EXISTS success_metric text,
  ADD COLUMN IF NOT EXISTS baseline_value numeric,
  ADD COLUMN IF NOT EXISTS outcome_value numeric,
  ADD COLUMN IF NOT EXISTS review_notes text,
  ADD COLUMN IF NOT EXISTS review_verdict text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'account_plan_tasks_review_verdict_check'
  ) THEN
    ALTER TABLE account_plan_tasks
      ADD CONSTRAINT account_plan_tasks_review_verdict_check CHECK (
        review_verdict IS NULL OR review_verdict IN (
          'helped', 'no_change', 'hurt', 'unclear', 'too_early'
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS account_plan_tasks_completed_at_idx
  ON account_plan_tasks (completed_at DESC)
  WHERE completed_at IS NOT NULL;
