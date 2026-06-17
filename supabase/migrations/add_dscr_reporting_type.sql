-- Allow DSCR as a client reporting / offer type.

alter table clients drop constraint if exists clients_reporting_type_check;

alter table clients add constraint clients_reporting_type_check check (
  reporting_type in ('RM', 'HE', 'DSCR')
);
