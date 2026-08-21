---
title: Ad Library folder navigation
status: implemented
last_updated: 2026-08-20
artifact_type: design
related_docs:
  - docs/AD-INTELLIGENCE.md
  - docs/superpowers/specs/2026-08-19-ready-to-test-creatives-design.md
  - src/components/MediaBuyer.tsx
  - src/lib/ad-library-folders.ts
  - src/components/ad-library/
---

# Ad Library folder navigation

Date: 2026-08-20
Status: Implemented

## Problem

The Ad Library was a flat filterable card grid. Media buyers already
classify ads with `product`, `ad_format`, topic tags, `status`, and
`ready_to_test`, but the UI only exposed those as dropdowns. Finding a
family of creatives required scanning the whole pile or inventing
order in `ad_name` (TOF_/MOF_ prefixes).

## Goal

Browse the library like folders: jump Product → Format in two clicks,
keep workflow queues (Ready to test, Winners) one click away, and keep
topic tags as facets inside a folder (not exclusive folders).

## Non-goals (v1)

- Schema / migration changes
- Funnel-stage folders (TOF/MOF/BOF) — not in the data model
- Acquisition Ad Library twin
- Drag-and-drop move between folders
- Changes to Creative Command or Ad Performance tabs

## Decision

**Hybrid layout:** left folder rail + main pane with breadcrumb,
topic chips, search, and cards.

**Folder rule:** single-value fields only.

| Axis | Role |
|------|------|
| Smart folders | All · Ready to test · Winners · Needs classification |
| Product | RM · DSCR · Broad Forward · Unassigned |
| Format (under product) | Live `ad_formats` catalog + Unassigned |
| Topic tags | Chip filter inside the selected folder (M2M) |

When the selection is a product root (or All), the main pane groups
cards under format section headers. When a format child is selected,
the grid is flat within that folder.

## Data

No new columns. Tree counts derive client-side from `GET /api/ad-library`
rows plus the format catalog.

`FolderPath`:

```ts
| { kind: "smart"; id: "all" | "ready" | "winners" | "needs" }
| { kind: "product"; product: ProductKey | "unassigned"; format?: string | "unassigned" }
```

Last selected path persists in `localStorage`
(`ad-library-folder-path-v1`).

## UI

- Left rail (~220px); on small screens, a “Browse folders” disclosure
- Breadcrumb: Library / RM / UGC
- Topic + search remain in the main pane toolbar
- + Add Ad prefills `product` / `ad_format` from the selected folder
- Card footers: Open + Edit primary; secondary actions in an overflow menu
- Deep links (`libraryNav.readyToTest`, `libraryId`) select the matching
  smart or product/format folder and scroll/highlight as before

## Files

| Path | Role |
|------|------|
| `src/lib/ad-library-folders.ts` | Path types, match, counts, labels |
| `src/components/ad-library/FolderRail.tsx` | Tree UI |
| `src/components/ad-library/LibraryBreadcrumb.tsx` | Path crumbs |
| `src/components/ad-library/CardActionsMenu.tsx` | Overflow actions |
| `src/components/MediaBuyer.tsx` | AdLibrary wiring |
