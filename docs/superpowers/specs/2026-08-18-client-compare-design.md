---
title: Client Compare — Design
status: draft
last_updated: 2026-08-18
artifact_type: design
related_docs:
  - docs/KPIS.md
  - docs/CLIENT_OFFER_TYPES.md
  - src/lib/metrics.ts
  - src/lib/client-health.ts
  - src/components/ClientHealthDashboard.tsx
---

# Client Compare — Design

## Purpose

Give operators one page to see **where each fulfillment client stands
relative to peers** on the KPIs that drive unit economics and conversion
quality.

Client Success remains the 911 list (tiers, Act now, drill-down).
Client Compare is the peer wall: an efficiency map plus ranked bars.
It does not invent formulas. It re-reads `calculateMetrics` and the
existing Client Success grade bands.

## Non-goals (v1)

- Replacing or restyling Client Success
- New KPI formulas, bands, or a second grader
- Per-client trend lines as the primary view (hover can show the number
  only; workspace keeps history)
- Tables of every Client Success KPI (Lead→Qualified, Close Rate, CPA)
- Acquisition (setter/closer) KPIs
- Real-time refresh under 45s
- Client-facing / shared-report access to the whole book
- Matured grading windows as the default (that stays on Client Success)

## Success criteria

- An operator can open **Client Compare**, leave the default last-30-days
  window, and in a few seconds see who is cheap-and-converting vs
  expensive-and-dead on the map.
- Switching offer (Reverse / DSCR / Call Center) or adding/removing
  clients updates the map and every bar without a full page reload.
- Reverse and DSCR can sit on the same cost charts. Call Center never
  shows a $0 CPL / CPConv bar.
- Bar height is the number, bar color is the global grade, dashed line is
  the median of the **currently visible** set.
- Clicking a point or bar opens that client's Workspace KPIs with the
  **same date range**.

## Audience and entry

| Item | Value |
|------|--------|
| Nav | **Client Compare**, group Clients, directly after Client Success |
| View key | `client_compare` |
| URL | `/dashboard?view=client_compare` |
| Permission | Same as `client_health` (staff who can see the book). Not shown to a client user scoped to one account. |
| Default roster | Lifecycle-active clients (not churned, not billing-paused). Zero events in range still appear as `—`; the operator removes them. This is not Client Success `has_activity` hide. |
| Chrome | Existing dashboard shell (dark navy, tabular numbers, existing tier colors). Not a separate brand island. |

URL state in v1: `start`, `end`, `offer`, `clients` (comma-separated
ids). Refresh and copy-link restore the same wall.

## Controls

### Date

Presets: Last 7 / 30 / 60 / 90 / Custom.
Default: **last 30 calendar days** (inclusive, call-center timezone),
not the Client Success matured window.

When the selected window is 14 days or shorter, show one line under the
control: Show Rate and CPConv can look worse because appointments in
the window may not have happened yet. Do not block the view.

### Offer

Select: All / Reverse / DSCR / Call Center (`reporting_type`).
Optional. Changing offer **resets** the picker to every default-roster
client in that product (All = full default roster). After that, add or
remove is manual until the offer changes again.

### Clients

Token picker with name search. Add or remove anyone, including a client
from another product after the offer was set. Mixing Reverse + DSCR on
cost charts is allowed. Paused / churned clients stay out of the default
roster but can be added by search (one extra fetch for that id).

Count line: `12 clients · 9 with spend`.

Empty picker: do not render blank axes. Prompt: “Add a client or pick
an offer.”

## Layout

1. Top bar: date, offer, client picker, pending-window caveat.
2. Hero: efficiency map (one card, two modes).
3. Ranked bar wall: one chart per KPI, 2×4 on desktop, stacked on
   narrow screens.
4. No summary table in v1.

Click target for map points and bars:
`/dashboard?view=client_workspace&tab=kpis&client=<id>` plus the same
`start` / `end`.

## Efficiency map

Two modes on the same card: **Cost map** | **Rate map**.

