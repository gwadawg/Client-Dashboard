-- Client log: mark submitted files that fell out of processing (still count as submissions).

alter table loan_deals add column if not exists fell_out_at timestamptz;

create index if not exists loan_deals_client_fell_out_idx
  on loan_deals (client_id, fell_out_at desc)
  where fell_out_at is not null;
