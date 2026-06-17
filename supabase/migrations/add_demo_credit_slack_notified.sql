-- Track Slack alert when a demo booking needs setter credit form.

alter table acquisition_appointments
  add column if not exists demo_credit_slack_notified_at timestamptz;

alter table acquisition_appointments
  add column if not exists demo_credit_claimed_at timestamptz;

create index if not exists acquisition_appointments_demo_credit_pending_idx
  on acquisition_appointments (booked_at desc)
  where appointment_type = 'demo' and demo_credit_claimed_at is null;
