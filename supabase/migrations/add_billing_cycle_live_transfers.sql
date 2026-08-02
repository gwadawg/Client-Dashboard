-- Live transfers count toward performance conversations (same $/show rate).
alter table client_billing_cycles
  add column if not exists live_transfer_count int not null default 0;
