-- Client vertical (what we market) + service program (how we deliver for RM/DSCR).

alter table clients add column if not exists service_program text;

alter table clients drop constraint if exists clients_service_program_check;
alter table clients add constraint clients_service_program_check check (
  service_program is null or service_program in ('core', 'lead_gen')
);

-- Widen constraints before migrating legacy HE rows.
alter table clients drop constraint if exists clients_reporting_type_check;
alter table clients add constraint clients_reporting_type_check check (
  reporting_type in ('RM', 'DSCR', 'CALL_CENTER', 'HE')
);

alter table clients drop constraint if exists clients_offer_check;
alter table clients add constraint clients_offer_check check (
  offer is null or offer in ('RM', 'DSCR', 'CALL_CENTER', 'HE')
);

-- Legacy HE = Call Center (dialing LO leads).
update clients set reporting_type = 'CALL_CENTER' where reporting_type = 'HE';
update clients set offer = 'CALL_CENTER' where offer = 'HE';

-- Mirror vertical into offer when blank or stale.
update clients
set offer = reporting_type
where offer is null
   or (offer in ('RM', 'DSCR', 'CALL_CENTER', 'HE') and offer is distinct from reporting_type);
