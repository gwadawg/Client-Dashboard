-- Closer Form (renamed from demo_audit). Keep demo_audit for historical rows.

alter table acquisition_form_submissions
  drop constraint if exists acquisition_form_submissions_form_type_check;

alter table acquisition_form_submissions
  add constraint acquisition_form_submissions_form_type_check
  check (
    form_type in (
      'demo_booking_credit',
      'intro_disposition',
      'setter_intro_reflection',
      'demo_audit',
      'closer_form'
    )
  );
