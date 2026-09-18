# Ad Library Product-Category Tags Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wipe the flat Ad Library tag catalog and rebuild product-scoped
category tags for DSCR and Reverse so Ad Library, Ad Performance, and Creative
Command share one labeling model.

**Architecture:** Extend `ad_tags` with `product` + `category`. Junction rows
reference `tag_id` (not global slug) so both products can own `cash-out`.
Category order and seed lists live in a pure TS registry. UI is a stack of
closed dropdowns per category. Creative Command clusters by
`product × category × slug` instead of dumping every tag into one “Topic”
pile. Funnel math stays on ad name / aliases and is untouched.

**Tech Stack:** Next.js App Router, Supabase (Postgres), existing Media Buyer
components, `tsx --test` (node:test) unit tests.

**Spec:**
`docs/superpowers/specs/2026-09-18-ad-library-product-category-tags-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/ad-tag-categories.ts` | Product → category order, labels, seed tag definitions |
| `src/lib/ad-tag-categories.test.ts` | Registry invariants (unique slugs per product×category, known products) |
| `src/lib/ad-tags.ts` | Types: `AdTag`, `AdTagRef` with `product` + `category` + `id` |
| `src/lib/ad-tags-db.ts` | List/create/resolve/replace against new schema |
| `src/lib/ad-tags-resolve.test.ts` | Pure helpers: normalize tag ids, product match, clear-on-product-change |
| `supabase/migrations/rebuild_ad_tags_product_categories.sql` | Wipe + schema + seed |
| `supabase/schema.sql` | Keep in sync with migration |
| `src/app/api/ad-tags/route.ts` | GET (optional `?product=`), POST (`product` + `category` + `label`) |
| `src/app/api/ad-library/route.ts` | Create: resolve tag **ids**, enforce product match |
| `src/app/api/ad-library/[id]/route.ts` | Update: same; strip mismatched tags when product changes |
| `src/app/api/ad-library/intelligence/route.ts` | Filter by `tag_id`; return enriched tags |
| `src/components/AdTagPicker.tsx` | Category dropdown multi-select (product-scoped) |
| `src/components/ad-library/CategoryTagFilters.tsx` | Compact category filter dropdowns for Library + Performance |
| `src/lib/ad-library-folders.ts` | Add smart folder `untagged` (“Needs tags”) |
| `src/lib/ad-library-folders.test.ts` | Cover untagged matching |
| `src/components/MediaBuyer.tsx` | Wire picker + filters on Library + Performance |
| `src/lib/ad-creative-lenses.ts` | `ClusterRow` gains `category` for tag clusters |
| `src/lib/ad-creative-intel.ts` | `buildClusters` keys by category |
| `src/lib/ad-creative-intel.test.ts` | Cluster by category |
| `src/components/creative-command/ClusterPanel.tsx` | Category toggles (concept / topic|trigger / bucket|track|strategy) |
| `package.json` | Add new test files to `test` script |
| Wm-os: `.cursor/skills/ad-naming/SKILL.md`, `docs/operations/ad-intelligence-bridge.md`, naming convention label block | Stop legacy flat-tag examples |

---

### Task 1: Category registry (pure TS)

**Files:**
- Create: `src/lib/ad-tag-categories.ts`
- Create: `src/lib/ad-tag-categories.test.ts`
- Modify: `package.json` (`test` script — add the new test file)

- [ ] **Step 1: Write the failing registry test**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  AD_TAG_PRODUCTS,
  categoriesForProduct,
  seedTagsForProduct,
  type AdTagProduct,
} from './ad-tag-categories';

