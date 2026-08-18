-- Grain is a loan transaction (file), not a property. Two loans on the same
-- house are two rows. Safe to run if add_loan_deals already used property_label.

do $$ begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'loan_deals'
      and column_name = 'property_label'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'loan_deals'
      and column_name = 'transaction_label'
  ) then
    alter table loan_deals rename column property_label to transaction_label;
  end if;
end $$;

drop index if exists loan_deals_identity_day_uidx;

create unique index if not exists loan_deals_identity_day_uidx
  on loan_deals (
    client_id,
    ghl_contact_id,
    loan_size,
    coalesce(lower(btrim(transaction_label)), ''),
    (timezone('UTC', coalesce(funded_at, submitted_at)))::date
  )
  where ghl_contact_id is not null and loan_size is not null;
