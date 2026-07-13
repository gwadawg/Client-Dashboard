-- Fulfillment line (COGS delivery category): media / booking / CS / delivery tech.
-- Orthogonal to subcategory (payroll, software, commissions, …).
-- Safe to re-run.

alter table business_expenses
  add column if not exists fulfillment_line text;

alter table expense_category_rules
  add column if not exists fulfillment_line text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'business_expenses_fulfillment_line_check'
  ) then
    alter table business_expenses
      add constraint business_expenses_fulfillment_line_check check (
        fulfillment_line is null
        or fulfillment_line in (
          'media_buying',
          'call_center',
          'client_success',
          'delivery_tech'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expense_rules_fulfillment_line_check'
  ) then
    alter table expense_category_rules
      add constraint expense_rules_fulfillment_line_check check (
        fulfillment_line is null
        or fulfillment_line in (
          'media_buying',
          'call_center',
          'client_success',
          'delivery_tech'
        )
      );
  end if;
end $$;

create index if not exists business_expenses_fulfillment_line
  on business_expenses (fulfillment_line)
  where fulfillment_line is not null;
