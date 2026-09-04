---
title: Client Roster Media View & Filter Toolbar — Implementation Plan
status: ready
last_updated: 2026-09-04
artifact_type: plan
related_docs:
  - docs/superpowers/specs/2026-09-04-client-roster-media-view-design.md
---

# Client Roster Media View & Filter Toolbar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Media Buying a glance column set (Drive, states, page, TZ,
product, ad spend, ads) and clean up the roster filter toolbar into a hybrid
primary row + collapsible secondary Filters panel.

**Architecture:** Extend existing `RosterView` / `VIEW_COLUMNS` /
`COLUMN_DEFS` in `ClientRoster.tsx`. Add two fields to
`GET /api/clients?detail=1`. Extract small pure helpers for licensed-state
compaction and secondary-filter counting so they can be unit-tested without
mounting the roster UI.

**Tech Stack:** Next.js App Router, React client component, Supabase select
string, `node:test` via `tsx --test`, existing `formatStatesLicensed` /
`timezoneLabel` helpers.

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/roster-media-view.ts` | Pure helpers: compact state codes, secondary filter count |
| `src/lib/roster-media-view.test.ts` | Unit tests for those helpers |
| `src/app/api/clients/route.ts` | Add `drive_folder_url`, `facebook_page_name` to `DETAIL_FIELDS` |
| `src/components/ClientRoster.tsx` | Media columns + hybrid filter toolbar |

No schema migration. Fields already exist on `clients`.

---

### Task 1: Pure helpers + tests

**Files:**
- Create: `src/lib/roster-media-view.ts`
- Create: `src/lib/roster-media-view.test.ts`
- Modify: `package.json` (add test path to `"test"` script)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/roster-media-view.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  compactLicensedStates,
  countSecondaryRosterFilters,
} from './roster-media-view';

describe('compactLicensedStates', () => {
  it('returns empty display for null/empty', () => {
    assert.deepEqual(compactLicensedStates(null), { text: '—', title: undefined, muted: true });
    assert.deepEqual(compactLicensedStates([]), { text: '—', title: undefined, muted: true });
  });

  it('joins codes under the cap', () => {
    const r = compactLicensedStates(['CA', 'TX', 'FL'], 4);
    assert.equal(r.text, 'CA · TX · FL');
    assert.equal(r.title, 'CA, TX, FL');
    assert.equal(r.muted, false);
  });

  it('caps display and shows +N', () => {
    const r = compactLicensedStates(['CA', 'TX', 'FL', 'NY', 'WA', 'OR'], 4);
    assert.equal(r.text, 'CA · TX · FL · NY +2');
    assert.equal(r.title, 'CA, TX, FL, NY, WA, OR');
  });
});

describe('countSecondaryRosterFilters', () => {
  it('counts only non-all secondary filters', () => {
    assert.equal(
      countSecondaryRosterFilters({ offer: 'all', package: 'all', ads: 'all' }),
      0,
    );
    assert.equal(
      countSecondaryRosterFilters({ offer: 'dscr', package: 'all', ads: 'paused' }),
      2,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test src/lib/roster-media-view.test.ts
```

Expected: FAIL (module not found / exports missing).

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/roster-media-view.ts
import { formatStatesLicensed } from '@/lib/us-states';

export function compactLicensedStates(
  codes: string[] | null | undefined,
  maxVisible = 4,
): { text: string; title: string | undefined; muted: boolean } {
  if (!codes?.length) return { text: '—', title: undefined, muted: true };
  const title = formatStatesLicensed(codes);
  if (codes.length <= maxVisible) {
    return { text: codes.join(' · '), title, muted: false };
  }
  const shown = codes.slice(0, maxVisible);
  const extra = codes.length - maxVisible;
  return {
    text: `${shown.join(' · ')} +${extra}`,
    title,
    muted: false,
  };
}

