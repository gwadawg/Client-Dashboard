-- Whether Waiz dials this client's appointments and live-transfers them.
alter table clients add column if not exists appointment_watch boolean;

comment on column clients.appointment_watch is
  'Yes = dial their appointments and live-transfer; No = do not run appointment watch.';
