-- Shared ad-format catalog for client + acquisition libraries.
-- Replaces hardcoded CHECK lists so new formats can be added from the UI
-- and reused by performance, intelligence, and future knowledge tools.

create table if not exists ad_formats (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  label       text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint ad_formats_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create unique index if not exists ad_formats_label_lower_key
  on ad_formats (lower(label));

insert into ad_formats (slug, label, sort_order) values
  ('static', 'Static', 10),
  ('ugc', 'UGC', 20),
  ('testimonial', 'Testimonial', 30),
  ('ext', 'Ext', 40)
on conflict (slug) do nothing;

-- Absorb any existing library values that aren't in the seed.
insert into ad_formats (slug, label, sort_order)
select distinct
  lower(regexp_replace(trim(both '-' from regexp_replace(lower(trim(ad_format)), '[^a-z0-9]+', '-', 'g')), '-+', '-', 'g')),
  initcap(replace(trim(ad_format), '_', ' ')),
  100
from ad_library
where ad_format is not null
  and trim(ad_format) <> ''
on conflict (slug) do nothing;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'acquisition_ad_library'
  ) then
    insert into ad_formats (slug, label, sort_order)
    select distinct
      lower(regexp_replace(trim(both '-' from regexp_replace(lower(trim(ad_format)), '[^a-z0-9]+', '-', 'g')), '-+', '-', 'g')),
      initcap(replace(trim(ad_format), '_', ' ')),
      100
    from acquisition_ad_library
    where ad_format is not null
      and trim(ad_format) <> ''
    on conflict (slug) do nothing;
  end if;
end $$;

alter table ad_library drop constraint if exists ad_library_ad_format_check;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ad_library_ad_format_fk'
  ) then
    alter table ad_library
      add constraint ad_library_ad_format_fk
      foreign key (ad_format) references ad_formats(slug)
      on update cascade
      on delete set null;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'acquisition_ad_library'
  ) then
    alter table acquisition_ad_library drop constraint if exists acquisition_ad_library_format_check;
    if not exists (
      select 1 from pg_constraint where conname = 'acquisition_ad_library_ad_format_fk'
    ) then
      alter table acquisition_ad_library
        add constraint acquisition_ad_library_ad_format_fk
        foreign key (ad_format) references ad_formats(slug)
        on update cascade
        on delete set null;
    end if;
  end if;
end $$;

alter table ad_formats enable row level security;

do $$ begin
  create policy ad_formats_read on ad_formats
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