describe('ad-tag-categories', () => {
  it('defines DSCR and reverse category lists', () => {
    assert.deepEqual(
      categoriesForProduct('dscr').map((c) => c.key),
      ['bucket', 'creative_job', 'concept', 'angle', 'topic'],
    );
    assert.deepEqual(
      categoriesForProduct('reverse').map((c) => c.key),
      ['track', 'strategy', 'outcome', 'stage', 'equity_callout', 'concept', 'trigger'],
    );
    assert.deepEqual(categoriesForProduct('broad_forward'), []);
  });

  it('keeps seed slugs unique within product × category', () => {
    for (const product of AD_TAG_PRODUCTS) {
      for (const cat of categoriesForProduct(product)) {
        const slugs = seedTagsForProduct(product)
          .filter((t) => t.category === cat.key)
          .map((t) => t.slug);
        assert.equal(new Set(slugs).size, slugs.length, `${product}/${cat.key}`);
      }
    }
  });

  it('seeds denied and hecm', () => {
    assert.ok(
      seedTagsForProduct('dscr').some((t) => t.category === 'bucket' && t.slug === 'denied'),
    );
    assert.ok(
      seedTagsForProduct('reverse').some((t) => t.category === 'track' && t.slug === 'hecm'),
    );
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

```bash
npx tsx --test src/lib/ad-tag-categories.test.ts
```

Expected: cannot find module `./ad-tag-categories`

- [ ] **Step 3: Implement registry**

Create `src/lib/ad-tag-categories.ts` with:

```ts
export type AdTagProduct = 'dscr' | 'reverse' | 'broad_forward';

export const AD_TAG_PRODUCTS: AdTagProduct[] = ['dscr', 'reverse', 'broad_forward'];

export type AdTagCategoryDef = {
  key: string;
  label: string;
  sort_order: number;
};

export type AdTagSeed = {
  product: AdTagProduct;
  category: string;
  slug: string;
  label: string;
  sort_order: number;
};

const DSCR_CATEGORIES: AdTagCategoryDef[] = [
  { key: 'bucket', label: 'Bucket', sort_order: 10 },
  { key: 'creative_job', label: 'Creative job', sort_order: 20 },
  { key: 'concept', label: 'Concept', sort_order: 30 },
  { key: 'angle', label: 'Angle', sort_order: 40 },
  { key: 'topic', label: 'Topic', sort_order: 50 },
];

const REVERSE_CATEGORIES: AdTagCategoryDef[] = [
  { key: 'track', label: 'Track', sort_order: 10 },
  { key: 'strategy', label: 'Strategy', sort_order: 20 },
  { key: 'outcome', label: 'Outcome', sort_order: 30 },
  { key: 'stage', label: 'Stage', sort_order: 40 },
  { key: 'equity_callout', label: 'Equity callout', sort_order: 50 },
  { key: 'concept', label: 'Concept', sort_order: 60 },
  { key: 'trigger', label: 'Trigger', sort_order: 70 },
];

export function categoriesForProduct(product: AdTagProduct): AdTagCategoryDef[] {
  if (product === 'dscr') return DSCR_CATEGORIES;
  if (product === 'reverse') return REVERSE_CATEGORIES;
  return [];
}

function seeds(
  product: AdTagProduct,
  category: string,
  items: [string, string][],
  baseOrder: number,
): AdTagSeed[] {
  return items.map(([slug, label], i) => ({
    product,
    category,
    slug,
    label,
    sort_order: baseOrder + i * 10,
  }));
}

/** Full seed list — must match the design spec tables. */
export function seedTagsForProduct(product: AdTagProduct): AdTagSeed[] {
  if (product === 'dscr') {
    return [
      ...seeds('dscr', 'bucket', [
        ['denied', 'Denied'],
        ['deadline', 'Deadline'],
        ['idle', 'Idle'],
        ['in-market', 'In-market'],
      ], 10),
      ...seeds('dscr', 'creative_job', [
        ['reveal', 'Reveal'],
        ['exit', 'Exit'],
        ['belief', 'Belief'],
        ['outcome', 'Outcome'],
        ['terms', 'Terms'],
        ['authority', 'Authority'],
      ], 100),
      ...seeds('dscr', 'concept', [
        ['nodocs-speed', 'Nodocs speed'],
        ['balloon-exit', 'Balloon exit'],
        ['cashout-grow', 'Cashout grow'],
        ['ratecard-centered', 'Ratecard centered'],
        ['navy-suburban-headline', 'Navy suburban headline'],
        ['qualify-stack', 'Qualify stack'],
        ['lo-authority', 'LO authority'],
      ], 200),
      ...seeds('dscr', 'angle', [
        ['angle-1-idle-equity', 'Angle 1 — Idle equity'],
        ['angle-2-deadline', 'Angle 2 — Deadline'],
        ['angle-3-did-you-know', 'Angle 3 — Did you know'],
        ['angle-4-checklist', 'Angle 4 — Checklist'],
        ['angle-5-what-you-could-do', 'Angle 5 — What you could do'],
        ['angle-new', 'Angle — New'],
      ], 300),
      ...seeds('dscr', 'topic', [
        ['cash-out', 'Cash-out'],
        ['balloon', 'Balloon'],
        ['no-docs', 'No docs'],
        ['rates', 'Rates'],
        ['llc', 'LLC'],
        ['str', 'STR'],
        ['foreign-national', 'Foreign national'],
        ['write-offs', 'Write-offs'],
        ['property-count', 'Property count'],
        ['free-and-clear', 'Free and clear'],
      ], 400),
    ];
  }
  if (product === 'reverse') {
    return [
      ...seeds('reverse', 'track', [
        ['hecm', 'HECM'],
        ['second', 'Second'],
      ], 10),
      ...seeds('reverse', 'strategy', [
        ['outcome-led', 'Outcome-led'],
        ['myth-led', 'Myth-led'],
      ], 100),
      ...seeds('reverse', 'outcome', [
        ['payment-gone', 'Payment-gone'],
        ['cash-out', 'Cash-out'],
        ['standby-line', 'Standby-line'],
        ['multi', 'Multi'],
      ], 200),
      ...seeds('reverse', 'stage', [
        ['tof', 'TOF'],
        ['mof', 'MOF'],
        ['bof', 'BOF'],
      ], 300),
      ...seeds('reverse', 'equity_callout', [
        ['none', 'None'],
        ['soft', 'Soft'],
        ['hard', 'Hard'],
      ], 400),
      ...seeds('reverse', 'concept', [
        ['equity-trap', 'Equity trap'],
        ['inflation-hedge', 'Inflation hedge'],
        ['breaking-news', 'Breaking news'],
        ['strategic-options', 'Strategic options'],
        ['named-proof', 'Named proof'],
        ['comment-reply', 'Comment reply'],
        ['myth-scary', 'Myth scary'],
        ['keep-rate', 'Keep rate'],
        ['grandkids-visit', 'Grandkids visit'],
        ['legacy-planner', 'Legacy planner'],
        ['payment-gone', 'Payment-gone'],
        ['standby-line', 'Standby-line'],
        ['heirs-protected', 'Heirs protected'],
        ['lo-authority', 'LO authority'],
        ['second-not-reverse', 'Second not reverse'],
      ], 500),
      ...seeds('reverse', 'trigger', [
        ['widow', 'Widow'],
        ['inflation', 'Inflation'],
        ['healthcare', 'Healthcare'],
        ['burden', 'Burden'],
        ['heirs', 'Heirs'],
        ['living-legacy', 'Living legacy'],
        ['stay-in-home', 'Stay in home'],
        ['surviving-vs-living', 'Surviving vs living'],
        ['payment-stress', 'Payment stress'],
        ['long-runway', 'Long runway'],
      ], 600),
    ];
  }
  return [];
}

export function allSeedTags(): AdTagSeed[] {
  return AD_TAG_PRODUCTS.flatMap((p) => seedTagsForProduct(p));
}

export function isAdTagProduct(v: string | null | undefined): v is AdTagProduct {
  return v === 'dscr' || v === 'reverse' || v === 'broad_forward';
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx tsx --test src/lib/ad-tag-categories.test.ts
```

- [ ] **Step 5: Add file to `package.json` `test` script** (append
  `src/lib/ad-tag-categories.test.ts` next to other `src/lib/*.test.ts`
  entries).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ad-tag-categories.ts src/lib/ad-tag-categories.test.ts package.json
git commit -m "$(cat <<'EOF'
Add DSCR and RM ad-tag category seed registry.

EOF
)"
```

---

### Task 2: Tag types + pure resolve helpers

**Files:**
- Modify: `src/lib/ad-tags.ts`
- Create: `src/lib/ad-tags-resolve.ts`
- Create: `src/lib/ad-tags-resolve.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing tests for resolve helpers**

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterTagsForProduct,
  normalizeTagIds,
  tagsAfterProductChange,
} from './ad-tags-resolve';
import type { AdTagRef } from './ad-tags';

const catalog: AdTagRef[] = [
  { id: '1', slug: 'denied', label: 'Denied', product: 'dscr', category: 'bucket' },
  { id: '2', slug: 'hecm', label: 'HECM', product: 'reverse', category: 'track' },
  { id: '3', slug: 'cash-out', label: 'Cash-out', product: 'dscr', category: 'topic' },
];

describe('ad-tags-resolve', () => {
  it('normalizeTagIds dedupes and rejects non-strings', () => {
    assert.deepEqual(normalizeTagIds(['1', '1', '2']).ids, ['1', '2']);
    assert.equal(normalizeTagIds('x').error, 'tags must be an array of tag ids');
  });

  it('filterTagsForProduct drops other products', () => {
    assert.deepEqual(
      filterTagsForProduct(catalog, 'dscr').map((t) => t.id),
      ['1', '3'],
    );
  });

  it('tagsAfterProductChange keeps only matching product ids', () => {
    assert.deepEqual(tagsAfterProductChange(['1', '2', '3'], catalog, 'dscr'), ['1', '3']);
    assert.deepEqual(tagsAfterProductChange(['1', '2'], catalog, 'reverse'), ['2']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx tsx --test src/lib/ad-tags-resolve.test.ts
```

- [ ] **Step 3: Update types in `src/lib/ad-tags.ts`**

Replace `AdTag` / `AdTagRef` and keep `slugifyAdTag`. Remove or stop using
`normalizeTagSlugs` for library writes (keep temporarily if other callers;
mark deprecated). New shapes:

```ts
import type { AdTagProduct } from './ad-tag-categories';

export type AdTag = {
  id: string;
  slug: string;
  label: string;
  product: AdTagProduct;
  category: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type AdTagRef = {
  id: string;
  slug: string;
  label: string;
  product: AdTagProduct;
  category: string;
};
```

- [ ] **Step 4: Implement `src/lib/ad-tags-resolve.ts`**

```ts
import type { AdTagRef } from './ad-tags';
import type { AdTagProduct } from './ad-tag-categories';

export function normalizeTagIds(value: unknown): { ids: string[]; error?: string } {
  if (value == null) return { ids: [] };
  if (!Array.isArray(value)) return { ids: [], error: 'tags must be an array of tag ids' };
  const ids: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string') return { ids: [], error: 'tags must be an array of tag ids' };
    const id = item.trim();
    if (!id) continue;
    if (!ids.includes(id)) ids.push(id);
  }
  return { ids };
}

export function filterTagsForProduct(tags: AdTagRef[], product: AdTagProduct): AdTagRef[] {
  return tags.filter((t) => t.product === product);
}

export function tagsAfterProductChange(
  selectedIds: string[],
  catalog: AdTagRef[],
  nextProduct: AdTagProduct | null,
): string[] {
  if (!nextProduct) return [];
  const allowed = new Set(
    catalog.filter((t) => t.product === nextProduct).map((t) => t.id),
  );
  return selectedIds.filter((id) => allowed.has(id));
}
```

- [ ] **Step 5: Run tests — PASS; add to package.json; commit**

```bash
npx tsx --test src/lib/ad-tags-resolve.test.ts src/lib/ad-tag-categories.test.ts
git add src/lib/ad-tags.ts src/lib/ad-tags-resolve.ts src/lib/ad-tags-resolve.test.ts package.json
git commit -m "$(cat <<'EOF'
Extend ad tag types with product and category; add resolve helpers.

EOF
)"
```

---

### Task 3: Schema migration (wipe + rebuild + seed)

**Files:**
- Create: `supabase/migrations/rebuild_ad_tags_product_categories.sql`
- Modify: `supabase/schema.sql` (ad_tags + ad_library_tags sections)

- [ ] **Step 1: Write migration**

```sql
-- Rebuild ad_tags as product × category catalogs (2026-09-18)
-- WIPEs all tag links and legacy catalog rows. Does NOT touch ad_library
-- creative fields (summary, visual_notes, drive_url, etc.).

-- 1) Drop old junction (slug FK)
drop table if exists ad_library_tags cascade;

-- 2) Wipe + reshape catalog
truncate table ad_tags cascade;

alter table ad_tags add column if not exists product text;
alter table ad_tags add column if not exists category text;

update ad_tags set product = 'dscr', category = 'topic' where product is null;
-- (table is empty after truncate; update is a no-op safety net)

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

-- Slug unique only within product × category
alter table ad_tags drop constraint if exists ad_tags_slug_key;
drop index if exists ad_tags_slug_key;
create unique index if not exists ad_tags_product_category_slug_key
  on ad_tags (product, category, slug);

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

-- 4) Seed: generate VALUES from allSeedTags() (see Step 1b below).
-- Do not hand-type a partial list.
insert into ad_tags (slug, label, product, category, sort_order) values
  -- GENERATED_SEED_ROWS
on conflict do nothing;

notify pgrst, 'reload schema';
```

- [ ] **Step 1b: Generate full seed VALUES and paste over
  `GENERATED_SEED_ROWS`**

```bash
npx tsx -e "
import { allSeedTags } from './src/lib/ad-tag-categories.ts';
const rows = allSeedTags().map((t) => {
  const label = t.label.replace(/'/g, \"''\");
  return \"  ('\" + t.slug + \"', '\" + label + \"', '\" + t.product + \"', '\" + t.category + \"', \" + t.sort_order + \")\";
});
console.log(rows.join(',\\n'));
"
```

Paste the printed rows into the migration in place of the
`GENERATED_SEED_ROWS` comment. Confirm row count matches
`allSeedTags().length` (DSCR + reverse only; broad_forward contributes 0).

- [ ] **Step 2: Mirror the same `ad_tags` / `ad_library_tags` definitions in
  `supabase/schema.sql`** (replace the old insert of rates/hecm/…).

- [ ] **Step 3: Apply on Supabase** (founder / deploy step — document in PR):

Run the migration SQL against WM Reporting. Verify:

```sql
select product, category, count(*) from ad_tags group by 1, 2 order by 1, 2;
select count(*) from ad_library_tags; -- expect 0
select count(*) from ad_library;     -- unchanged
```

- [ ] **Step 4: Commit migration + schema.sql**

```bash
git add supabase/migrations/rebuild_ad_tags_product_categories.sql supabase/schema.sql
git commit -m "$(cat <<'EOF'
Rebuild ad_tags as product-category catalogs and wipe old links.

EOF
)"
```

---

### Task 4: Database helpers (`ad-tags-db.ts`)

**Files:**
- Modify: `src/lib/ad-tags-db.ts`

- [ ] **Step 1: Rewrite helpers for id-based junction**

Update `AD_TAG_SELECT` to:
`'id, slug, label, product, category, sort_order, is_active, created_at'`

Replace functions:

```ts
export async function listAdTags(
  service: ServiceClient,
  product?: AdTagProduct | null,
): Promise<{ data: AdTag[] | null; error: { message: string } | null }> {
  let q = service
    .from('ad_tags')
    .select(AD_TAG_SELECT)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });
  if (product) q = q.eq('product', product);
  const { data, error } = await q;
  return { data: (data as AdTag[] | null) ?? null, error };
}

export async function resolveTagIds(
  service: ServiceClient,
  value: unknown,
  product: AdTagProduct | null,
): Promise<{ ids: string[]; error?: string }> {
  const parsed = normalizeTagIds(value);
  if (parsed.error) return parsed;
  if (parsed.ids.length === 0) return { ids: [] };
  if (!product) return { ids: [], error: 'product is required before attaching tags' };

  const { data, error } = await service
    .from('ad_tags')
    .select('id, product')
    .in('id', parsed.ids)
    .eq('is_active', true);
  if (error) return { ids: [], error: error.message };

  const found = new Map((data ?? []).map((r) => [r.id as string, r.product as string]));
  for (const id of parsed.ids) {
    if (!found.has(id)) return { ids: [], error: `Unknown tag id: ${id}` };
    if (found.get(id) !== product) {
      return { ids: [], error: `Tag ${id} does not belong to product ${product}` };
    }
  }
  return { ids: parsed.ids };
}

export async function replaceLibraryTags(
  service: ServiceClient,
  libraryId: string,
  tagIds: string[],
): Promise<{ error?: string }> {
  const { error: delError } = await service
    .from('ad_library_tags')
    .delete()
    .eq('library_id', libraryId);
  if (delError) return { error: delError.message };
  if (tagIds.length === 0) return {};
  const { error: insError } = await service
    .from('ad_library_tags')
    .insert(tagIds.map((tag_id) => ({ library_id: libraryId, tag_id })));
  if (insError) return { error: insError.message };
  return {};
}

export async function tagsByLibraryId(
  service: ServiceClient,
  libraryIds: string[],
): Promise<{ data: Map<string, AdTagRef[]>; error?: string }> {
  const map = new Map<string, AdTagRef[]>();
  if (libraryIds.length === 0) return { data: map };

  const { data: junctions, error: jErr } = await service
    .from('ad_library_tags')
    .select('library_id, tag_id')
    .in('library_id', libraryIds);
  if (jErr) return { data: map, error: jErr.message };

  const tagIds = [...new Set((junctions ?? []).map((r) => r.tag_id as string))];
  if (tagIds.length === 0) return { data: map };

  const { data: catalog, error: cErr } = await service
    .from('ad_tags')
    .select(AD_TAG_SELECT)
    .in('id', tagIds);
  if (cErr) return { data: map, error: cErr.message };

  const byId = new Map((catalog ?? []).map((t) => [t.id as string, t as AdTag]));
  for (const row of junctions ?? []) {
    const tag = byId.get(row.tag_id as string);
    if (!tag) continue;
    const list = map.get(row.library_id as string) ?? [];
    list.push({
      id: tag.id,
      slug: tag.slug,
      label: tag.label,
      product: tag.product,
      category: tag.category,
    });
    map.set(row.library_id as string, list);
  }
  return { data: map };
}
```

Update `createAdTag` to require `product` + `category` + `label`, insert those
columns, uniqueness on `(product, category, slug)`.

Remove `adTagSlugExists` slug-only checks used by intelligence, or replace with
`adTagIdExists(service, id)`.

- [ ] **Step 2: Commit**

```bash
git add src/lib/ad-tags-db.ts
git commit -m "$(cat <<'EOF'
Point ad-tags-db at product-category catalog and tag_id junction.

EOF
)"
```

---

### Task 5: API routes

**Files:**
- Modify: `src/app/api/ad-tags/route.ts`
- Modify: `src/app/api/ad-library/route.ts`
- Modify: `src/app/api/ad-library/[id]/route.ts`
- Modify: `src/app/api/ad-library/intelligence/route.ts`

- [ ] **Step 1: `GET /api/ad-tags?product=dscr`**

```ts
const product = new URL(req.url).searchParams.get('product');
const { data, error } = await listAdTags(
  ctx.service,
  product && isAdTagProduct(product) ? product : null,
);
```

- [ ] **Step 2: `POST /api/ad-tags`** body:
  `{ label, product, category }` → `createAdTag(...)`.

- [ ] **Step 3: Library POST/PATCH** — call `resolveTagIds(service, body.tags,
  product)` then `replaceLibraryTags`. When PATCH changes `product`, resolve
  tags against the **new** product (caller should send filtered ids; server
  still rejects mismatches).

- [ ] **Step 4: Intelligence GET** — filter junction by `tag_id` when
  `?tag_id=` is set (keep `?tag=` as slug only if scoped with `?product=` +
  `?category=`; prefer `tag_id` in new UI).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ad-tags/route.ts src/app/api/ad-library/route.ts \
  src/app/api/ad-library/[id]/route.ts src/app/api/ad-library/intelligence/route.ts
git commit -m "$(cat <<'EOF'
Update ad tag and library APIs for product-scoped category tags.

EOF
)"
```

