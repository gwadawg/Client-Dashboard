-- Add Operations as a library document department.
alter table library_documents drop constraint if exists library_documents_department_check;

alter table library_documents add constraint library_documents_department_check check (
  department is null or department in ('sales', 'call-center', 'media-buying', 'client-success', 'operations')
);
