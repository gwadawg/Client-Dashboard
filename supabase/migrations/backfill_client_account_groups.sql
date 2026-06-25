-- Backfill: one client_account_groups row per client (singleton groups).
-- Run after add_client_account_groups.sql. Safe to re-run (skips clients already linked).
--
-- For multi-offer LOs, run scripts/backfill-client-account-groups.ts to merge
-- siblings by primary_contact_name + email, then review collision output.

insert into client_account_groups (display_name, primary_email)
select
  coalesce(nullif(trim(c.primary_contact_name), ''), nullif(trim(c.primary_contact), ''), c.name) as display_name,
  nullif(lower(trim(c.email)), '') as primary_email
from clients c
where c.account_group_id is null;

update clients c
set account_group_id = g.id
from client_account_groups g
where c.account_group_id is null
  and coalesce(nullif(trim(c.primary_contact_name), ''), nullif(trim(c.primary_contact), ''), c.name) = g.display_name
  and (
    (c.email is null and g.primary_email is null)
    or nullif(lower(trim(c.email)), '') = g.primary_email
  );

-- Remaining unlinked clients (name collisions) — assign 1:1 groups by client id
insert into client_account_groups (display_name, primary_email)
select
  coalesce(nullif(trim(c.primary_contact_name), ''), nullif(trim(c.primary_contact), ''), c.name) || ' (' || left(c.id::text, 8) || ')',
  nullif(lower(trim(c.email)), '')
from clients c
where c.account_group_id is null;

update clients c
set account_group_id = g.id
from client_account_groups g
where c.account_group_id is null
  and g.display_name = coalesce(nullif(trim(c.primary_contact_name), ''), nullif(trim(c.primary_contact), ''), c.name) || ' (' || left(c.id::text, 8) || ')';
