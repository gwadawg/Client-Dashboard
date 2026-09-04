-- CSM Cursor API: user-scoped Bearer token (hashed). Plaintext never stored.
-- Issue via: npx tsx scripts/issue-csm-api-token.ts --email user@…

alter table profiles
  add column if not exists csm_api_token_hash text;

create unique index if not exists profiles_csm_api_token_hash_uidx
  on profiles (csm_api_token_hash)
  where csm_api_token_hash is not null;

comment on column profiles.csm_api_token_hash is
  'SHA-256 hex of CSM brief API Bearer token for Cursor; null = no token issued';
