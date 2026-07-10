-- Per-employee payroll submit within an open monthly run.

alter table payroll_runs
  add column if not exists status text not null default 'closed'
  check (status in ('open', 'closed'));

alter table payroll_run_employees
  add column if not exists submitted_at timestamptz,
  add column if not exists submitted_by uuid references auth.users(id) on delete set null;

update payroll_runs set status = 'closed' where status is null;

-- Backfill submit timestamps for rows created by legacy bulk finalize.
update payroll_run_employees pre
set
  submitted_at = pr.finalized_at,
  submitted_by = pr.finalized_by
from payroll_runs pr
where pre.payroll_run_id = pr.id
  and pre.submitted_at is null;
