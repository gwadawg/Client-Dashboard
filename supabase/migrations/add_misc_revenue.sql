-- Non-client revenue (e.g. Skool / Bootcamp / community) that isn't tied to a
-- client in the roster. Keeps the client_billings ledger purely client-scoped
-- while still capturing every dollar collected for CEO-level reporting.
create table if not exists misc_revenue (
  id             uuid primary key default gen_random_uuid(),
  source         text not null,                 -- 'skool' | 'bootcamp' | ...
  occurred_on    date not null,
  amount         numeric not null,
  processing_fee numeric default 0,
  currency       text default 'usd',
  description    text,
  external_ref   text,                           -- payment processor charge id
  note           text,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz default now()
);

create index if not exists misc_revenue_source_date on misc_revenue(source, occurred_on desc);
