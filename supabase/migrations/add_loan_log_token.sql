-- Unique public token per client for the loan-log form (/forms/loans/<token>).
alter table clients add column if not exists loan_log_token text;

create unique index if not exists clients_loan_log_token_uidx
  on clients (loan_log_token)
  where loan_log_token is not null;
