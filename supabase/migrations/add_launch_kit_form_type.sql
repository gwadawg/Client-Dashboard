-- Client Launch Kit: per-client branded PDF generated from Mr. Waiz before the Launch Call.
-- 1) Allow `launch_kit` form submissions (intake + storage path + version live in `responses`).
-- 2) Private storage bucket for the rendered PDFs. Access is via signed URLs only.

alter table client_form_submissions drop constraint if exists client_form_submissions_form_type_check;

alter table client_form_submissions add constraint client_form_submissions_form_type_check check (
  form_type in ('new_client', 'onboarding', 'kickoff', 'launch', 'launch_kit', 'churn')
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-launch-kits', 'client-launch-kits', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
