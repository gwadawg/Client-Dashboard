-- Ad creative library for the Media Buyer view.
-- Manually curated: each row is one Facebook ad keyed by ad_name (the same join
-- key used by meta_ad_insights and events). Stores a Google Drive link to the
-- creative plus a summary and visual notes — the structured input a future
-- "AI recreate this winning ad" feature will consume.
create table if not exists ad_library (
  id            uuid    primary key default gen_random_uuid(),
  ad_name       text    not null unique,
  platform      text    not null default 'facebook',
  status        text    not null default 'active',
  summary       text,
  visual_notes  text,
  drive_url     text,
  thumbnail_url text,
  created_by    uuid    references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint ad_library_status_check check (
    status in ('active', 'winner', 'paused', 'archived')
  )
);

create index if not exists ad_library_status_idx on ad_library(status);
