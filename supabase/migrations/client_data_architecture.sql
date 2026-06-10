-- Client data architecture: billing void, entity links, activity views, attributes.

-- ── 1. Billing void (soft-delete) ─────────────────────────────────────────────
alter table client_billings add column if not exists voided_at timestamptz;
alter table client_billings add column if not exists voided_by uuid references auth.users(id) on delete set null;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'client_billings_status_check') then
    alter table client_billings drop constraint client_billings_status_check;
  end if;
  alter table client_billings add constraint client_billings_status_check check (
    status in ('pending', 'partial', 'paid', 'overdue', 'failed', 'refunded', 'voided')
  );
end $$;

-- ── 2. Cross-entity links ─────────────────────────────────────────────────────
alter table client_calls add column if not exists status_history_id uuid
  references client_status_history(id) on delete set null;

alter table client_notes add column if not exists related_call_id uuid
  references client_calls(id) on delete set null;

alter table client_status_history add column if not exists related_call_id uuid
  references client_calls(id) on delete set null;

create index if not exists client_calls_status_history on client_calls(status_history_id)
  where status_history_id is not null;
create index if not exists client_calls_type on client_calls(call_type);
create index if not exists client_notes_related_call on client_notes(related_call_id)
  where related_call_id is not null;

-- ── 3. Extensible client attributes ───────────────────────────────────────────
create table if not exists client_attributes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  attr_key    text not null,
  attr_value  jsonb not null default 'null'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null,
  updated_by  uuid references auth.users(id) on delete set null,
  constraint client_attributes_key_check check (char_length(trim(attr_key)) > 0),
  constraint client_attributes_client_key_unique unique (client_id, attr_key)
);

create index if not exists client_attributes_client on client_attributes(client_id);

-- ── 4. Unified account activity view ──────────────────────────────────────────
create or replace view v_client_activity as
  select
    h.client_id,
    h.id as source_id,
    'lifecycle'::text as activity_type,
    h.changed_at as occurred_at,
    coalesce(h.new_status, 'unknown') as subtype,
    trim(both ' ' from
      coalesce(h.previous_status, '—') || ' → ' || coalesce(h.new_status, '—')
      || coalesce(' · ' || h.reason_code, '')
      || coalesce(' — ' || left(h.note, 200), '')
    ) as summary,
    'client_status_history'::text as source_table
  from client_status_history h

  union all

  select
    c.client_id,
    c.id,
    'call'::text,
    c.called_at,
    c.call_type,
    trim(both ' ' from
      c.call_type
      || coalesce(' · ' || left(c.attendees, 80), '')
      || coalesce(' — ' || left(coalesce(c.notes, c.transcript), 200), '')
    ),
    'client_calls'::text
  from client_calls c

  union all

  select
    n.client_id,
    n.id,
    'note'::text,
    n.created_at,
    n.note_type,
    trim(both ' ' from
      n.note_type
      || coalesce(' · ' || n.reason_code, '')
      || ' — ' || left(n.body, 200)
    ),
    'client_notes'::text
  from client_notes n

  union all

  select
    a.client_id,
    a.id,
    'action'::text,
    a.created_at,
    coalesce(a.layer, 'action'),
    trim(both ' ' from
      a.title
      || coalesce(' · ' || a.constraint_label, '')
      || coalesce(' — ' || left(a.change_description, 160), '')
    ),
    'client_action_logs'::text
  from client_action_logs a

  union all

  select
    b.client_id,
    b.id,
    'billing'::text,
    (b.billed_on::timestamptz at time zone 'UTC'),
    b.status,
    trim(both ' ' from
      'Billing ' || b.status
      || ' $' || coalesce(b.amount::text, '0')
      || coalesce(' — ' || left(b.note, 160), '')
    ),
    'client_billings'::text
  from client_billings b
  where b.status is distinct from 'voided';

grant select on v_client_activity to service_role;
grant select on v_client_activity to authenticated;

-- ── 5. Churn reason analytics view ────────────────────────────────────────────
create or replace view v_churn_reasons as
select
  date_trunc('month', h.changed_at)::date as period_month,
  h.reason_code,
  count(*) as churn_count,
  coalesce(sum(h.mrr_at_change), 0) as lost_mrr
from client_status_history h
where h.new_status = 'churned'
  and h.reason_code is not null
group by date_trunc('month', h.changed_at), h.reason_code;

grant select on v_churn_reasons to service_role;
grant select on v_churn_reasons to authenticated;
