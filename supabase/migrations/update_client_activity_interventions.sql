-- Richer intervention summaries in the unified client activity timeline.
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
    'client_billings'::text from client_billings b where b.status is distinct from 'voided';

grant select on v_client_activity to service_role;
grant select on v_client_activity to authenticated;
