-- Company Resource Library (forms, SOPs, document links, templates).
-- Company-wide (not per-client). All authenticated viewing is gated in app code
-- via the 'resources' tab permission; mutations are admin/owner only.
create table if not exists resources (
  id          uuid    primary key default gen_random_uuid(),
  title       text    not null,
  description text,
  category    text    not null default 'document',
  tags        text[]  not null default '{}',
  url         text    not null,
  created_by  uuid    references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint resources_category_check check (
    category in ('form', 'sop', 'document', 'template', 'other')
  )
);

create index if not exists resources_category_idx on resources(category);
create index if not exists resources_tags_idx on resources using gin(tags);
create index if not exists resources_updated_at_idx on resources(updated_at desc);
