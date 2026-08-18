-- Topic tags for ad library creatives ("what is this ad talking about").
-- Catalog is user-extensible; junction lets one ad carry many tags.

create table if not exists ad_tags (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ad_tags_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists ad_tags_label_lower_key
  on ad_tags (lower(label));

insert into ad_tags (slug, label, sort_order) values
  ('rates', 'Rates', 10),
  ('cash-out', 'Cash-out', 20),
  ('hecm', 'HECM', 30),
  ('credit', 'Credit', 40),
  ('education', 'Education', 50),
  ('testimonial', 'Testimonial', 60),
  ('objection', 'Objection', 70)
on conflict (slug) do nothing;

create table if not exists ad_library_tags (
  library_id uuid not null references ad_library(id) on delete cascade,
  tag_slug   text not null references ad_tags(slug) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (library_id, tag_slug)
);

create index if not exists ad_library_tags_tag_slug_idx on ad_library_tags(tag_slug);

alter table ad_tags enable row level security;
alter table ad_library_tags enable row level security;

do $$ begin
  create policy ad_tags_read on ad_tags
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy ad_library_tags_read on ad_library_tags
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