### Cost map (default when anyone in the set has spend)

- Population: selected clients with numeric CPConv **and** numeric
  hand-raise (paid-ads with spend and at least one unique
  conversation). Call Center omitted.
- X: CPConv, cheap on the left (lower is better).
- Y: Hand-raise rate, high is up.
- Bubble size: Unique Conversations, with a minimum radius so small
  books stay clickable.
- If the visible set has nobody eligible, auto-switch to Rate map.

### Rate map

- Population: selected clients with both a numeric hand-raise and a
  numeric Show Rate (including Call Center). Missing rates stay on
  the bars only.
- X: Hand-raise rate.
- Y: Show Rate.
- Bubble size: Unique Conversations, same minimum radius.
- If the set is paid-ads only, Rate map is still available via toggle
  but Cost map is the default.

### Shared map rules

- Point color: north-star grade — CPConv band for paid ads, worse of
  Hand-raise / Show Rate for Call Center (same rule as Client Success
  Overview).
- Crosshairs: median X and median Y of **eligible, non-hollow** points
  currently on that map (not the full book, not hidden clients).
- Volume floor: reuse `KPI_MIN_DENOMINATOR` from `client-health.ts`.
  Below-floor points are hollow/dimmed, still hoverable, **excluded**
  from median and from driving color.
- Hover: name, product, spend, CPL, CPQL, CPConv, hand-raise, Show
  Rate, leads, unique conversations.
- Legend on the card: grade colors, median crosshair, bubble =
  conversations.

## Ranked bars

| Chart | Paid ads (RM / DSCR) | Call Center |
|-------|----------------------|-------------|
| Total Spend | Yes | Omit |
| CPL | Yes | Omit |
| CPQL | Yes | Omit |
| CPConv | Yes | Omit |
| Hand-raise | Yes (÷ qualified) | Yes (÷ total leads) |
| Show Rate | Yes | Yes |
| Leads | Yes | Yes |
| Unique Conversations | Yes | Yes (and **Booked** as the extra Call Center volume bar when the set is CC-only; when mixed, Booked is tooltip-only so the wall stays 8 charts) |

When the visible set is Call Center only, hide the four cost charts.
When mixed, cost charts caption: “Call Center accounts excluded.”
Call Center is **omitted**, never plotted as $0.

Sort each chart **worst → best** for that metric (high cost and low
rate first) so the problem is at the start of the axis.

Each chart: title, existing KPI formula tooltip, dashed median of the
bars actually drawn (same visible-set / non-hollow rule as the map),
median value labeled.

Bar color: that KPI’s grade against **global** `DEFAULT_KPI_BANDS`
(not per-client Client Success overrides). Overrides would make green
mean different dollars on adjacent bars. Tooltip may note “this
account has a custom Client Success CPL bar” when one exists.

## KPI definitions (no new math)

Source of truth remains [docs/KPIS.md](../../KPIS.md).

| KPI | Formula | Null vs zero |
|-----|---------|--------------|
| Total Spend | `SUM(ad spend)` in range | `$0` if the client is paid-ads and spend loaded as 0. `—` if spend is missing / Call Center. |
| CPL | Spend ÷ Total Leads | `—` if 0 leads or spend null. Never `$0` CPL from a 0 denominator. |
| CPQL | Spend ÷ Qualified Leads | `—` if 0 qualified or spend null. |
| CPConv | Spend ÷ unique leads with show ∪ claimed ∪ live_transfer | `—` if 0 conversations or spend null. Use `cp_conversation` from `metrics.ts`, not shows-only CPS. |
| Hand-raise (paid ads) | Unique booked ∪ claimed ∪ LT ÷ Qualified × 100 | `—` if 0 qualified. |
| Hand-raise (Call Center) | Same numerator ÷ Total Leads × 100 | `—` if 0 leads. Matches Client Success HE layout. |
| Show Rate | Unique (booked ∩ show∪claimed∪LT) ÷ unique booked × 100 | `—` if 0 unique booked. |
| Leads | Count of `lead` events | `0` is a real number. |
| Unique Conversations | Unique leads with show ∪ claimed ∪ LT | `0` is a real number. |