---

### Task 6: AdTagPicker UI (category dropdowns)

**Files:**
- Rewrite: `src/components/AdTagPicker.tsx`

- [ ] **Step 1: Change `useAdTags(product?: string)`** to fetch
  `/api/ad-tags?product=...` when product set; return empty active list when
  product missing or `broad_forward`.

- [ ] **Step 2: Replace flat chip wall with category accordion/dropdowns**

Props:

```ts
type PickerProps = {
  product: string; // ad product
  value: string[]; // tag ids
  onChange: (ids: string[]) => void;
  tags: AdTag[];
  onCreate?: (input: { label: string; category: string }) => Promise<AdTag>;
  loading?: boolean;
};
```

Behavior:
- Use `categoriesForProduct(product)` for dropdown order.
- Each category: closed `<details>` or button+panel; summary shows selected
  labels joined (e.g. `Denied, Idle`) or “None”.
- Inside: multi-select chips for tags in that category only.
- Optional “Add tag” inside a category calls `onCreate` with that category.
- If `categoriesForProduct` is empty: show “No tag catalog for this product yet.”

- [ ] **Step 3: Manual smoke in browser** — open Add Ad, pick DSCR, confirm
  five dropdowns; pick Reverse, seven dropdowns.

- [ ] **Step 4: Commit**

