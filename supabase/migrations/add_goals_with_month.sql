-- Agent KPI targets (daily dials, monthly Conversations show∪LT, etc.)
-- Monthly rows are keyed by month (YYYY-MM); daily rows leave month null.

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agent_name text,
  metric text not null,
  target numeric not null check (target > 0),
  period text not null check (period in ('daily', 'monthly')),
  month text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goals_month_format check (
    month is null or month ~ '^\d{4}-\d{2}$'
  ),
  constraint goals_month_period_consistency check (
    (period = 'daily' and month is null)
    or (period = 'monthly' and month is not null)
  )
);

create unique index if not exists goals_unique_key
  on goals (client_id, agent_name, metric, period, month)
  nulls not distinct;

create index if not exists goals_agent_period_idx
  on goals (agent_name, period, month);

comment on table goals is
  'Per-agent KPI targets. Monthly rows are month-keyed (YYYY-MM); daily rows have month null.';
comment on column goals.month is
  'Calendar month YYYY-MM for period=monthly; null for daily';
