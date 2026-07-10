-- Manual duplicate-lead exclusions on per-employee payroll submit.

alter table payroll_run_employees
  add column if not exists line_item_exclusions jsonb not null default '[]'::jsonb;
