-- Allow client-facing playbook links in the resource library.
alter table resources drop constraint if exists resources_category_check;

alter table resources add constraint resources_category_check check (
  category in ('form', 'sop', 'document', 'template', 'client_playbook', 'other')
);
