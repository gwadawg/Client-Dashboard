-- Unified read model: appointment shells + linked call touchpoints + queue actions.

create or replace view v_acquisition_appointment_enriched as
select
  a.id,
  a.lead_id,
  a.ghl_appointment_id,
  a.appointment_type,
  a.calendar_id,
  a.booking_source,
  a.how_booked,
  a.booked_at,
  a.scheduled_at,
  a.status,
  a.qualified,
  a.setter_name,
  a.call_taken_by,
  a.lead_name,
  a.phone,
  a.intro_call_id,
  a.demo_credit_claimed_at,
  a.demo_credit_slack_notified_at,
  a.inserted_at,
  a.updated_at,
  c.id as call_id,
  c.call_type as call_type,
  c.called_at as call_called_at,
  c.status as call_status,
  c.handled_by as call_handled_by,
  c.co_handler as call_co_handler,
  c.recording_url,
  c.transcript_url,
  c.disposition,
  c.notes as call_notes,
  c.duration_seconds as call_duration_seconds,
  c.source as call_source,
  c.form_submission_id,
  c.offer_id as call_offer_id,
  (a.intro_call_id is not null and a.demo_credit_claimed_at is not null) as credit_granted,
  case
    when a.appointment_type = 'demo' and a.intro_call_id is null then 'needs_credit'
    when a.status = 'pending'
      and a.scheduled_at is not null
      and a.scheduled_at < now() then 'needs_disposition'
    else null
  end as queue_action
from acquisition_appointments a
left join acquisition_calls c
  on c.appointment_id = a.id
  and c.call_type = case
    when a.appointment_type in ('intro', 'demo', 'followup', 'bamfam', 'organic') then a.appointment_type
    else 'other'
  end;

create index if not exists acquisition_appointments_type_status_booked_idx
  on acquisition_appointments (appointment_type, status, booked_at desc);

create index if not exists acquisition_appointments_demo_credit_intro_idx
  on acquisition_appointments (booked_at desc)
  where appointment_type = 'demo' and intro_call_id is null;

grant select on v_acquisition_appointment_enriched to authenticated;
grant select on v_acquisition_appointment_enriched to service_role;
