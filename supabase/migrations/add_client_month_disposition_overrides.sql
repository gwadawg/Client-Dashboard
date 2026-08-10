-- Sparse manual overrides for CS payment-streak timeline cells.
-- Most months are derived from client_billings; only exceptions persist here.

create table if not exists client_month_disposition_overrides (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references clients(id) on delete cascade,
  year_month   text not null,
  disposition  text not null,
  note         text,
  created_by   uuid references auth.users(id) on delete set null,
  updated_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint client_month_disposition_overrides_ym_check
    check (year_month ~ '^\d{4}-\d{2}$'),
  constraint client_month_disposition_overrides_disp_check
    check (disposition in ('paid', 'short', 'extension', 'unpaid', 'paused', 'churned')),
  constraint client_month_disposition_overrides_client_ym_unique
    unique (client_id, year_month)
);

create index if not exists client_month_disposition_overrides_client_idx
  on client_month_disposition_overrides (client_id, year_month);
