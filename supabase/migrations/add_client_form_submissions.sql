-- Client onboarding form submissions (audit trail + unmapped queue).
-- Operational fields live on clients; checklist / one-time answers live in responses JSONB.

alter table clients add column if not exists headshot_url text;

create table if not exists client_form_submissions (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid references clients(id) on delete set null,
  form_type     text not null,
  status        text not null default 'submitted',
  submitted_by  text,
  match_email   text,
  match_phone   text,
  responses     jsonb not null default '{}',
  applied_patch jsonb,
  submitted_at  timestamptz not null default now(),
  constraint client_form_submissions_form_type_check check (
    form_type in ('new_client', 'onboarding', 'kickoff', 'launch', 'churn')
  ),
  constraint client_form_submissions_status_check check (
    status in ('draft', 'submitted', 'unmapped', 'applied', 'dismissed')
  )
);

create index if not exists client_form_submissions_client_id_idx
  on client_form_submissions(client_id);

create index if not exists client_form_submissions_form_type_idx
  on client_form_submissions(form_type);

create index if not exists client_form_submissions_status_idx
  on client_form_submissions(status)
  where status = 'unmapped';

create index if not exists client_form_submissions_match_email_idx
  on client_form_submissions(lower(match_email))
  where match_email is not null;
