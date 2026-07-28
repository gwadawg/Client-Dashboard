# Call Center Billable Conversations & Claim Watch

Date: 2026-07-28  
Status: Approved for planning  
Surface: Client KPIs → Call Center layout (`HE_KPI_SECTIONS`)  
Metrics: `src/lib/metrics.ts`, `src/lib/kpi-layouts.ts`

## Problem

The Call Center KPI view is appointment-heavy and confusing next to
RM/DSCR. It does not surface what we charge for: conversations **we**
initiate (**live transfers + shows**). Claimed leads are not billable,
but when a client claims **after** we already booked, ops need a count
to spot possible sabotage. Today unique conversations (RM) still treat
claimed as a conversation path, and Call Center does not show a
billable conversation figure at all.

## Goals

1. Show **Unique Appointments Booked** clearly (already `unique /
   total`) alongside a new **Billable Conversations** figure.
2. Define billable as unique leads with `live_transfer` ∪ `show`
   (claimed never counts).
3. Keep a total **Claimed** count and add **Claimed After Booked** as
   a summary card (count only).
4. Limit UI wiring to the **Call Center** layout only.

## Non-goals

- RM/DSCR layout or CPConv / health-grader formula changes
- Click-through dated claim list (lead, book date, claim date, delta)
- Auto-billing / invoicing from billable conversations
- Changing Hand Raise Rate (still booked ∪ claimed ∪ LT)
- Looking outside the selected date range for earliest book/claim

## Decisions locked

| Topic | Decision |
|-------|----------|
| Scope | Call Center (`CALL_CENTER` / HE) KPI layout only |
| Billable | Unique leads with `live_transfer` ∪ `show` |
| Dedup | One lead once even if both LT and show |
| Claimed (all) | Keep existing Claimed card in Calling Stats |
| Claim watch | Separate **Claimed After Booked** count card |
| Watch rule | Earliest claim after earliest book (strict `>`) |
| Watch UI v1 | Summary count only; dated table later |
| Date window | Compare events already in the selected range |
| Approach | Layout-only cards + metrics fields (no new tables) |

## Metric definitions

| Metric | Definition |
|--------|------------|
| Unique Appointments Booked | Existing: unique leads with `appointment_booked` / total book events |
| Billable Conversations | Unique leads with at least one `live_transfer` or `show` in range |
| Claimed | Existing: count of `claimed` events in range |
| Claimed After Booked | Unique leads where `min(claimed.occurred_at) > min(appointment_booked.occurred_at)` for the same lead key, using events in the selected range only |

Lead identity uses the same key helper as other unique metrics
(`ghl_contact_id` with existing fallbacks). Leads that cannot be keyed
are excluded from unique / billable / after-booked counts.

## UI placement (Call Center layout)

### Appointments section

- Keep **Appointments Booked** as `unique / total`
- Add **Billable Conversations** (accent)
- Add **Live Transfers** (Shows already present) so the billable
  formula is visible without opening Calling Stats
- Footnote add-on: Billable Conversations = unique leads with a live
  transfer or show; claimed is not billable

### Calling Stats section

- Keep **Claimed** (all claims)
- Add **Claimed After Booked** (accent)
- Leave dial metrics and Conversations (2m+) / Total Conversations
  unchanged (setter call quality, not client billing)

No click-through on Claimed After Booked in v1.

## Data & computation

Extend `calculateMetrics` in `src/lib/metrics.ts`:

| Field | Computation |
|-------|-------------|
| `billable_conversations` | `uniqueLeadCountForEvents(events, { live_transfer, show })` |
| `claimed_after_booked` | Per lead key: if both earliest book and earliest claim exist in the filtered event set, and claim time is strictly after book time, count once |

Fields may be computed for all reporting types, but cards are wired
only in `HE_KPI_SECTIONS` via `src/lib/kpi-layouts.ts`.

Docs: short Call Center note in `docs/KPIS.md` (layout / formula
section) so billable ≠ unique conversations (RM).

## Edge cases

| Case | Result |
|------|--------|
| Claim, no book in range | Claimed only; not after-booked |
| Claim before book (same range) | Claimed only; not after-booked |
| Equal book and claim timestamps | Not after-booked (`>` only) |
| LT + show same lead | One billable conversation |
| Missing lead key | Excluded from unique / billable / after-booked |

## Testing

Unit tests in `src/lib/metrics.test.ts`:

- LT-only → billable 1
- Show-only → billable 1
- Both LT and show → billable 1
- Claim before book → claimed_after_booked 0
- Claim after book → claimed_after_booked 1
- Claim only (no book) → claimed_after_booked 0

Manual: Call Center client shows new cards; RM/DSCR client unchanged.

## Follow-ups (out of this project)

1. Dated claim drill-down (lead, earliest book, earliest claim, delta)
2. Align RM Unique Conversations / CPConv with billable (exclude claimed)
  if product later wants one definition company-wide
3. Wire billable conversations into billing / invoicing

## Implementation sketch

1. Add `billable_conversations` and `claimed_after_booked` to
   `MetricsResult` + `calculateMetrics`
2. Unit tests for the cases above
3. Wire Call Center cards + footnotes in `kpi-layouts.ts`
4. Document Call Center billable vs RM unique conversations in
   `docs/KPIS.md`
