---
title: Ad Library product-category tags
status: draft
last_updated: 2026-09-18
artifact_type: design
related_docs:
  - docs/superpowers/specs/2026-08-20-ad-library-folder-navigation-design.md
  - docs/AD-INTELLIGENCE.md
  - /Users/gwadawg/Desktop/Repos/Wm-os/docs/client-fulfillment/dscr-dna/dscr-creative-taxonomy.md
  - /Users/gwadawg/Desktop/Repos/Wm-os/docs/client-fulfillment/reverse-mortgage-dna/rm-creative-taxonomy.md
  - /Users/gwadawg/Desktop/Repos/Wm-os/docs/operations/ad-intelligence-bridge.md
  - /Users/gwadawg/Desktop/Repos/Wm-os/docs/client-fulfillment/media-buying/ad-naming-convention.md
---

# Ad Library product-category tags

Date: 2026-09-18
Status: Draft — awaiting founder review before implementation plan

## Problem

Mr. Waiz Ad Library already splits creatives by **product**
(`reverse` / `dscr` / `broad_forward`) and **format**, but **topic tags
are one flat shared catalog** (Rates, Cash-out, HECM, Credit, Education,
Testimonial, Objection). RM-only and shared tags sit in the same list.
DSCR and RM creative taxonomies now define product-specific labeling
dimensions that have **no first-class home** in the database — only free
text in `summary` if someone remembers to write them.

Ad names are too inconsistent to carry taxonomy. Analytics and Creative
Command need reliable filters by product-specific dimensions (DSCR
constraint bucket, RM strategy/outcome, etc.).

## Goal

1. Wipe the legacy tag catalog and all tag links.
2. Rebuild tagging as **product-scoped category catalogs**.
3. Seed **DSCR** and **Reverse** from their creative taxonomies in one
   ship.
4. Keep every ad row’s identity and copy intact (name, aliases, Drive
   links, summary, visual notes, format, status, performance joins).
5. Wire Ad Library, Ad Performance, and Creative Command so category
   tags flow through without breaking spend / CPQL / fatigue math.

## Non-goals

- Renaming historical `ad_name` values
- Broad Forward taxonomy seed (shell only / empty)
- Auto-deriving tags from `summary`
- Forcing single-select per category (multi-select is intentional)
- Persona / archetype as campaign tag categories on RM (scripting only
  per RM taxonomy)
- Changing Meta campaign / ad set naming

## Decision

**Approach: category-scoped tag catalog per product.**

Each catalog row has `product` + `category` + `slug` / `label`. Ads
attach many tags via a junction. Upload flow: pick product → product’s
category **dropdowns** → multi-select tags inside each dropdown.
Categories are **not** the same names across products — DSCR and RM
each get the dimensions their taxonomy defines.

## Data model

### Keep untouched on `ad_library`

`ad_name`, aliases, `product`, `ad_format`, `summary`, `visual_notes`,
`drive_url`, `thumbnail_url`, status, knowledge-capture fields,
timestamps. Performance still joins on ad name / aliases.

### Wipe

1. Delete all `ad_library_tags` rows.
2. Delete / replace all `ad_tags` rows (no legacy HECM / Rates / etc.
   left selectable).

### New `ad_tags` shape

| Field | Role |
|-------|------|
| `product` | `dscr` · `reverse` · (`broad_forward` reserved) |
| `category` | Product-defined category key (see seeds below) |
| `slug` | Selectable tag within that category |
| `label` | Human label |
| `sort_order` | Picker order |
| `is_active` | Soft-hide from pickers |

**Uniqueness:** prefer unique `(product, category, slug)`. Junction
should reference tag **`id`** (not global slug alone) so DSCR and RM can
both own a `cash-out` topic without collision. Migrate
`ad_library_tags` from `tag_slug` → `tag_id` (or equivalent) in the
same ship. API responses still expose `{ id, slug, label, category,
product }` for UI and clusters.

**Guards**

- Attach only tags whose `product` matches the ad’s `product`.
- Changing product strips mismatched tags.
- Creating a catalog tag requires `product` + `category` + label/slug.

## Upload / edit UI

Under Product (required before tags appear):

- Stack of **closed-by-default dropdowns**, one per category for that
  product.
- Closed row shows a selection summary (e.g. `Bucket · Denied, Idle`).
- Open → multi-select checklist / chips for that category only.
- Empty categories (e.g. Broad Forward, or RM before seed — N/A once
  seeded) show a short empty state inside the dropdown.

Same pattern on edit. Folder rail stays Product → Format; category tags
are **filters inside** the folder as compact dropdowns (not new
folders).

**Smart queue:** **Needs tags** = product set and zero tags — drives
the human re-label pass after wipe.

## Catalog seeds

### DSCR (`product = dscr`)

Source: Wm-os `dscr-creative-taxonomy.md` labeling cheat sheet +
modifiers.

| Category | Tags |
|----------|------|
| `bucket` | `denied` · `deadline` · `idle` · `in-market` |
| `creative_job` | `reveal` · `exit` · `belief` · `outcome` · `terms` · `authority` |
| `concept` | `nodocs-speed` · `balloon-exit` · `cashout-grow` · `ratecard-centered` · `navy-suburban-headline` · `qualify-stack` · `lo-authority` |
| `angle` | `angle-1-idle-equity` · `angle-2-deadline` · `angle-3-did-you-know` · `angle-4-checklist` · `angle-5-what-you-could-do` · `angle-new` |
| `topic` | `cash-out` · `balloon` · `no-docs` · `rates` · `llc` · `str` · `foreign-national` · `write-offs` · `property-count` · `free-and-clear` |

