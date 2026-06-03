-- Revenue metadata for the billing ledger.
-- Lets historical revenue rows carry their reporting context so collected cash,
-- recurring vs. new business, and ad-spend pass-throughs stay queryable for KPIs.

alter table client_billings add column if not exists revenue_type       text;     -- mrr | pif | performance | passthrough
alter table client_billings add column if not exists revenue_segment    text;     -- front_end (new cash) | back_end (recurring)
alter table client_billings add column if not exists lead_source        text;     -- Meta | Referral | Cold Call | Linkedin | ...
alter table client_billings add column if not exists term_months        int;      -- months covered (PIF lump sums)
alter table client_billings add column if not exists processing_fee      numeric default 0;  -- payment processor fee
alter table client_billings add column if not exists passthrough_amount  numeric default 0;  -- ad-spend reimbursement (excluded from revenue)

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'client_billings_revenue_type_check') then
    alter table client_billings add constraint client_billings_revenue_type_check
      check (revenue_type is null or revenue_type in ('mrr', 'pif', 'performance', 'passthrough'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'client_billings_revenue_segment_check') then
    alter table client_billings add constraint client_billings_revenue_segment_check
      check (revenue_segment is null or revenue_segment in ('front_end', 'back_end'));
  end if;
end $$;

create index if not exists client_billings_revenue_type    on client_billings(revenue_type)    where revenue_type is not null;
create index if not exists client_billings_revenue_segment on client_billings(revenue_segment) where revenue_segment is not null;
