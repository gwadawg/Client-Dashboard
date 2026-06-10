-- Phase 2: remaining audit gaps — precision churn, call/note fields, MRR history, dedupe.

-- ── churned_at precision (date → timestamptz) ─────────────────────────────────
alter table clients alter column churned_at type timestamptz using (
  case when churned_at is null then null else churned_at::timestamptz end
);

create or replace function public.log_client_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.lifecycle_status is distinct from old.lifecycle_status then
    insert into public.client_status_history
      (client_id, previous_status, new_status, mrr_at_change, source)
    values
      (new.id, old.lifecycle_status, new.lifecycle_status, new.mrr, 'trigger');

    new.last_status_changed_at := now();

    if new.lifecycle_status = 'churned' then
      new.churned_at := now();
    elsif new.lifecycle_status not in ('churned', 'off_boarding') then
      new.churned_at := null;
    end if;
  end if;
  return new;
end;
$$;

-- ── Account calls: structured fields + soft delete ────────────────────────────
alter table client_calls add column if not exists duration_seconds int;
alter table client_calls add column if not exists disposition text;
alter table client_calls add column if not exists follow_up_due_at timestamptz;
alter table client_calls add column if not exists deleted_at timestamptz;

-- ── Notes: edit trail + soft delete ───────────────────────────────────────────
alter table client_notes add column if not exists updated_at timestamptz;
alter table client_notes add column if not exists updated_by uuid references auth.users(id) on delete set null;
alter table client_notes add column if not exists deleted_at timestamptz;

-- ── Billing ↔ lifecycle link ──────────────────────────────────────────────────
alter table client_billings add column if not exists status_history_id uuid
  references client_status_history(id) on delete set null;

-- ── MRR change history ────────────────────────────────────────────────────────
create table if not exists client_mrr_history (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references clients(id) on delete cascade,
  previous_mrr  numeric,
  new_mrr       numeric,
  changed_at    timestamptz not null default now(),
  changed_by    uuid references auth.users(id) on delete set null,
  note          text
);
create index if not exists client_mrr_history_client on client_mrr_history(client_id, changed_at desc);

-- ── Billing reminder dedupe ───────────────────────────────────────────────────
create table if not exists billing_reminder_log (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references clients(id) on delete cascade,
  reminder_date   date not null,
  next_billing_date date not null,
  clickup_task_id text,
  created_at      timestamptz not null default now(),
  unique (client_id, reminder_date)
);
create index if not exists billing_reminder_log_date on billing_reminder_log(reminder_date desc);

-- ── Full-text search (generated columns) ──────────────────────────────────────
alter table client_calls add column if not exists search_vector tsvector
  generated always as (
    to_tsvector('english',
      coalesce(transcript, '') || ' ' ||
      coalesce(notes, '') || ' ' ||
      coalesce(attendees, '')
    )
  ) stored;
create index if not exists client_calls_search on client_calls using gin(search_vector);

alter table client_notes add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', coalesce(body, ''))) stored;
create index if not exists client_notes_search on client_notes using gin(search_vector);

-- Refresh activity view (exclude soft-deleted)
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
  select a.client_id, a.id, 'action'::text, a.created_at, coalesce(a.layer, 'action'),
    trim(both ' ' from a.title || coalesce(' · ' || a.constraint_label, '')
      || coalesce(' — ' || left(a.change_description, 160), '')),
    'client_action_logs'::text from client_action_logs a
  union all
  select b.client_id, b.id, 'billing'::text, (b.billed_on::timestamptz at time zone 'UTC'), b.status,
    trim(both ' ' from 'Billing ' || b.status || ' $' || coalesce(b.amount::text, '0')
      || coalesce(' — ' || left(b.note, 160), '')),
    'client_billings'::text from client_billings b where b.status is distinct from 'voided';

grant select on v_client_activity to service_role;
grant select on v_client_activity to authenticated;

-- Churn analytics includes off_boarding departures
create or replace view v_churn_reasons as
select date_trunc('month', h.changed_at)::date as period_month, h.reason_code,
  count(*) as churn_count, coalesce(sum(h.mrr_at_change), 0) as lost_mrr
from client_status_history h
where h.new_status in ('churned', 'off_boarding') and h.reason_code is not null
group by date_trunc('month', h.changed_at), h.reason_code;

grant select on v_churn_reasons to service_role;
grant select on v_churn_reasons to authenticated;
