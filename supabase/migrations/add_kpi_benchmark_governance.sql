-- Governance metadata for per-client KPI benchmark overrides (clients.kpi_benchmarks).
-- Keeps "just use it" honest: every override carries who set it, when, and why, so a
-- per-client bar can't silently rot to "always green". Staleness (untouched > 90 days)
-- is flagged in the Client Roster editor. All nullable/additive — no behavior change
-- until a benchmark is saved through the editor.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kpi_benchmarks_updated_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kpi_benchmarks_updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kpi_benchmarks_note text;