export function countSecondaryRosterFilters(filters: {
  offer: string;
  package: string;
  ads: string;
}): number {
  let n = 0;
  if (filters.offer !== 'all') n += 1;
  if (filters.package !== 'all') n += 1;
  if (filters.ads !== 'all') n += 1;
  return n;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run:

```bash
npx --yes tsx --test src/lib/roster-media-view.test.ts
```

Expected: PASS (all tests).

- [ ] **Step 5: Add to package.json test script**

Append `src/lib/roster-media-view.test.ts` to the `"test"` script array in
`package.json` (same pattern as other `src/lib/*.test.ts` entries).

- [ ] **Step 6: Commit**

```bash
git add src/lib/roster-media-view.ts src/lib/roster-media-view.test.ts package.json
git commit -m "$(cat <<'EOF'
Add roster media-view helpers for states and filter counts.

EOF
)"
```

---

### Task 2: Detail list API fields

**Files:**
- Modify: `src/app/api/clients/route.ts` (line ~16–17, `DETAIL_FIELDS`)

- [ ] **Step 1: Extend DETAIL_FIELDS**

In `src/app/api/clients/route.ts`, update the `DETAIL_FIELDS` string to include
`drive_folder_url` and `facebook_page_name` (after `timezone` is fine):

```ts
const DETAIL_FIELDS =
  'id, name, is_live, reporting_type, service_program, sales_package, offer, share_token, created_at, lifecycle_status, mrr, daily_adspend, ads_paused, ads_paused_at, ads_paused_note, billing_type, billing_day, launch_date, date_signed, churned_at, contract_term_months, contract_end_date, performance_terms, email, billing_email, primary_contact, primary_contact_name, states_licensed, timezone, drive_folder_url, facebook_page_name, kpi_benchmarks, kpi_benchmarks_updated_at, kpi_benchmarks_updated_by, kpi_benchmarks_note, clickup_task_id, ghl_location_id, account_group_id, engagement_kind';
```

Do **not** change the non-detail (`?detail` absent) lightweight select.

- [ ] **Step 2: Sanity-check string**

Run:

```bash
node -e "const s=require('fs').readFileSync('src/app/api/clients/route.ts','utf8'); const m=s.match(/const DETAIL_FIELDS =\n  '([^']+)'/); if(!m) throw new Error('no match'); for (const k of ['drive_folder_url','facebook_page_name','states_licensed','timezone']) { if(!m[1].includes(k)) throw new Error('missing '+k); } console.log('ok');"
```

Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/route.ts
git commit -m "$(cat <<'EOF'
Include Drive folder and Facebook page on roster detail clients.

EOF
)"
```

---

### Task 3: Media Buying columns in ClientRoster

**Files:**
- Modify: `src/components/ClientRoster.tsx`

- [ ] **Step 1: Extend Client type**

Add to the `Client` type (~line 52):

```ts
  drive_folder_url?: string | null;
  facebook_page_name?: string | null;
```

(`states_licensed` and `timezone` already exist.)

- [ ] **Step 2: Extend ColumnKey + VIEW_COLUMNS + imports**

Replace:

```ts
type ColumnKey = "stage" | "tenure" | "adspend" | "ads" | "launch" | "cs_call";
```

With:

```ts
type ColumnKey =
  | "stage"
  | "tenure"
  | "adspend"
  | "ads"
  | "launch"
  | "cs_call"
  | "drive"
  | "states"
  | "page"
  | "tz"
  | "product";
