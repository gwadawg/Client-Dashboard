-- Alternate Facebook ad names that map to the same ad_library creative.
create table if not exists ad_library_aliases (
  id          uuid primary key default gen_random_uuid(),
  library_id  uuid not null references ad_library(id) on delete cascade,
  alias_name  text not null,
  created_at  timestamptz not null default now(),
  unique (alias_name)
);

create index if not exists ad_library_aliases_library_id_idx on ad_library_aliases(library_id);
