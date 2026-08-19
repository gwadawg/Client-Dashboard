-- Pre-fix ticket guard: structured "this update fixed these types"
-- plus coverage classification on tickets.

create table if not exists closebot_log_bug_types (
  log_id     uuid not null references closebot_prompt_log (id) on delete cascade,
  bug_type   text not null references closebot_bug_types (slug) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (log_id, bug_type)
);

create index if not exists closebot_log_bug_types_type_idx
  on closebot_log_bug_types (bug_type);

alter table closebot_tickets
  add column if not exists coverage text not null default 'actionable',
  add column if not exists covered_by_log_id uuid references closebot_prompt_log (id) on delete set null,
  add column if not exists coverage_manual boolean not null default false;

alter table closebot_tickets
  drop constraint if exists closebot_tickets_coverage_check;

alter table closebot_tickets
  add constraint closebot_tickets_coverage_check
    check (coverage in ('actionable', 'pre_fix'));

create index if not exists closebot_tickets_open_actionable_idx
  on closebot_tickets (status, occurred_at desc)
  where status in ('new', 'investigating', 'ticket_open')
    and coverage = 'actionable';

create index if not exists closebot_tickets_pre_fix_idx
  on closebot_tickets (occurred_at desc)
  where coverage = 'pre_fix';

create index if not exists closebot_tickets_agent_type_occurred_idx
  on closebot_tickets (agent_id, bug_type, occurred_at)
  where bug_type is not null;

create index if not exists closebot_tickets_covered_by_log_idx
  on closebot_tickets (covered_by_log_id)
  where covered_by_log_id is not null;
