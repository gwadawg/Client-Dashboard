-- Sales touchpoint calls (intro, demo, dial, follow-up, etc.) + links to appointments/clients.

create table if not exists acquisition_calls (
  id                         uuid primary key default gen_random_uuid(),
  lead_id                    uuid not null references acquisition_leads(id) on delete cascade,
  client_id                  uuid references clients(id) on delete set null,
  appointment_id             uuid references acquisition_appointments(id) on delete set null,
  linked_demo_appointment_id uuid references acquisition_appointments(id) on delete set null,
  dial_id                    uuid references acquisition_dials(id) on delete set null,
  offer_id                   uuid references acquisition_offers(id) on delete set null,
  form_submission_id         uuid references acquisition_form_submissions(id) on delete set null,

  call_type                  text not null,
  called_at                  timestamptz not null,
  status                     text not null default 'pending',

  handled_by                 text,
  co_handler                 text,
  recording_url              text,
  transcript_url             text,
  duration_seconds           int,
  disposition                text,
  notes                      text,

  source                     text not null default 'manual',
  details                    jsonb not null default '{}',
  raw                        jsonb not null default '{}',
  inserted_at                timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),

  constraint acquisition_calls_type_check check (
    call_type in ('intro', 'demo', 'dial', 'followup', 'bamfam', 'organic', 'other')
  ),
  constraint acquisition_calls_status_check check (
    status in (
      'showed', 'no_show', 'cancelled', 'team_no_show', 'pending',
      'connected', 'voicemail', 'no_answer'
    )
  ),
  constraint acquisition_calls_source_check check (
    source in ('form', 'webhook', 'sheet_backfill', 'dial_ingest', 'ghl', 'manual')
  )
);

create index if not exists acquisition_calls_lead_called_idx
  on acquisition_calls (lead_id, called_at desc);

create index if not exists acquisition_calls_client_called_idx
  on acquisition_calls (client_id, called_at desc)
  where client_id is not null;

create index if not exists acquisition_calls_type_called_idx
  on acquisition_calls (call_type, called_at desc);

create index if not exists acquisition_calls_appointment_idx
  on acquisition_calls (appointment_id)
  where appointment_id is not null;

create unique index if not exists acquisition_calls_scheduled_appt_key
  on acquisition_calls (appointment_id)
  where appointment_id is not null
    and call_type in ('intro', 'demo', 'bamfam', 'followup');

-- Demo appointment → intro call that sourced it (added after acquisition_calls exists).
alter table acquisition_appointments
  add column if not exists intro_call_id uuid references acquisition_calls(id) on delete set null;

create index if not exists acquisition_appointments_intro_call_idx
  on acquisition_appointments (intro_call_id)
  where intro_call_id is not null;

-- Pending close mapping (closer closed on demo before new_client form).
alter table acquisition_closes
  add column if not exists mapping_status text not null default 'mapped',
  add column if not exists call_id uuid references acquisition_calls(id) on delete set null,
  add column if not exists reporting_type text,
  add column if not exists service_program text;

alter table acquisition_closes drop constraint if exists acquisition_closes_mapping_status_check;
alter table acquisition_closes add constraint acquisition_closes_mapping_status_check check (
  mapping_status in ('pending_client', 'mapped', 'dismissed')
);

create index if not exists acquisition_closes_pending_idx
  on acquisition_closes (closed_at desc)
  where mapping_status = 'pending_client' and client_id is null;

-- Backfill client_id on acquisition_calls when lead converts or close links.
create or replace function sync_acquisition_calls_client_id_from_lead()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.converted_client_id is not null then
    update acquisition_calls
    set client_id = new.converted_client_id, updated_at = now()
    where lead_id = new.id and client_id is distinct from new.converted_client_id;
  end if;
  return new;
end;
$$;

create or replace function sync_acquisition_calls_client_id_from_close()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null and new.lead_id is not null then
    update acquisition_calls
    set client_id = new.client_id, updated_at = now()
    where lead_id = new.lead_id and client_id is distinct from new.client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists acquisition_leads_sync_calls_client on acquisition_leads;
create trigger acquisition_leads_sync_calls_client
  after update of converted_client_id on acquisition_leads
  for each row
  when (new.converted_client_id is not null)
  execute function sync_acquisition_calls_client_id_from_lead();

drop trigger if exists acquisition_closes_sync_calls_client on acquisition_closes;
create trigger acquisition_closes_sync_calls_client
  after insert or update of client_id, lead_id on acquisition_closes
  for each row
  when (new.client_id is not null and new.lead_id is not null)
  execute function sync_acquisition_calls_client_id_from_close();

alter table acquisition_calls enable row level security;

do $$ begin
  create policy acquisition_calls_read on acquisition_calls
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Extend form types for unified setter reflection + closer demo audit.
alter table acquisition_form_submissions drop constraint if exists acquisition_form_submissions_form_type_check;
alter table acquisition_form_submissions add constraint acquisition_form_submissions_form_type_check check (
  form_type in (
    'demo_booking_credit',
    'intro_disposition',
    'demo_audit',
    'setter_intro_reflection'
  )
);
