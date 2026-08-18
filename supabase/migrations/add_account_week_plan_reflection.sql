-- Thursday KPI reflection lives on the week plan, not as a work type.

alter table account_week_plans
  add column if not exists reflection text;
