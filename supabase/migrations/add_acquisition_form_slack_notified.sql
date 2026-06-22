-- Track Slack alerts for acquisition form magic links.

alter table acquisition_appointments
  add column if not exists intro_reflection_slack_notified_at timestamptz;

alter table acquisition_appointments
  add column if not exists closer_form_slack_notified_at timestamptz;

create index if not exists acquisition_appointments_intro_reflection_pending_idx
  on acquisition_appointments (scheduled_at desc)
  where appointment_type = 'intro'
    and status = 'showed'
    and intro_reflection_slack_notified_at is null;

create index if not exists acquisition_appointments_closer_form_pending_idx
  on acquisition_appointments (scheduled_at desc)
  where appointment_type = 'demo'
    and status = 'showed'
    and closer_form_slack_notified_at is null;
