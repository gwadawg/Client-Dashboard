-- Acquisition Marketing: full Meta ad insights + creative library (isolated from client Media Buyer).

-- ── Full Meta ad-level insights (Waiz B2B account) ───────────────────────────
create table if not exists acquisition_meta_ad_insights (
  id                   uuid primary key default gen_random_uuid(),
  insight_date         date not null,
  account_id           text not null,
  campaign_id          text not null,
  campaign_name        text,
  adset_id             text not null,
  adset_name           text,
  ad_id                text not null,
  ad_name              text,
  spend                numeric not null default 0,
  impressions          bigint not null default 0,
  clicks               bigint not null default 0,
  ctr                  numeric,
  cpc                  numeric,
  cpm                  numeric,
  actions              jsonb,
  cost_per_action_type jsonb,
  raw                  jsonb,
  created_at           timestamptz default now(),
  updated_at           timestamptz default now(),
  unique (insight_date, account_id, campaign_id, adset_id, ad_id)
);

create index if not exists acquisition_meta_ad_insights_date_idx
  on acquisition_meta_ad_insights (insight_date desc);

create index if not exists acquisition_meta_ad_insights_ad_name_idx
  on acquisition_meta_ad_insights (ad_name)
  where ad_name is not null;

create or replace view acquisition_daily_meta_spend as
select
  insight_date as spend_date,
  sum(spend) as amount
from acquisition_meta_ad_insights
group by insight_date;

grant select on acquisition_daily_meta_spend to service_role;
grant select on acquisition_daily_meta_spend to authenticated;

-- Backfill from legacy sheet-style rows.
insert into acquisition_meta_ad_insights (
  insight_date,
  account_id,
  campaign_id,
  campaign_name,
  adset_id,
  adset_name,
  ad_id,
  ad_name,
  spend,
  impressions,
  clicks,
  cpm,
  raw,
  created_at,
  updated_at
)
select
  a.insight_date,
  'import' as account_id,
  md5(coalesce(a.adset_name, '') || ':' || coalesce(a.ad_name, '')) as campaign_id,
  null as campaign_name,
  md5('adset:' || coalesce(a.adset_name, '') || ':' || coalesce(a.ad_name, '')) as adset_id,
  a.adset_name,
  md5('ad:' || coalesce(a.adset_name, '') || ':' || coalesce(a.ad_name, '')) as ad_id,
  a.ad_name,
  coalesce(a.amount_spent, 0) as spend,
  coalesce(a.impressions, 0) as impressions,
  coalesce(a.unique_outbound_clicks, 0) as clicks,
  a.cpm,
  coalesce(a.raw, '{}'::jsonb),
  a.inserted_at,
  a.inserted_at
from acquisition_ad_insights a
on conflict (insight_date, account_id, campaign_id, adset_id, ad_id) do nothing;

-- ── Angle catalog (user-managed) ───────────────────────────────────────────────
create table if not exists acquisition_ad_angles (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create unique index if not exists acquisition_ad_angles_label_lower_key
  on acquisition_ad_angles (lower(label));

-- ── Creative library ─────────────────────────────────────────────────────────
create table if not exists acquisition_ad_library (
  id                  uuid primary key default gen_random_uuid(),
  ad_name             text not null unique,
  drive_url           text,
  ad_format           text,
  angle_id            uuid references acquisition_ad_angles(id) on delete set null,
  creative_created_at date,
  created_by          uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint acquisition_ad_library_format_check check (
    ad_format is null or ad_format in ('static', 'ugc')
  )
);

create index if not exists acquisition_ad_library_angle_idx
  on acquisition_ad_library (angle_id);

create index if not exists acquisition_ad_library_format_idx
  on acquisition_ad_library (ad_format);

create table if not exists acquisition_ad_library_aliases (
  id          uuid primary key default gen_random_uuid(),
  library_id  uuid not null references acquisition_ad_library(id) on delete cascade,
  alias_name  text not null,
  created_at  timestamptz not null default now(),
  unique (alias_name)
);

create index if not exists acquisition_ad_library_aliases_library_id_idx
  on acquisition_ad_library_aliases (library_id);

-- ── RLS ────────────────────────────────────────────────────────────────────────
alter table acquisition_meta_ad_insights enable row level security;
alter table acquisition_ad_angles enable row level security;
alter table acquisition_ad_library enable row level security;
alter table acquisition_ad_library_aliases enable row level security;

do $$ begin
  create policy acquisition_meta_insights_read on acquisition_meta_ad_insights
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy acquisition_ad_angles_read on acquisition_ad_angles
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy acquisition_ad_library_read on acquisition_ad_library
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy acquisition_ad_library_aliases_read on acquisition_ad_library_aliases
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;
