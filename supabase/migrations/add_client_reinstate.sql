-- Client reinstate / welcome-back (2026-09-17)

-- 1) Form types
alter table client_form_submissions
  drop constraint if exists client_form_submissions_form_type_check;

alter table client_form_submissions
  add constraint client_form_submissions_form_type_check check (
    form_type in (
      'new_client', 'onboarding', 'kickoff', 'launch', 'launch_kit', 'churn',
      'reinstate', 'reinstate_onboarding'
    )
  );

-- 2) Allow multiple closes per client (winbacks)
drop index if exists acquisition_closes_client_id_key;

-- Keep non-unique lookup index (already exists as acquisition_closes_client_id_idx)

-- 3) Winback marker
alter table acquisition_closes
  add column if not exists close_kind text not null default 'standard';

alter table acquisition_closes
  drop constraint if exists acquisition_closes_close_kind_check;

alter table acquisition_closes
  add constraint acquisition_closes_close_kind_check check (
    close_kind in ('standard', 'reinstate')
  );

create index if not exists acquisition_closes_close_kind_idx
  on acquisition_closes (close_kind);

-- 4) Tenure-safe reinstate stamp + dedicated OB token (not report share_token)
alter table clients
  add column if not exists reinstated_at timestamptz;

alter table clients
  add column if not exists welcome_back_token text;

alter table clients
  add column if not exists welcome_back_token_created_at timestamptz;

create unique index if not exists clients_welcome_back_token_key
  on clients (welcome_back_token)
  where welcome_back_token is not null;