`calculateMetrics` currently returns `0` for some rates/costs when the
denominator is 0. The compare layer **must** turn those into `null`
before charting so they render as `—` and drop off cost charts.

## Data flow

```
Date range  →  GET /api/client-compare?start=&end=
            →  one row per default-roster client
            →  UI filters by offer + picker (no refetch)
            →  UI medians from the visible set
```

Payload per row: `id`, `name`, `reporting_type`, spend, leads,
qualified, unique conversations, unique booked, booked count, CPL,
CPQL, CPConv, hand-raise, Show Rate, grade per KPI, north-star grade,
`has_custom_cpl_benchmark`, `spend_missing`.

Compute: same event + spend pull as Client Workspace / Client Success
for the **calendar** window. Grade with existing band helpers and
**global** defaults. Do not use the matured 30d cutoff.

Offer changes are client-side. Adding a paused/churned client is the
only extra request (`GET /api/client-compare?start=&end=&ids=`).

Cache ~45s like other command dashboards. One server pass, not N
browser calls. Same event-row cap as Client Success.

On API failure: keep last cached payload if present; otherwise inline
error + retry. Never invent numbers.

## Architecture (code)

| Piece | Role |
|-------|------|
| `src/lib/nav.ts` | Add `client_compare` view + Clients nav item |
| `src/lib/permissions.ts` | Grant anywhere `client_health` is granted |
| `src/lib/client-compare.ts` | Pure helpers: null-vs-zero, chart membership, visible medians, cost vs rate map points, offer-reset roster |
| `src/app/api/client-compare/route.ts` | Date-range snapshot for the roster |
| `src/components/ClientCompareDashboard.tsx` | Page: controls, map, bar wall |
| `src/components/DashboardView.tsx` | Mount the view |

Reuse: `calculateMetrics`, `DEFAULT_KPI_BANDS`, `KPI_MIN_DENOMINATOR`,
`usesCallCenterKpiLayout`, existing KPI tooltips, Recharts already in
the app. Do not copy threshold numbers into the UI.

## Error and empty states

- Empty picker → prompt, no axes.
- Range with zero events → rows listed, metrics `—`, grades
  insufficient.
- Paid-ads spend missing → cost KPIs `—`, dropped from Cost map,
  still on Rate map and volume/rate bars.
- Divide-by-zero → `—`, never `$0` CPL/CPQL/CPConv.
- Call Center on cost charts → omit.
- Window ≤14 days → caveat line, still render.
- Mixed set on cost charts → caption, CC omitted.
- API error → cache or retry, no placeholder KPIs.

## Tests

Unit tests against `src/lib/client-compare.ts` (not page chrome):

- Call Center rows never receive spend / CPL / CPQL / CPConv.
- Cost map only includes numeric CPConv; Rate map requires both
  numeric hand-raise and Show Rate.
- Median uses the visible picker set and ignores hollow / low-volume
  points.
- `$0` spend with leads is plotted; `null` spend is omitted.
- `calculateMetrics` 0-from-empty-denominator becomes `null`.
- Offer reset replaces the roster; adding another product after that
  is allowed.
- Grades call existing band helpers with global defaults only.
- Mixed-set cost charts exclude Call Center; CC-only hides cost
  charts.

Do not re-test `calculateMetrics` formulas here.

## Decisions

| Topic | Decision |
|-------|----------|
| Grouping | Product line (RM / DSCR / Call Center), as a **filter**, not three stacked pages |
| Mix | Allowed on one wall |
| Home | New view, not a Client Success mode |
| Dates | Operator picks; default last 30 calendar days |
| Judgment | Number = height; global band = color; visible median = tick |
| KPI set | Spend, CPL, CPQL, CPConv, Hand-raise, Show Rate, Leads, Unique Conversations |
| Visual | Efficiency map + ranked bars |
| Picker | Offer resets roster; then add/remove any client |
