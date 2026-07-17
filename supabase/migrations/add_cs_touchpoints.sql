-- CS Slack touchpoint work queue (Client Success Follow-ups).
-- Work items only — does not alter events or client_action_logs semantics.

create table if not exists cs_touchpoints (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  touchpoint_type text not null,
  cycle_key text not null,
  status text not null default 'open',
  due_at timestamptz not null,
  triggered_at timestamptz not null default now(),
  completed_at timestamptz,
  snoozed_until timestamptz,
  trigger_source text not null,
  source_ref text,
  playbook_stage text,
  slack_sent boolean not null default false,
  slack_snippet text,
  completion_note text,
  completed_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cs_touchpoints_type_check check (
    touchpoint_type in (
      'post_ob',
      'mid_build',
      'pre_launch',
      'launch_day',
      'm1_expectation_reset',
      'first_lead',
      'first_qc',
      'first_booking',
      'first_show',
      'm2_biweekly'
    )
  ),
  constraint cs_touchpoints_status_check check (
    status in ('open', 'snoozed', 'done', 'skipped')
  ),
  constraint cs_touchpoints_trigger_source_check check (
    trigger_source in (
      'cs_appointment',
      'client_call',
      'event',
      'schedule',
      'manual'
    )
  ),
  constraint cs_touchpoints_client_type_cycle_key unique (client_id, touchpoint_type, cycle_key)
);

create index if not exists cs_touchpoints_open_due_idx
  on cs_touchpoints (due_at)
  where status in ('open', 'snoozed');

create index if not exists cs_touchpoints_client_completed_idx
  on cs_touchpoints (client_id, completed_at desc nulls last);

create index if not exists cs_touchpoints_status_due_idx
  on cs_touchpoints (status, due_at);

comment on table cs_touchpoints is
  'CSM Slack touchpoint work queue (post-OB through Month 2+). Complete requires slack snippet.';