```bash
git add src/components/AdTagPicker.tsx
git commit -m "$(cat <<'EOF'
Rebuild AdTagPicker as product-scoped category dropdowns.

EOF
)"
```

---

### Task 7: Folder “Needs tags” + Library filters

**Files:**
- Modify: `src/lib/ad-library-folders.ts`
- Modify: `src/lib/ad-library-folders.test.ts`
- Create: `src/components/ad-library/CategoryTagFilters.tsx`
- Modify: `src/components/MediaBuyer.tsx` (Ad Library section)

- [ ] **Step 1: Extend smart folders**

```ts
export type SmartFolderId = 'all' | 'ready' | 'winners' | 'needs' | 'untagged';

export const SMART_FOLDER_LABELS: Record<SmartFolderId, string> = {
  all: 'All ads',
  ready: 'Ready to test',
  winners: 'Winners',
  needs: 'Needs classification',
  untagged: 'Needs tags',
};

export type LibraryFolderEntry = {
  product: string | null;
  ad_format: string | null;
  status: string;
  ready_to_test?: boolean | null;
  tags?: { id: string }[] | null;
};

export function needsTags(e: LibraryFolderEntry): boolean {
  return !!e.product?.trim() && (e.tags?.length ?? 0) === 0;
}
```

In `entryMatchesFolder`, `case 'untagged': return needsTags(e);`
In `buildFolderTreeCounts`, count `untagged`.

