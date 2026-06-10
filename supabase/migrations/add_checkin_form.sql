-- Structured check-in call form data (client_calls.checkin_form).

alter table client_calls add column if not exists checkin_form jsonb;

create index if not exists client_calls_checkin_form on client_calls(client_id, called_at desc)
  where call_type = 'checkin' and checkin_form is not null;
