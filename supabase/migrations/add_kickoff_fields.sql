-- Kick-off call fields collected during CS onboarding calls.
-- Maps to legacy kick-off form: position/role, appointment settings, Facebook page.

alter table clients add column if not exists contact_role text;
alter table clients add column if not exists appointment_settings text;
alter table clients add column if not exists facebook_page_name text;

comment on column clients.contact_role is 'Position/role on kick-off call (e.g. Loan Officer, Branch Manager)';
comment on column clients.appointment_settings is 'Appointment length, details & buffer time from kick-off';
comment on column clients.facebook_page_name is 'Facebook page name for ad campaigns';