- [ ] **Step 2: Tests for untagged**

```ts
it('matches Needs tags when product set and no tags', () => {
  assert.equal(
    entryMatchesFolder(
      { product: 'dscr', ad_format: 'static', status: 'active', tags: [] },
      { kind: 'smart', id: 'untagged' },
    ),
    true,
  );
});
```

- [ ] **Step 3: `CategoryTagFilters`** — given `product` filter (or current
  folder product) + catalog + selected map
  `Record<category, string[] /* tag ids */>`, render one compact dropdown per
  category. Empty product → hide or disable.

- [ ] **Step 4: Wire MediaBuyer Ad Library** — form stores `tags: string[]`
  as **ids**; `AdTagPicker` gets `form.product`; on product change call
  `tagsAfterProductChange`. Replace flat tag chip filter with
  `CategoryTagFilters`. Pass `tags` into folder entry matching.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ad-library-folders.ts src/lib/ad-library-folders.test.ts \
  src/components/ad-library/CategoryTagFilters.tsx src/components/MediaBuyer.tsx
git commit -m "$(cat <<'EOF'
Add Needs tags folder and category filters to Ad Library.

EOF
)"
```

---

### Task 8: Ad Performance filters + concept strip

**Files:**
- Modify: `src/components/MediaBuyer.tsx` (Ad Performance section)
- Modify: `src/lib/ad-performance.ts` only if `AdLibraryMeta.tags` type needs
  `id` / `category` (likely already via `AdTagRef`)

- [ ] **Step 1: Update `adPassesSlice` / tag filter** to accept selected tag
  ids (OR within category handled by UI sending a flat id list, or AND across
  categories: ad must match every non-empty category filter).

Implement AND-across / OR-within:

```ts
function adMatchesCategoryFilters(
  tags: AdTagRef[] | undefined,
  selectedByCategory: Record<string, string[]>,
): boolean {
  const list = tags ?? [];
  for (const [category, ids] of Object.entries(selectedByCategory)) {
    if (!ids.length) continue;
    const hit = list.some((t) => t.category === category && ids.includes(t.id));
    if (!hit) return false;
  }
  return true;
}
```

- [ ] **Step 2: Replace single tag dropdown with `CategoryTagFilters`** scoped
  to current product filter (when product = all, show union of categories for
  products present, or require product first — prefer: when product is `all`,
  hide category filters and show helper text “Pick a product to filter by
  tags”).

- [ ] **Step 3: Concept strip chips** — group by category label prefix
  (`Bucket · Denied`) or show `category:label`; clicking sets that category
  filter.

- [ ] **Step 4: Commit**

```bash
git add src/components/MediaBuyer.tsx src/lib/ad-performance.ts
git commit -m "$(cat <<'EOF'
Wire Ad Performance to product-category tag filters.

