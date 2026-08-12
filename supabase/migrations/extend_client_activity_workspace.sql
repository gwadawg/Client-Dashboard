-- Extend the unified client activity timeline with the six remaining sources that
-- already carry (client_id, a timestamp, a description): CS touchpoints, meeting
-- commitments, weekly account plans and their tasks, health snapshots and MRR
-- changes. The Client Workspace history rail reads this view, and "what did we
-- actually do for this account" is unanswerable without them.
--
-- The output shape is unchanged — (client_id, source_id, activity_type,
-- occurred_at, subtype, summary, source_table) — so neither
-- /api/clients/[id]/activity nor any renderer needs to change.
--
-- Date-only sources are anchored with the `::timestamptz at time zone 'UTC'`
-- idiom already used by the billing and action branches, so all date-only rows
-- in the view share one convention.

-- An 11-branch UNION ALL ordered by occurred_at DESC is only cheap if each
-- branch can walk an index for `where client_id = $1 order by <ts> desc`. Five
-- of the six new sources already have a matching (client_id, <ts> desc) index;
-- cs_touchpoints only had one on completed_at, which is null for open work.
create index if not exists cs_touchpoints_client_triggered_idx
  on cs_touchpoints (client_id, triggered_at desc);

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
    coalesce(a.change_date::timestamptz at time zone 'UTC', a.created_at),
    coalesce(a.status, 'action'),
    trim(both ' ' from a.title
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
  -- Lifecycle touchpoints: dated from when the touchpoint was raised, not when
  -- it was closed, so open and snoozed work still appears on the timeline.
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
    trim(both ' ' from k.title || ' · ' || k.status
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification. Run in the SQL editor after applying, substituting a real
-- client_id. Every one of the eleven branches should show an Index Scan or
-- Bitmap Heap Scan driven by its (client_id, <timestamp>) index. A Seq Scan on
-- any source table means the client_id predicate failed to push into that
-- branch — check that the branch has no expression preventing pushdown, and
-- that the table's client index exists.
--
--   explain (analyze, buffers)
--   select * from v_client_activity
--   where client_id = '00000000-0000-0000-0000-000000000000'
--   order by occurred_at desc
--   limit 500;
--
-- Row counts by source, to confirm the new branches actually resolve:
--
--   select source_table, activity_type, count(*)
--   from v_client_activity group by 1, 2 order by 1;
-- ─────────────────────────────────────────────────────────────────────────────
