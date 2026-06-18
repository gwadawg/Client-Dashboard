-- Expose canonical lead source on appointment enriched view (from acquisition_leads.source).

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
  end as queue_action,
  l.ghl_contact_id,
  l.source as lead_source
from acquisition_appointments a
left join acquisition_leads l on l.id = a.lead_id
left join acquisition_calls c
  on c.appointment_id = a.id
  and c.call_type = case
    when a.appointment_type in ('intro', 'demo', 'followup', 'bamfam', 'organic') then a.appointment_type
    else 'other'
  end;

grant select on v_acquisition_appointment_enriched to authenticated;
grant select on v_acquisition_appointment_enriched to service_role;

-- Normalize legacy source strings where unambiguous.
update acquisition_leads
set source = case
  when source is null or btrim(source) = '' then null
  when lower(source) in ('meta', 'facebook', 'fb', 'ig', 'instagram') then 'Meta'
  when lower(source) like '%meta%' or lower(source) like '%facebook%' then 'Meta'
  when lower(source) like '%refer%' then 'Referral'
  when lower(source) like '%cold%' then 'Cold'
  when lower(source) in ('organic', 'funnel', 'website') or lower(source) like '%organic%' then 'organic'
  when source in ('organic', 'Meta', 'Referral', 'Cold') then source
  else null
end,
updated_at = now()
where source is not null
  and source not in ('organic', 'Meta', 'Referral', 'Cold');

alter table acquisition_leads drop constraint if exists acquisition_leads_source_check;
alter table acquisition_leads add constraint acquisition_leads_source_check check (
  source is null or source in ('organic', 'Meta', 'Referral', 'Cold')
);
