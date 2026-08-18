-- Client work log: Findings / Cadence / Bets.
-- Existing action rows are measured interventions → work_type = bet.
-- Week-plan tasks default to cadence (hygiene) unless marked as a bet.

alter table client_action_logs
  add column if not exists work_type text not null default 'bet';

alter table client_action_logs
  add column if not exists planned_date date;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'client_action_logs_work_type_check'
  ) then
    alter table client_action_logs
      add constraint client_action_logs_work_type_check
      check (work_type in ('finding', 'cadence', 'bet'));
  end if;
end $$;

create index if not exists client_action_logs_client_type_change_idx
  on client_action_logs (client_id, work_type, change_date);

alter table account_plan_tasks
  add column if not exists work_type text not null default 'cadence';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'account_plan_tasks_work_type_check'
  ) then
    alter table account_plan_tasks
      add constraint account_plan_tasks_work_type_check
      check (work_type in ('finding', 'cadence', 'bet'));
  end if;
end $$;

create or replace view v_client_activity as
  select h.client_id, h.id as source_id, 'lifecycle'::text as activity_type,
    h.changed_at as occurred_at, coalesce(h.new_status, 'unknown') as subtype,
    trim(both ' ' from coalesce(h.previous_status, '—') || ' → ' || coalesce(h.new_status, '—')
      || coalesce(' · ' || h.reason_code, '') || coalesce(' — ' || left(h.note, 200), '')) as summary,
    'client_status_history'::text as source_table
  from client_status_history h
  union all
  select c.client_id, c.id, 'call'::text, c.called_at, c.call_type,
    trim(both ' ' from c.call_type || coalesce(' · ' || left(c.attendees, 80), '')
      || coalesce(' — ' || left(coalesce(c.notes, c.transcript), 200), '')),
    'client_calls'::text from client_calls c where c.deleted_at is null
  union all
  select n.client_id, n.id, 'note'::text, n.created_at, n.note_type,
    trim(both ' ' from n.note_type || coalesce(' · ' || n.reason_code, '') || ' — ' || left(n.body, 200)),
    'client_notes'::text from client_notes n where n.deleted_at is null
  union all
  select a.client_id, a.id, 'action'::text,
    coalesce(
      a.change_date::timestamptz at time zone 'UTC',
      a.planned_date::timestamptz at time zone 'UTC',
      a.created_at
    ),
    coalesce(a.work_type, a.status, 'action'),
    trim(both ' ' from coalesce(a.work_type, 'work')
      || ' · ' || a.title
      || coalesce(' · ' || a.status, '')
      || coalesce(' · ' || a.success_metric, '')
      || coalesce(' · review ' || a.review_date::text, '')
      || coalesce(' — ' || left(a.change_description, 120), '')),
    'client_action_logs'::text from client_action_logs a
  union all
  select b.client_id, b.id, 'billing'::text, (b.billed_on::timestamptz at time zone 'UTC'), b.status,
    trim(both ' ' from 'Billing ' || b.status || ' $' || coalesce(b.amount::text, '0')
      || coalesce(' — ' || left(b.note, 160), '')),
    'client_billings'::text from client_billings b where b.status is distinct from 'voided'
  union all
  select t.client_id, t.id, 'touchpoint'::text, t.triggered_at, t.status,
    trim(both ' ' from replace(t.touchpoint_type, '_', ' ')
      || ' · ' || t.status
      || coalesce(' · ' || t.playbook_stage, '')
      || coalesce(' — ' || left(t.completion_note, 160), '')),
    'cs_touchpoints'::text from cs_touchpoints t
  union all
  select m.client_id, m.id, 'commitment'::text, m.created_at, m.status,
    trim(both ' ' from m.severity || ' · ' || m.status
      || coalesce(' · ' || nullif(m.constraint_label, ''), '')
      || ' · due ' || m.due_date::text
      || coalesce(' — ' || left(nullif(m.plan, ''), 160), '')
      || coalesce(' (why: ' || left(nullif(m.why, ''), 120) || ')', '')),
    'meeting_commitments'::text from meeting_commitments m
  union all
  select p.client_id, p.id, 'plan'::text,
    (p.week_start::timestamptz at time zone 'UTC'), p.status,
    trim(both ' ' from 'Week of ' || p.week_start::text || ' · ' || p.status
      || coalesce(' · ' || p.severity, '')
      || coalesce(' — ' || left(nullif(p.why, ''), 160), '')
      || coalesce(' · signal: ' || left(nullif(p.success_signal, ''), 100), '')),
    'account_week_plans'::text from account_week_plans p
  union all
  select k.client_id, k.id, 'task'::text, k.created_at, k.status,
    trim(both ' ' from coalesce(k.work_type || ' · ', '') || k.title || ' · ' || k.status
      || coalesce(' · ' || k.tactic_tag, '')
      || coalesce(' · verdict ' || k.review_verdict, '')
      || coalesce(' — ' || left(k.completion_report, 160), '')),
    'account_plan_tasks'::text from account_plan_tasks k
  union all
  select s.client_id, s.id, 'health'::text,
    (s.period_end::timestamptz at time zone 'UTC'), coalesce(s.worst_tier, 'unknown'),
    trim(both ' ' from coalesce(s.window_code, 'health check')
      || ' ' || s.period_start::text || '→' || s.period_end::text
      || coalesce(' · tier ' || s.worst_tier, '')
      || coalesce(' · attention ' || round(s.attention_score, 1)::text, '')
      || coalesce(' · constraint ' || coalesce(nullif(s.constraint_label, ''), s.primary_constraint), '')),
    'client_health_snapshots'::text from client_health_snapshots s
  union all
  select r.client_id, r.id, 'mrr'::text, r.changed_at,
    case
      when coalesce(r.new_mrr, 0) > coalesce(r.previous_mrr, 0) then 'increase'
      when coalesce(r.new_mrr, 0) < coalesce(r.previous_mrr, 0) then 'decrease'
      else 'change'
    end,
    trim(both ' ' from 'MRR $' || coalesce(r.previous_mrr::text, '0')
      || ' → $' || coalesce(r.new_mrr::text, '0')
      || coalesce(' — ' || left(r.note, 160), '')),
    'client_mrr_history'::text from client_mrr_history r;

grant select on v_client_activity to service_role;
grant select on v_client_activity to authenticated;