EOF
)"
```

---

### Task 9: Creative Command clusters

**Files:**
- Modify: `src/lib/ad-creative-lenses.ts`
- Modify: `src/lib/ad-creative-intel.ts`
- Modify: `src/lib/ad-creative-intel.test.ts`
- Modify: `src/components/creative-command/ClusterPanel.tsx`
- Modify: `src/components/creative-command/LensResults.tsx` (tag chips show
  category if useful)

- [ ] **Step 1: Extend `ClusterRow`**

```ts
export type ClusterRow = {
  kind: 'tag' | 'format';
  /** For tag clusters: category key (bucket, concept, …). Null for format. */
  category: string | null;
  key: string;
  label: string;
  product: AdProductKey;
  // …existing metrics…
};
```

- [ ] **Step 2: Update `buildClusters`**

When adding tags:

```ts
for (const tag of ad.library?.tags ?? []) {
  add(
    'tag',
    `${tag.category}:${tag.slug}`,
    `${tag.category}: ${tag.label}`,
    ad,
    tag.category,
  );
}
```

Pass `category` into accumulator; set `category` on output `ClusterRow`.

- [ ] **Step 3: Failing test then fix** — library row with
  `tags: [{ id, slug: 'denied', category: 'bucket', … }]` yields a cluster
  with `category === 'bucket'`.

- [ ] **Step 4: `ClusterPanel`** — replace binary Topic/Format toggle with:
  Format | Concept | Topic/Trigger | Bucket/Track | Strategy (show only
  categories that exist in `clusters` for the scoped product). Filter
  `clusters.filter(c => c.kind==='format' || c.category === selected)`.

- [ ] **Step 5: Empty state copy:** “No tag clusters in range. Re-label
  creatives in Ad Library (Needs tags).”

- [ ] **Step 6: Commit**

```bash
git add src/lib/ad-creative-lenses.ts src/lib/ad-creative-intel.ts \
  src/lib/ad-creative-intel.test.ts \
  src/components/creative-command/ClusterPanel.tsx \
  src/components/creative-command/LensResults.tsx
