-- Frozen monthly payroll snapshots (finalize locks live report into history).

create table if not exists payroll_runs (
  id            uuid primary key default gen_random_uuid(),
  period_month  date not null,
  start_date    date not null,
  end_date      date not null,
  summary       jsonb not null,
  report        jsonb not null,
  finalized_at  timestamptz not null default now(),
  finalized_by  uuid references auth.users(id) on delete set null,
  notes         text,
  unique (period_month)
);

create table if not exists payroll_run_employees (
  id                  uuid primary key default gen_random_uuid(),
  payroll_run_id      uuid not null references payroll_runs(id) on delete cascade,
  period_month        date not null,
  agent_id            uuid references agents(id) on delete set null,
  agent_name          text not null,
  pay_type            text not null,
  section             text not null check (section in ('call_rep', 'b2b_setter', 'salaried')),
  total_pay           numeric(12, 2) not null,
  amounts             jsonb not null,
  counts              jsonb not null default '{}',
  rates               jsonb not null default '{}',
  line_items          jsonb not null default '[]',
  pending_disposition jsonb,
  unique (payroll_run_id, agent_id)
);

create index if not exists payroll_runs_period_month_idx on payroll_runs (period_month desc);
create index if not exists payroll_run_employees_agent_idx on payroll_run_employees (agent_id, period_month desc);
create index if not exists payroll_run_employees_period_idx on payroll_run_employees (period_month desc);
