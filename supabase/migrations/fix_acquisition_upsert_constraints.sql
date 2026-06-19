-- Supabase .upsert(onConflict) needs a full UNIQUE constraint, not a partial unique index.
-- Ingest uses explicit update/insert, but constraints still protect duplicate GHL ids.

drop index if exists acquisition_appointments_ghl_appt_id_key;
alter table acquisition_appointments
  drop constraint if exists acquisition_appointments_ghl_appointment_id_key;
alter table acquisition_appointments
  add constraint acquisition_appointments_ghl_appointment_id_key unique (ghl_appointment_id);

drop index if exists acquisition_leads_ghl_contact_id_key;
alter table acquisition_leads
  drop constraint if exists acquisition_leads_ghl_contact_id_key;
alter table acquisition_leads
  add constraint acquisition_leads_ghl_contact_id_key unique (ghl_contact_id);
