-- Acquisition team forms (setter intro, demo booking credit, closer audit).
-- Separate from client_form_submissions (client lifecycle).

create table if not exists acquisition_form_submissions (
  id                  uuid primary key default gen_random_uuid(),
  form_type           text not null,
  lead_id             uuid references acquisition_leads(id) on delete set null,
  appointment_id      uuid references acquisition_appointments(id) on delete set null,
  ghl_contact_id      text not null,
  ghl_appointment_id  text,
  submitted_by        text,
  responses           jsonb not null default '{}',
  ghl_sync_status     text not null default 'pending',
  ghl_sync_error      text,
  ghl_synced_at       timestamptz,
  submitted_at        timestamptz not null default now(),
  constraint acquisition_form_submissions_form_type_check check (
    form_type in ('demo_booking_credit', 'intro_disposition', 'demo_audit')
  ),
  constraint acquisition_form_submissions_ghl_sync_status_check check (
    ghl_sync_status in ('pending', 'synced', 'failed', 'skipped')
  )
);

create index if not exists acquisition_form_submissions_contact_idx
  on acquisition_form_submissions (ghl_contact_id, form_type, submitted_at desc);

create index if not exists acquisition_form_submissions_lead_idx
  on acquisition_form_submissions (lead_id);

create index if not exists acquisition_form_submissions_sync_idx
  on acquisition_form_submissions (ghl_sync_status)
  where ghl_sync_status in ('pending', 'failed');

create unique index if not exists acquisition_form_submissions_demo_credit_key
  on acquisition_form_submissions (ghl_contact_id, ghl_appointment_id, form_type)
  where form_type = 'demo_booking_credit' and ghl_appointment_id is not null;

alter table acquisition_form_submissions enable row level security;

do $$ begin
  create policy acquisition_form_submissions_read on acquisition_form_submissions
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
