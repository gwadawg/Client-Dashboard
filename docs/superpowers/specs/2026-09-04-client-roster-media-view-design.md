---
title: Client Roster Media View & Filter Toolbar — Design
status: approved
last_updated: 2026-09-04
artifact_type: design
related_docs:
  - src/components/ClientRoster.tsx
  - src/app/api/clients/route.ts
  - src/lib/us-states.ts
  - src/lib/us-timezones.ts
---

# Client Roster Media View & Filter Toolbar — Design

## Purpose

Make the Client Roster **Media Buying** view a true at-a-glance ops surface for
media buyers (Drive, licensed states, page, timezone, product, ad spend, ads
on/off), and clean up the sticky filter toolbar so groups are obvious and
secondary filters stay out of the way until needed.

## Success criteria

- On **Media Buying**, a buyer can see Drive, licensed states, Facebook page,
  timezone, product, ad spend, and ads status without opening Client File.
- Drive opens the folder in a new tab and does not open Client File.
- **Full** and **Client Success** column sets are unchanged.
- Filter toolbar uses one chip style, labeled groups, and a collapsible
  **Filters** control for Vertical / Package / Ads with an active-count badge.
- Detail client list API returns `drive_folder_url` and `facebook_page_name`.

## Decisions (from brainstorming)

| Question | Choice |
|----------|--------|
| Interaction model | Keep table; add Media glance columns (no peek/expand row) |
| Media columns | Drive · States · Page · TZ · Product · Ad spend · Ads |
| Dropped from Media | Launch, Tenure (still in Full + Client File) |
| CS view this round | Leave as-is |
| Filter IA | Hybrid: labeled primary row + collapsible secondary Filters |
| Secondary filters | Vertical · Package · Ads |
| Role auto-default | Out of scope |

## Non-goals (v1)

- Changing Client Success columns
- Auto-defaulting roster view by user role/permission
- Expandable rows or side peeks
- New client fields or onboarding capture changes
- Changing filter *logic* (only layout / IA)
- Form submissions tab changes

---

## Architecture

```
ClientRoster
  ├── ViewHub (Clients | Form submissions) — unchanged
  ├── Sticky toolbar
  │     ├── Primary: Search · Status · View (Full | CS | Media)
  │     └── Filters ▾ → Vertical · Package · Ads (+ clear, count badge)
  └── Table
        └── columns = resolveColumns(rosterView, showRevenue)
              Media → drive, states, page, tz, product, adspend, ads
```

Existing `RosterView` / `VIEW_COLUMNS` / `COLUMN_DEFS` pattern stays; Media
preset is swapped and new column keys are added.

---

## Media Buying columns

| Column | Source | Cell behavior |
|--------|--------|----------------|
| Drive | `drive_folder_url` | Icon/link → new tab (`noopener`); “—” if missing |
| States | `states_licensed` | Compact codes; tooltip via `formatStatesLicensed`; cap ~4 + `+N` |
| Page | `facebook_page_name` | Truncate + `title` tooltip; “—” if missing |
| TZ | `timezone` | `timezoneLabel()` (e.g. Eastern (ET)); raw fallback |
| Product | `reporting_type` (+ sales package if present) | Existing badges |
| Ad spend | `daily_adspend` | Existing `$X/day`; still revenue-gated |
| Ads | `ads_paused` | Existing On / Paused control |

Fixed left columns remain: Client · Status · … · row actions.

Drive clicks must `stopPropagation` (or equivalent) so the row does not open
Client File.

---

## Filter toolbar (Hybrid)

### Always visible (labeled)

- **Search** — unchanged behavior
- **Status** — All / Onboarding / Active / Paused / Churned
- **View** — Full / Client Success / Media Buying (segmented control)

### Collapsed under “Filters”

- **Vertical** · **Package** · **Ads**
- Button shows active count when any secondary filter ≠ All (e.g. `Filters 2`)
- Expanded panel: three labeled chip groups, same selected style as Status
- **Clear filters** when count > 0
- Default **closed** on first visit; persist open/closed in `localStorage`
  (same pattern as `rosterView`)

### Consistency rules

- One selected-chip style for all chip groups (filled pill)
- Tiny uppercase group labels so groups do not blend
- No filter-logic changes

---

## Data & API

### `GET /api/clients?detail=1`

Add to `DETAIL_FIELDS`:

- `drive_folder_url`
- `facebook_page_name`

Already returned: `states_licensed`, `timezone`, `reporting_type`,
`sales_package`, `daily_adspend`, `ads_paused` (and related pause fields).

### ClientRoster types / columns

- Extend local `Client` type with the new fields
- Extend `ColumnKey` + `COLUMN_DEFS`
- Set Media `VIEW_COLUMNS` to:
  `["drive", "states", "page", "tz", "product", "adspend", "ads"]`
- Reuse `formatStatesLicensed`, `timezoneLabel`, reporting/sales badges

### Permissions

Unchanged. Ad spend remains revenue-gated via `resolveColumns`. Drive, states,
page, TZ, and product are visible to anyone who can load the roster detail
list.

---

## Edge cases

- Missing Drive / page / states / TZ → muted “—”
- Long page names → truncate + tooltip
- Many licensed states → show ~4 codes + `+N`; full list in tooltip
- Unknown timezone string → `timezoneLabel` raw fallback
- Filters panel closed with active secondary filters → keep count badge

---

## Testing

- Media view shows the new columns; Full / CS columns unchanged
- Drive link opens in a new tab and does not open Client File
- Filters: expand/collapse, count badge, clear secondary, localStorage
  remember open/closed
- Detail list includes `drive_folder_url` and `facebook_page_name`

---

## Implementation notes

Primary touchpoints:

- `src/components/ClientRoster.tsx` — columns + toolbar layout
- `src/app/api/clients/route.ts` — `DETAIL_FIELDS`

No schema migration. Fields already exist on `clients`.
