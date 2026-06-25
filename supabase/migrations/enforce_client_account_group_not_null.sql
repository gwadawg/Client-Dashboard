-- Enforce account_group_id after backfill completes.
-- Run only after backfill_client_account_groups.sql (or scripts/backfill-client-account-groups.ts).

do $$
begin
  if exists (select 1 from clients where account_group_id is null) then
    raise exception 'Cannot enforce NOT NULL: % clients still lack account_group_id. Run backfill first.',
      (select count(*) from clients where account_group_id is null);
  end if;
end $$;

alter table clients alter column account_group_id set not null;
