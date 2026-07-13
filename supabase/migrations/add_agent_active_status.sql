-- Alumni vs active team members for roster + payroll reporting
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ended_on date;

CREATE INDEX IF NOT EXISTS agents_active_idx ON agents (active);

COMMENT ON COLUMN agents.active IS 'False = former employee (alumni). Historical payroll stays linked; live Team Payroll / schedule default to active only.';
COMMENT ON COLUMN agents.ended_on IS 'Last day employed when known; optional for alumni.';
