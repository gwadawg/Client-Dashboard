-- Rebuild ad_tags as product × category catalogs (2026-09-18)
-- WIPEs all tag links and legacy catalog rows. Does NOT touch ad_library
-- creative fields (summary, visual_notes, drive_url, etc.).

-- 1) Drop old junction (slug FK)
drop table if exists ad_library_tags cascade;

-- 2) Wipe + reshape catalog
truncate table ad_tags cascade;

alter table ad_tags add column if not exists product text;
alter table ad_tags add column if not exists category text;

-- Drop global uniqueness that blocks cross-product / cross-category reuse
alter table ad_tags drop constraint if exists ad_tags_slug_key;
drop index if exists ad_tags_slug_key;
drop index if exists ad_tags_label_lower_key;

alter table ad_tags alter column product set not null;
alter table ad_tags alter column category set not null;

alter table ad_tags drop constraint if exists ad_tags_product_check;
alter table ad_tags add constraint ad_tags_product_check check (
  product in ('dscr', 'reverse', 'broad_forward')
);

alter table ad_tags drop constraint if exists ad_tags_category_format;
alter table ad_tags add constraint ad_tags_category_format check (
  category ~ '^[a-z0-9]+(?:_[a-z0-9]+)*$'
);

create unique index if not exists ad_tags_product_category_slug_key
  on ad_tags (product, category, slug);

create unique index if not exists ad_tags_product_category_label_lower_key
  on ad_tags (product, category, lower(label));

create index if not exists ad_tags_product_idx on ad_tags (product);
create index if not exists ad_tags_product_category_idx on ad_tags (product, category);

-- 3) New junction on tag id
create table ad_library_tags (
  library_id uuid not null references ad_library(id) on delete cascade,
  tag_id     uuid not null references ad_tags(id) on update cascade on delete cascade,
  created_at timestamptz not null default now(),
  primary key (library_id, tag_id)
);

create index if not exists ad_library_tags_tag_id_idx on ad_library_tags(tag_id);

alter table ad_library_tags enable row level security;

do $$ begin
  create policy ad_library_tags_read on ad_library_tags
    for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- 4) Seed (72 rows from src/lib/ad-tag-categories.ts)
