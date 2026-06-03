-- Per-user tab permissions (legacy column, superseded by allowed_permissions).
-- allowed_views is a JSON array of dashboard view keys (see src/lib/nav.ts) the
-- user is allowed to see. NULL means "no restriction" (full access).
alter table profiles add column if not exists allowed_views jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- Owner-controlled permission framework
-- ─────────────────────────────────────────────────────────────────────────────

-- Owner role. The owner is always unrestricted and is the only role that
-- bypasses permission checks. Admins can manage other users but are themselves
-- subject to whatever permissions the owner grants them.
alter table profiles add column if not exists is_owner boolean not null default false;

-- Generalized permission set: a JSON array of permission keys (see
-- src/lib/permissions.ts) covering both views and future non-tab features.
-- NULL means "no restriction" (unrestricted). This supersedes allowed_views.
alter table profiles add column if not exists allowed_permissions jsonb;

-- Backfill the generalized column from the legacy allowed_views values once.
update profiles
  set allowed_permissions = allowed_views
  where allowed_permissions is null
    and allowed_views is not null;

-- Promote the earliest admin to owner if no owner exists yet (so existing
-- single-admin deployments get a working owner automatically).
update profiles
  set is_owner = true
  where not exists (select 1 from profiles where is_owner)
    and id = (
      select id from profiles where is_admin order by created_at asc limit 1
    );
