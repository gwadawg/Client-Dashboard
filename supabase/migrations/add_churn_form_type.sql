-- Allow churn offboarding form submissions.

alter table client_form_submissions drop constraint if exists client_form_submissions_form_type_check;

alter table client_form_submissions add constraint client_form_submissions_form_type_check check (
  form_type in ('new_client', 'onboarding', 'kickoff', 'launch', 'churn')
);
