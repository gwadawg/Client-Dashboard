-- Align DSCR + RM ad_tags catalog with 2026-09-18 labeling contract.
-- Does not wipe ad_library creatives. Does not invent new categories.

-- 1) Retire conflicting / duplicate tags (keep rows for history; hide from picker)
update ad_tags
set is_active = false, updated_at = now()
where (product, category, slug) in (
  ('dscr', 'concept', 'navy-suburban-headline'),
  ('dscr', 'topic', 'no-docs'),
  ('dscr', 'topic', 'rates'),
  ('dscr', 'topic', 'balloon'),
  ('reverse', 'concept', 'legacy-planner')
);

-- Drop junction links to retired tags so Needs-tags / filters stay clean
delete from ad_library_tags alt
using ad_tags t
where alt.tag_id = t.id
  and t.is_active = false
  and (t.product, t.category, t.slug) in (
    ('dscr', 'concept', 'navy-suburban-headline'),
    ('dscr', 'topic', 'no-docs'),
    ('dscr', 'topic', 'rates'),
    ('dscr', 'topic', 'balloon'),
    ('reverse', 'concept', 'legacy-planner')
  );

-- 2) Rename RM strategic-options display label → Options grid
update ad_tags
set label = 'Options grid', updated_at = now()
where product = 'reverse'
  and category = 'concept'
  and slug = 'strategic-options';

-- 3) Ensure active DSCR concept set + sort order
update ad_tags set sort_order = 200, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'concept' and slug = 'nodocs-speed';
update ad_tags set sort_order = 210, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'concept' and slug = 'balloon-exit';
update ad_tags set sort_order = 220, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'concept' and slug = 'cashout-grow';
update ad_tags set sort_order = 230, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'concept' and slug = 'qualify-stack';
update ad_tags set sort_order = 240, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'concept' and slug = 'lo-authority';
update ad_tags set sort_order = 250, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'concept' and slug = 'ratecard-centered';

-- 4) DSCR topics: keep modifiers; add Rehab / Reserves / Rate-term
update ad_tags set sort_order = 400, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'topic' and slug = 'write-offs';
update ad_tags set sort_order = 410, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'topic' and slug = 'property-count';
update ad_tags set sort_order = 420, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'topic' and slug = 'str';
update ad_tags set sort_order = 430, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'topic' and slug = 'foreign-national';
update ad_tags set sort_order = 440, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'topic' and slug = 'llc';
update ad_tags set sort_order = 450, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'topic' and slug = 'free-and-clear';
update ad_tags set sort_order = 460, is_active = true, updated_at = now()
  where product = 'dscr' and category = 'topic' and slug = 'cash-out';

insert into ad_tags (slug, label, product, category, sort_order, is_active)
values
  ('rehab', 'Rehab', 'dscr', 'topic', 470, true),
  ('reserves', 'Reserves', 'dscr', 'topic', 480, true),
  ('rate-term', 'Rate/term', 'dscr', 'topic', 490, true)
on conflict (product, category, slug) do update
set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

-- 5) Angle stays available as optional legacy (single-select in app)
update ad_tags
set is_active = true, updated_at = now()
where product = 'dscr' and category = 'angle';

-- 6) RM concept keep-list: ensure active + Options grid label; retire only legacy-planner
update ad_tags set is_active = true, updated_at = now()
where product = 'reverse'
  and category = 'concept'
  and slug in (
    'equity-trap',
    'inflation-hedge',
    'payment-gone',
    'standby-line',
    'myth-scary',
    'heirs-protected',
    'grandkids-visit',
    'keep-rate',
    'second-not-reverse',
    'lo-authority',
    'breaking-news',
    'strategic-options',
    'named-proof',
    'comment-reply'
  );

notify pgrst, 'reload schema';
