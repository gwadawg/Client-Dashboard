-- Lifetime lock: one show payroll credit per lead_key (phone/name).
-- Used to prevent concurrent submit race overpaying two agents for the same show lead.
create table if not exists payroll_show_pay_claims (
  lead_key text primary key,
  agent_id uuid,
  agent_name text not null,
  event_id text not null,
  period_month date not null,
  claimed_at timestamptz not null default now()
);

create index if not exists payroll_show_pay_claims_period_idx
  on payroll_show_pay_claims (period_month desc);

create index if not exists payroll_show_pay_claims_agent_idx
  on payroll_show_pay_claims (agent_id, period_month desc);

comment on table payroll_show_pay_claims is
  'Claimed lead keys for call-rep show pay. Primary key enforces one lifetime show credit per lead.';
