-- Unified pre-close + post-close call timeline per lead/client.

create or replace view v_lead_journey as
  select
    c.lead_id,
    c.client_id,
    c.id,
    'acquisition'::text as domain,
    c.call_type as subtype,
    c.called_at as occurred_at,
    c.handled_by,
    c.recording_url,
    c.transcript_url,
    c.disposition,
    c.notes,
    c.details,
    c.status,
    c.appointment_id,
    c.linked_demo_appointment_id
  from acquisition_calls c

  union all

  select
    al.id as lead_id,
    cc.client_id,
    cc.id,
    'client'::text as domain,
    cc.call_type as subtype,
    cc.called_at as occurred_at,
    cc.attendees as handled_by,
    cc.recording_url,
    null::text as transcript_url,
    cc.disposition,
    cc.notes,
    cc.checkin_form as details,
    null::text as status,
    null::uuid as appointment_id,
    null::uuid as linked_demo_appointment_id
  from client_calls cc
  join acquisition_leads al on al.converted_client_id = cc.client_id
  where cc.deleted_at is null;

grant select on v_lead_journey to service_role;
grant select on v_lead_journey to authenticated;
