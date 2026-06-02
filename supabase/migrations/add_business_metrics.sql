-- ─────────────────────────────────────────────────────────────────────────────
-- Business Metrics (company-wide KPI time series for the CEO view)
-- ─────────────────────────────────────────────────────────────────────────────
-- Flexible key/value-over-time table so new high-level metrics can be tracked
-- without schema changes. `dimension` allows optional slicing (e.g. offer=RM).
--
-- All other client data (profile, contact, lifecycle, revenue, health) lives on
-- the `clients` table — one row per client, one table for client data.
--
-- Safe to re-run: all statements use IF NOT EXISTS.

create table if not exists business_metrics (
  id            uuid    primary key default gen_random_uuid(),
  metric_key    text    not null,    -- total_mrr | active_clients | new_clients | churned_clients | headcount | cash_balance | ...
  period_date   date    not null,    -- the day/month this value is for
  value_numeric numeric,
  value_text    text,
  dimension     text,                -- optional slice label, e.g. 'offer=RM'
  notes         text,
  created_by    uuid    references auth.users(id) on delete set null,
  created_at    timestamptz default now()
);

-- Uniqueness across metric + period + dimension (nulls treated as '').
create unique index if not exists business_metrics_key_period_dim
  on business_metrics (metric_key, period_date, coalesce(dimension, ''));

create index if not exists business_metrics_key_period
  on business_metrics (metric_key, period_date desc);