insert into ad_tags (slug, label, product, category, sort_order) values
  ('denied', 'Denied', 'dscr', 'bucket', 10),
  ('deadline', 'Deadline', 'dscr', 'bucket', 20),
  ('idle', 'Idle', 'dscr', 'bucket', 30),
  ('in-market', 'In-market', 'dscr', 'bucket', 40),
  ('reveal', 'Reveal', 'dscr', 'creative_job', 100),
  ('exit', 'Exit', 'dscr', 'creative_job', 110),
  ('belief', 'Belief', 'dscr', 'creative_job', 120),
  ('outcome', 'Outcome', 'dscr', 'creative_job', 130),
  ('terms', 'Terms', 'dscr', 'creative_job', 140),
  ('authority', 'Authority', 'dscr', 'creative_job', 150),
  ('nodocs-speed', 'Nodocs speed', 'dscr', 'concept', 200),
  ('balloon-exit', 'Balloon exit', 'dscr', 'concept', 210),
  ('cashout-grow', 'Cashout grow', 'dscr', 'concept', 220),
  ('ratecard-centered', 'Ratecard centered', 'dscr', 'concept', 230),
  ('navy-suburban-headline', 'Navy suburban headline', 'dscr', 'concept', 240),
  ('qualify-stack', 'Qualify stack', 'dscr', 'concept', 250),
  ('lo-authority', 'LO authority', 'dscr', 'concept', 260),
  ('angle-1-idle-equity', 'Angle 1 — Idle equity', 'dscr', 'angle', 300),
  ('angle-2-deadline', 'Angle 2 — Deadline', 'dscr', 'angle', 310),
  ('angle-3-did-you-know', 'Angle 3 — Did you know', 'dscr', 'angle', 320),
  ('angle-4-checklist', 'Angle 4 — Checklist', 'dscr', 'angle', 330),
  ('angle-5-what-you-could-do', 'Angle 5 — What you could do', 'dscr', 'angle', 340),
  ('angle-new', 'Angle — New', 'dscr', 'angle', 350),
  ('cash-out', 'Cash-out', 'dscr', 'topic', 400),
  ('balloon', 'Balloon', 'dscr', 'topic', 410),
  ('no-docs', 'No docs', 'dscr', 'topic', 420),
  ('rates', 'Rates', 'dscr', 'topic', 430),
  ('llc', 'LLC', 'dscr', 'topic', 440),
  ('str', 'STR', 'dscr', 'topic', 450),
  ('foreign-national', 'Foreign national', 'dscr', 'topic', 460),
  ('write-offs', 'Write-offs', 'dscr', 'topic', 470),
  ('property-count', 'Property count', 'dscr', 'topic', 480),
  ('free-and-clear', 'Free and clear', 'dscr', 'topic', 490),
  ('hecm', 'HECM', 'reverse', 'track', 10),
  ('second', 'Second', 'reverse', 'track', 20),
  ('outcome-led', 'Outcome-led', 'reverse', 'strategy', 100),
  ('myth-led', 'Myth-led', 'reverse', 'strategy', 110),
  ('payment-gone', 'Payment-gone', 'reverse', 'outcome', 200),
  ('cash-out', 'Cash-out', 'reverse', 'outcome', 210),
  ('standby-line', 'Standby-line', 'reverse', 'outcome', 220),
  ('multi', 'Multi', 'reverse', 'outcome', 230),
  ('tof', 'TOF', 'reverse', 'stage', 300),
  ('mof', 'MOF', 'reverse', 'stage', 310),
  ('bof', 'BOF', 'reverse', 'stage', 320),
  ('none', 'None', 'reverse', 'equity_callout', 400),
  ('soft', 'Soft', 'reverse', 'equity_callout', 410),
  ('hard', 'Hard', 'reverse', 'equity_callout', 420),
  ('equity-trap', 'Equity trap', 'reverse', 'concept', 500),
  ('inflation-hedge', 'Inflation hedge', 'reverse', 'concept', 510),
  ('breaking-news', 'Breaking news', 'reverse', 'concept', 520),
  ('strategic-options', 'Strategic options', 'reverse', 'concept', 530),
  ('named-proof', 'Named proof', 'reverse', 'concept', 540),
  ('comment-reply', 'Comment reply', 'reverse', 'concept', 550),
  ('myth-scary', 'Myth scary', 'reverse', 'concept', 560),
  ('keep-rate', 'Keep rate', 'reverse', 'concept', 570),
  ('grandkids-visit', 'Grandkids visit', 'reverse', 'concept', 580),
  ('legacy-planner', 'Legacy planner', 'reverse', 'concept', 590),
  ('payment-gone', 'Payment-gone', 'reverse', 'concept', 600),
  ('standby-line', 'Standby-line', 'reverse', 'concept', 610),
  ('heirs-protected', 'Heirs protected', 'reverse', 'concept', 620),
  ('lo-authority', 'LO authority', 'reverse', 'concept', 630),
  ('second-not-reverse', 'Second not reverse', 'reverse', 'concept', 640),
  ('widow', 'Widow', 'reverse', 'trigger', 600),
  ('inflation', 'Inflation', 'reverse', 'trigger', 610),
  ('healthcare', 'Healthcare', 'reverse', 'trigger', 620),
  ('burden', 'Burden', 'reverse', 'trigger', 630),
  ('heirs', 'Heirs', 'reverse', 'trigger', 640),
  ('living-legacy', 'Living legacy', 'reverse', 'trigger', 650),
  ('stay-in-home', 'Stay in home', 'reverse', 'trigger', 660),
  ('surviving-vs-living', 'Surviving vs living', 'reverse', 'trigger', 670),
  ('payment-stress', 'Payment stress', 'reverse', 'trigger', 680),
  ('long-runway', 'Long runway', 'reverse', 'trigger', 690)
on conflict do nothing;

notify pgrst, 'reload schema';