git commit -m "$(cat <<'EOF'
Cluster Creative Command tags by product category.

EOF
)"
```

---

### Task 10: Wm-os agent / bridge docs

**Files (Wm-os repo):**
- Modify: `.cursor/skills/ad-naming/SKILL.md`
- Modify: `docs/client-fulfillment/media-buying/ad-naming-convention.md`
  (label output `tags` example)
- Modify: `docs/operations/ad-intelligence-bridge.md`
- Optional pointer from taxonomy docs to Mr. Waiz catalog

- [ ] **Step 1: Replace flat tag examples** (`[cash-out, education]`, HECM)
  with product-category guidance: pick product → select category tags from
  Mr. Waiz catalog; do not invent slugs.

- [ ] **Step 2: Commit in Wm-os**

```bash
cd "/Users/gwadawg/Desktop/Repos/Wm-os"
git add .cursor/skills/ad-naming/SKILL.md \
  docs/client-fulfillment/media-buying/ad-naming-convention.md \
  docs/operations/ad-intelligence-bridge.md
git commit -m "$(cat <<'EOF'
Point ad naming and intelligence bridge at product-category tags.

EOF
)"
```

---

### Task 11: End-to-end verification

- [ ] **Step 1: Unit suite**

```bash
npm test
```

Expected: PASS (including new ad-tag + folder + intel tests).

- [ ] **Step 2: Manual checklist (against deployed migration)**

1. Ad Library: existing ads still show Drive / summary; tags empty.
2. Smart folder **Needs tags** lists product-assigned ads with zero tags.
3. Edit a DSCR ad → five category dropdowns → save → tags round-trip on GET.
4. Edit an RM ad → seven dropdowns → save → round-trip.
5. Change product DSCR→RM → DSCR tags cleared.
6. Ad Performance: product filter works with zero tags; after tagging,
   category filter AND-across works.
7. Creative Command: product lenses + format clusters work with zero tags;
   after tagging, Concept / Bucket clusters appear; no 500s.
8. Confirm `cash-out` exists on both products as separate rows.

- [ ] **Step 3: Final commit** only if docs/comments adjusted during QA;
  otherwise stop.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Wipe tags; keep ad copy/links | Task 3 |
| product + category catalog | Tasks 1, 3, 4 |
| tag_id junction / cross-product slug | Task 3 |
| DSCR + RM seeds | Tasks 1, 3 |
| Dropdown UI | Task 6 |
| Needs tags queue | Task 7 |
| Library filters | Task 7 |
| Ad Performance filters | Task 8 |
| Creative Command category clusters | Task 9 |
| API product match guards | Tasks 4–5 |
| OS / agent alignment | Task 10 |
| E2E verification | Task 11 |

No intentional TBD placeholders remain in task steps.
