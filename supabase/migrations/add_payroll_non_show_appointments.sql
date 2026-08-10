-- Snapshot non-show appointments per call-rep payroll employee (appointment date, not booking date).
alter table payroll_run_employees
  add column if not exists non_show_appointments jsonb;