```

Update Media preset only:

```ts
const VIEW_COLUMNS: Record<RosterView, ColumnKey[]> = {
  full: ["stage", "tenure", "cs_call", "adspend"],
  cs: ["stage", "tenure", "cs_call"],
  media: ["drive", "states", "page", "tz", "product", "adspend", "ads"],
};
```

Add imports:

```ts
import { compactLicensedStates } from "@/lib/roster-media-view";
import { timezoneLabel } from "@/lib/us-timezones";
```

(`ReportingTypeBadge` / `SalesPackageBadge` are already imported.)

- [ ] **Step 3: Add COLUMN_DEFS entries**

Add these to `COLUMN_DEFS` (ads stays as placeholder; ClientRow still special-cases
it). Drive is also special-cased in ClientRow for click isolation — define a
simple placeholder render for header/type completeness:

```ts
  drive: {
    header: "Drive",
    render: () => null, // ClientRow renders the link
  },
  states: {
    header: "States",
    render: c => {
      const r = compactLicensedStates(c.states_licensed);
      return (
        <span
          className="text-xs whitespace-nowrap"
          style={{ color: r.muted ? "#334155" : "#cbd5e1" }}
          title={r.title}
        >
          {r.text}
        </span>
      );
    },
  },
  page: {
    header: "Page",
    render: c => {
      const name = c.facebook_page_name?.trim();
      if (!name) {
        return <span className="text-xs" style={{ color: "#334155" }}>—</span>;
      }
      return (
        <span
          className="text-xs truncate max-w-[10rem] inline-block align-bottom"
          style={{ color: "#cbd5e1" }}
          title={name}
        >
          {name}
        </span>
      );
    },
  },
  tz: {
    header: "TZ",
    render: c => {
      const label = timezoneLabel(c.timezone);
      const muted = !c.timezone;
      return (
        <span
          className="text-xs whitespace-nowrap"
          style={{ color: muted ? "#334155" : "#cbd5e1" }}
          title={c.timezone ?? undefined}
        >
          {label}
        </span>
      );
    },
  },
  product: {
    header: "Product",
    render: c => (
      <span className="flex items-center gap-1.5 min-w-0">
        <ReportingTypeBadge value={c.reporting_type} />
        <SalesPackageBadge value={c.sales_package} />
      </span>
    ),
  },
```

- [ ] **Step 4: Special-case Drive in ClientRow**

Where columns map cells (~1408), mirror the `ads` special case:

```tsx
{columns.map(key => (
  <td key={key} className={cell}>
    {key === "ads" ? (
      <AdsPausedControl
        clientId={c.id}
        adsPaused={!!c.ads_paused}
        adsPausedNote={c.ads_paused_note}
        variant="row"
        disabled={busy}
        onUpdated={next => onAdsUpdated(c.id, next)}
      />
    ) : key === "drive" ? (
      c.drive_folder_url ? (
        <a
          href={c.drive_folder_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          className="text-xs font-medium whitespace-nowrap"
          style={{ color: "#38bdf8" }}
          title="Open Drive folder"
        >
          Drive ↗
        </a>
      ) : (
        <span className="text-xs" style={{ color: "#334155" }}>—</span>
      )
    ) : (
      COLUMN_DEFS[key].render(c)
    )}
  </td>
))}
```

Keep Full / CS `VIEW_COLUMNS` exactly as they are today.

- [ ] **Step 5: Manual smoke (local)**

1. Open Client Roster → switch to **Media Buying**.
2. Confirm headers: Drive, States, Page, TZ, Product, Ad spend, Ads
   (Ad spend only if revenue-visible).
3. Confirm Full / CS views still show prior columns.
4. Click a Drive link → new tab; row does not open Client File.

- [ ] **Step 6: Commit**

```bash
git add src/components/ClientRoster.tsx
git commit -m "$(cat <<'EOF'
Swap Media Buying roster columns for buyer glance fields.

EOF
)"
```

---

### Task 4: Hybrid filter toolbar

**Files:**
- Modify: `src/components/ClientRoster.tsx`
- Uses: `countSecondaryRosterFilters` from `@/lib/roster-media-view`

- [ ] **Step 1: Add Filters open state**

Near `rosterView` state:

```ts
const [filtersOpen, setFiltersOpen] = useState(() => {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("rosterFiltersOpen") === "1";
});

function changeFiltersOpen(open: boolean) {
  setFiltersOpen(open);
  window.localStorage.setItem("rosterFiltersOpen", open ? "1" : "0");
}