### Reverse (`product = reverse`)

Source: Wm-os `rm-creative-taxonomy.md` §1–§7 + `ad-name-library.yaml`
RM concepts + proposed gaps.

| Category | Tags |
|----------|------|
| `track` | `hecm` · `second` |
| `strategy` | `outcome-led` · `myth-led` |
| `outcome` | `payment-gone` · `cash-out` · `standby-line` · `multi` |
| `stage` | `tof` · `mof` · `bof` |
| `equity_callout` | `none` · `soft` · `hard` |
| `concept` | `equity-trap` · `inflation-hedge` · `breaking-news` · `strategic-options` · `named-proof` · `comment-reply` · `myth-scary` · `keep-rate` · `grandkids-visit` · `legacy-planner` · `payment-gone` · `standby-line` · `heirs-protected` · `lo-authority` · `second-not-reverse` |
| `trigger` | `widow` · `inflation` · `healthcare` · `burden` · `heirs` · `living-legacy` · `stay-in-home` · `surviving-vs-living` · `payment-stress` · `long-runway` |

**Not seeded for RM:** persona, archetype, Veteran (deprecated),
education-as-category, testimonials-as-category (format only).

### Broad Forward

No category seed in v1. Product folder remains; tagging panel empty /
“coming soon.”

## Analytics & Creative Command integration

### What stays safe after wipe

Creative Command and Ad Performance load via
`media-buyer-window.ts` → library + aliases + tags →
`ad-performance.ts` / `ad-creative-intel.ts`. Funnel math joins on **ad
name / aliases**, not tags. Wipe does **not** break spend, CPL, CPQL,
CPConv, fatigue diagnoses, or product rollups.

### What goes quiet until re-label

- Flat topic filters and concept-strip chips
- Creative Command **tag** clusters (`buildClusters` over
  `library.tags`)

Format clusters and product lenses keep working.

### Same-ship code updates (required)

| Surface | Change |
|---------|--------|
| `ad_tags` + `ad-tags-db` / `ad-tags` types | `product` + `category`; list filtered by product; create requires both |
| Junction | Prefer `tag_id`; resolve refs with category for UI |
| `AdTagPicker` | Replace flat chip wall with product-scoped category dropdowns |
| Ad Library filters | Category dropdown filters (not one flat tag list) |
| Ad Performance filters + concept strip | Same category-aware filters; chips show category context |
| Creative Command `ClusterPanel` / `buildClusters` | Cluster by category within product (at least Concept, Topic/Trigger, Bucket/Track/Strategy — do not dump every category into one “Topic” pile) |
| `/api/ad-tags`, `/api/ad-library`, intelligence `?tag=` | Product match on attach; payloads include `product` + `category` |

**Done when:** save in Ad Library → tags appear on performance rows →
Creative Command can cluster DSCR and RM by the new categories; empty
states when untagged (not broken errors).

### Reporting semantics

Multi-select allowed everywhere. Filters: OR within a category, AND
across categories (unless UI offers an explicit mode later). Membership
is “has tag,” not a single enum.

## Migration steps

1. Optional backup of `ad_tags` / `ad_library_tags`.
2. Schema migration: add `product` + `category`; switch junction to
   `tag_id` if adopting id-based FKs; drop global-only slug uniqueness
   that blocks cross-product reuse.
3. Delete all junction rows; delete old catalog rows.
4. Seed DSCR + Reverse catalogs from the tables above.
5. Deploy UI + API + Creative Command / Ad Performance filter updates
   in the same release.
6. Media Buyer re-labels via **Needs tags** queue; keep summary /
   visual notes as reference while tagging.

## OS / agent alignment (after build)

- Update Wm-os ad-naming skill + ad-intelligence bridge: stop suggesting
  legacy flat tags; tags come from product × category catalog.
- DSCR / RM taxonomy docs remain SOT for *which values exist*; Mr. Waiz
  is the live catalog.
- Do not invent Broad Forward tags in this pass.

## Example labeled ads

```text
DSCR
  product: dscr
  bucket: [denied]
  creative_job: [reveal]
  concept: [nodocs-speed]
  angle: [angle-3-did-you-know]
  topic: [no-docs, write-offs]

RM
  product: reverse
  track: [hecm]
  strategy: [myth-led]
  outcome: [cash-out]
  stage: [tof]
  equity_callout: [soft]
  concept: [myth-scary]
  trigger: [burden, widow]
```

## Testing

- Wipe leaves ad rows / Drive / summary intact; tag counts = 0.
- Create DSCR ad: only DSCR categories/tags selectable; save round-trips.
- Create RM ad: only RM categories/tags selectable; save round-trips.
- Change product clears wrong-product tags.
- Ad Performance: product filter works with zero tags; category filter
  works after re-label.
- Creative Command: product lenses + format clusters with zero tags;
  tag clusters populate after re-label by category.
- API rejects cross-product tag attach.
- Slug `cash-out` can exist on both products without collision.

## Open questions (resolved in brainstorm)

| Question | Decision |
|----------|----------|
| Taxonomy vs topic tags | Both — category catalogs cover taxonomy dims + topic/trigger |
| Wipe depth | Full catalog rebuild; keep ads + descriptions + links |
| RM timing | Seed RM in same ship as DSCR (product-specific categories) |
| Select mode | Multi-select all categories |
| UI | Category dropdowns, not open chip walls |
| Storage | Tags (not ad_name, not enum columns on library) |

## Related

- Folder navigation (unchanged axis): `2026-08-20-ad-library-folder-navigation-design.md`
- Wm-os DSCR taxonomy / RM taxonomy / ad naming / ad intelligence bridge
  (paths in frontmatter)
