-- Agent payroll: persistent pay rates on the roster
alter table agents
  add column if not exists base_salary numeric(10,2) not null default 0,
  add column if not exists pay_per_booking numeric(10,2) not null default 0,
  add column if not exists pay_per_show numeric(10,2) not null default 0,
  add column if not exists pay_per_live_transfer numeric(10,2) not null default 0;
