-- Free-month retention comps: mark a billing cycle as an extension ($0 paid).
alter table client_billings
  add column if not exists is_extension boolean not null default false;

comment on column client_billings.is_extension is
  'True when this cycle was a free-month extension (retention comp). Amounts should be $0; advances next billing date.';