const secondaryFilterCount = countSecondaryRosterFilters({
  offer: offerFilter,
  package: packageFilter,
  ads: adsFilter,
});
```

- [ ] **Step 2: Restructure sticky filter markup**

Replace the single wrapping `flex flex-wrap` that currently mixes Search,
Status, Vertical, Package, Ads, and View (~lines 874–1035) with:

**Primary row (always visible):**
1. Search (unchanged)
2. Status chips — wrap in a labeled group with
   `text-[10px] uppercase tracking-wider` label `Status`
3. View segmented control — same label pattern (`View`)
4. Filters toggle button:

```tsx
<button
  type="button"
  onClick={() => changeFiltersOpen(!filtersOpen)}
  className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap flex items-center gap-1.5"
  style={{
    color: secondaryFilterCount > 0 || filtersOpen ? "#93c5fd" : "#64748b",
    background: filtersOpen ? "rgba(59,130,246,0.12)" : "transparent",
    border: `1px solid ${
      secondaryFilterCount > 0 || filtersOpen
        ? "rgba(59,130,246,0.45)"
        : "rgba(255,255,255,0.12)"
    }`,
  }}
  aria-expanded={filtersOpen}
>
  Filters
  {secondaryFilterCount > 0 && (
    <span
      className="text-[10px] font-semibold px-1.5 rounded-full"
      style={{ background: "#2563eb", color: "#fff" }}
    >
      {secondaryFilterCount}
    </span>
  )}
  <span aria-hidden>{filtersOpen ? "▴" : "▾"}</span>
</button>
```

**Secondary panel (when `filtersOpen`):**
Below the primary row, render a bordered panel with three labeled groups —
Vertical, Package, Ads — moving the **existing** button maps into those
groups. Keep filter state setters and counts identical (no logic change).

Add Clear when `secondaryFilterCount > 0`:

```tsx
<button
  type="button"
  onClick={() => {
    setOfferFilter("all");
    setPackageFilter("all");
    setAdsFilter("all");
  }}
  className="text-xs font-medium px-2 py-1 rounded-lg"
  style={{ color: "#94a3b8" }}
>
  Clear filters
</button>
```

**Chip consistency:** Status / Vertical / Package / Ads inactive chips use the
same base style already used by Status. Vertical may keep its reporting-type
accent color when active (existing behavior).

- [ ] **Step 3: Manual smoke**

1. Default visit with cleared localStorage → Filters panel closed.
2. Open Filters → Vertical / Package / Ads appear with labels.
3. Select DSCR + Ads paused → badge shows `2` even after collapsing.
4. Clear filters → badge gone; all secondary back to All.
5. Reload → open/closed preference restored from `rosterFiltersOpen`.
6. Search / Status / View still work; match count line unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/components/ClientRoster.tsx
git commit -m "$(cat <<'EOF'
Collapse roster secondary filters into a labeled Filters panel.

EOF
)"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run unit tests**

```bash
npx --yes tsx --test src/lib/roster-media-view.test.ts
```

Expected: PASS

- [ ] **Step 2: Spec checklist**

Confirm against
`docs/superpowers/specs/2026-09-04-client-roster-media-view-design.md`:

- [ ] Media columns: Drive · States · Page · TZ · Product · Ad spend · Ads
- [ ] Full / CS columns unchanged
- [ ] Drive new-tab + no Client File open
- [ ] Hybrid toolbar: Search · Status · View always; Filters collapses
  Vertical · Package · Ads
- [ ] Active count badge + Clear + localStorage default closed
- [ ] Detail API includes `drive_folder_url` + `facebook_page_name`
- [ ] No CS column changes / no role auto-default / no schema migration

- [ ] **Step 3: No further commit unless verification edits were needed**

If only docs/comments changed during verify, commit those separately with a
fix message. Otherwise stop here.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Media glance columns | Task 3 |
| Drop Launch/Tenure from Media only | Task 3 (`VIEW_COLUMNS.media`) |
| Drive link + stopPropagation | Task 3 Step 4 |
| States compact + tooltip | Task 1 + Task 3 |
| Page / TZ / Product | Task 3 |
| Ad spend revenue-gated | Existing `resolveColumns` (unchanged) |
| Hybrid filter toolbar | Task 4 |
| Filters count badge + Clear + localStorage | Task 4 |
| API detail fields | Task 2 |
| CS / role-default / peek out of scope | Explicitly not tasked |

## Out of scope (do not implement)

- Client Success column changes
- Auto-default view by role
- Expandable rows / side peeks
- New DB columns or onboarding field capture
- Filter *logic* changes beyond layout
