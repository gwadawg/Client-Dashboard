-- Soft-delete for acquisition closes: keep audit rows, unlink from live reporting graph.

alter table acquisition_closes
  add column if not exists deleted_at timestamptz;

create index if not exists acquisition_closes_active_idx
  on acquisition_closes (closed_at desc)
  where deleted_at is null and mapping_status <> 'dismissed';

create index if not exists acquisition_closes_excluded_idx
  on acquisition_closes (closed_at desc)
  where deleted_at is null and mapping_status = 'dismissed';
