-- Virtual Business Card: per-client published card on loanofficer.me/{slug}
-- Payload lives in client_form_submissions (form_type = virtual_card).
-- Live URL + slug are written to clients for roster display and public lookup.

alter table client_form_submissions drop constraint if exists client_form_submissions_form_type_check;

alter table client_form_submissions add constraint client_form_submissions_form_type_check check (
  form_type in (
    'new_client', 'onboarding', 'kickoff', 'launch', 'launch_kit', 'virtual_card',
    'churn', 'reinstate', 'reinstate_onboarding'
  )
);

alter table clients add column if not exists virtual_card_slug text;
alter table clients add column if not exists virtual_business_card_url text;

create unique index if not exists clients_virtual_card_slug_uidx
  on clients (virtual_card_slug)
  where virtual_card_slug is not null;
