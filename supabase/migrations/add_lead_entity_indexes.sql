-- Run after add_lead_entity.sql, one statement at a time (CONCURRENTLY cannot
-- run inside a transaction). Builds without blocking webhook writes.
create index concurrently if not exists events_lead_id_occurred_idx
  on events (lead_id, occurred_at desc);

create index concurrently if not exists loan_deals_lead_id_idx
  on loan_deals (lead_id);
