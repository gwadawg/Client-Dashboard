---
title: Client Log Activity Tab — Design
status: approved
last_updated: 2026-09-01
artifact_type: design
related_docs:
  - docs/superpowers/specs/2026-08-14-client-loan-log-form-design.md
  - docs/superpowers/specs/2026-09-01-client-log-conversion-rollup-design.md
  - src/components/onboarding/brand.tsx
  - src/components/loan-log/LoanLogForm.tsx
---

# Client Log Activity Tab — Design

## Purpose

Give fulfillment clients a **read-only Activity view** on the same token URL as the
client log form (`/forms/loans/<token>`). They can see form-entered proposals,
submissions, fundings, and disqualified leads without accessing the internal
Waiz dashboard.

## Success criteria

- Client opens their link → switches to **Activity** → sees summary counts and a
  scannable table of their form logs for the selected date range.
- Only data they entered through this form appears (not webhooks/GHL backfill).
- Visual design matches existing Waiz client form chrome — cohesive, refined,
  mobile-friendly.
- Log tab behavior is unchanged.

## Decisions (from brainstorming)

| Question | Choice |
|----------|--------|
| Data scope | Form-entered only (`loan_log_form` / `client_log_form`) |
| Navigation | Top tabs: **Log** \| **Activity** |
| Default tab | Log |
| Date range | Default last **30 days**; picker: 7d / 30d / 90d / All |
| Summary cards | Counts only: Proposals, Submitted, Funded, Disqualified |
| Table grain | One row per lead/loan file; latest stage for that file |

## Non-goals (v1)

- Webhook or GHL-sourced rows
- Commission, ROAS, ad spend, or loan volume totals on cards
- Edit, delete, or export
- Login beyond existing token URL
- Separate activity URL

---

## Architecture

```
/forms/loans/[token]
  └── ClientLogShell (tabs)
        ├── Log → LoanLogForm (existing)
        └── Activity → ClientLogActivity
              └── GET /api/forms/loans/[token]/activity?range=
```

Token → `client_id` via `resolveLoanLogToken`. No `client_id` from browser.

---

## Data & API

### Form-only sources

| Data | Source filter |
|------|----------------|
| Submitted / Funded files | `loan_deals` where `source = 'loan_log_form'` |
| Proposals (no deal yet) | `events` `proposal_made` / `proposal_sent` where `raw->>'source' = 'loan_log_form'` and contact has no matching form deal |
| Disqualified | `events` `manual_dq` where `raw->>'source' = 'client_log_form'` |

### Row grain

- **Primary:** one row per `loan_deals` row (Submitted or Funded stage).
- **Proposal-only:** one row per contact with a form proposal event in range and
  no form `loan_deals` row for that contact (orphan proposal).
- **Disqualified:** one row per contact with form `manual_dq` in range (may
  coexist with a deal row for the same name if they logged both).

If a contact later gets a form deal, drop the orphan proposal-only row for that
contact — the deal row is source of truth.

### Date filtering

Filter by **form date** in range:

- Deals: `submitted_at` for submitted; `funded_at ?? submitted_at` for funded
- Events: `occurred_at`

Range param: `7d` | `30d` | `90d` | `all` (default `30d`).

### Summary cards

Count in selected range:

- **Proposals** — unique contacts with form proposal event
- **Submitted** — deals with `stage = submitted` whose `submitted_at` in range,
  plus deals submitted in range that are now funded (count at submission time —
  use submitted_at in range)
- **Funded** — deals with `stage = funded` whose `funded_at` in range
- **Disqualified** — `manual_dq` events in range

### Endpoint

`GET /api/forms/loans/[token]/activity?range=30d`

```typescript
{
  range: { start: string | null, end: string },  // null start for "all"
  summary: {
    proposals: number,
    submitted: number,
    funded: number,
    disqualified: number,
  },
  rows: Array<{
    id: string,
    lead_name: string,
    lead_phone: string | null,
    stage: 'proposal' | 'submitted' | 'funded' | 'disqualified',
    loan_size: number | null,
    transaction_label: string | null,
    occurred_on: string,
    dq_reason: string | null,
  }>,
}
```

Rows sorted `occurred_on` desc, then lead name.

Implementation module: `src/lib/client-log-activity.ts` + tests.

---

## Visual design (Waiz brand)

Use existing tokens from [`src/components/onboarding/brand.tsx`](src/components/onboarding/brand.tsx). **Do not introduce new fonts or colors.**

### Page atmosphere

- Background: `WAIZ.soft` (`#F5F7FB`) — already on form layout
- Content card: `WAIZ.white` with `SHADOW` (`0 18px 50px -22px rgba(6,26,74,.35)`)
- Typography: `FONT_DISPLAY` for page title; `FONT_BODY` for everything else
- Headline: `{Client name} — Client log` with `WaizWordmark` above

### Tab bar

- Segmented control inside the white card, below wordmark
- Two equal segments: **Log** | **Activity**
- Active: `WAIZ.tint` fill, `WAIZ.accent` border, `WAIZ.navy` text, semibold
- Inactive: `WAIZ.soft` fill, `WAIZ.line` border, `WAIZ.muted` text
- Transition: 150ms background/border (CSS only)

### Activity — range picker

- Smaller segmented row below tabs: `7d` · `30d` · `90d` · `All`
- Same chip language as form stage picker (rounded-xl, compact)
- Active range uses accent tint; default **30d** on first load

### Activity — summary cards

- Four cards in a responsive grid (2×2 mobile, 4×1 sm+)
- Each card:
  - White surface, `SHADOW_SM`, 12px radius
  - Top accent strip: 3px gradient `WAIZ.accent700` → `WAIZ.accent` (reuse form energy without purple cliché)
  - Large number: `FONT_DISPLAY`, `WAIZ.navy`, ~28px
  - Label below: 12px uppercase tracking-wide, `WAIZ.muted`
- Optional subtle count animation on range change (opacity fade, not flashy)

### Activity — table

- Contained in same card aesthetic; header row `WAIZ.soft` background
- Columns: **Lead** | **Stage** | **Size** | **Type** | **Date**
- Lead: name semibold `WAIZ.ink`; phone 12px `WAIZ.muted`
- Stage badges (rounded-full px-2.5 py-0.5 text-xs font-semibold):
  - Proposal: `WAIZ.tint2` bg, `WAIZ.royal` text
  - Submitted: `#FFF7ED` bg, `#C2410C` text (warm amber — pipeline in motion)
  - Funded: `#ECFDF5` bg, `WAIZ.greenInk` text
  - Disqualified: `#FEF2F2` bg, `#B42318` text
- Zebra optional: very subtle `WAIZ.soft` on even rows
- Mobile: horizontal scroll on table wrapper; min-width ~560px; cards stay stacked
- Empty state: centered copy in `WAIZ.muted`, no illustration

### Loading & errors

- Skeleton: pulsing `WAIZ.tint` blocks for cards + 4 table rows
- Error banner: light red tint, retry as text button in `WAIZ.accent700`

### What we avoid

- Generic Inter/system-only styling, purple gradients, dense admin-dashboard tables
- Competing with internal Client Workspace UI — this stays **client-simple**

---

## UI structure

```
ClientLogShell
├── header (wordmark + title)
├── TabBar [ Log | Activity ]
└── panel
    ├── LogPanel → LoanLogForm
    └── ActivityPanel → ClientLogActivity
          ├── RangePicker
          ├── SummaryCards (4)
          └── ActivityTable
```

Refactor [`LoanLogForm`](src/components/loan-log/LoanLogForm.tsx): remove outer
wordmark/title from form (shell owns header) OR pass `embedded` prop to hide
duplicate chrome when inside shell.

---

## Edge cases

| Situation | Behavior |
|-----------|----------|
| No logs in range | Cards 0; table empty state |
| Fetch fails | Message + retry; Log tab still works |
| Multiple files same borrower | Multiple rows |
| DQ + deal same borrower | Both rows if both exist |
| `all` range | No start date filter; may cap rows at 500 server-side |

---

## Testing

### Unit

- `client-log-activity.ts`: row building, summary counts, range windows, orphan proposal suppression

### Manual QA

1. Log proposal → appears in Activity as Proposal
2. Log submitted → row moves to Submitted; proposal orphan gone
3. Log funded → stage Funded; submitted card/funded card update
4. Log DQ → Disqualified row + card
5. Range 7d excludes older rows
6. Tab switch preserves token; no duplicate headers
7. Mobile: tabs + table scroll readable

---

## Files (implementation)

| File | Change |
|------|--------|
| `src/components/loan-log/ClientLogShell.tsx` | New — tabs, header, layout |
| `src/components/loan-log/ClientLogActivity.tsx` | New — range, cards, table |
| `src/lib/client-log-activity.ts` | New — query builder |
| `src/lib/client-log-activity.test.ts` | New — unit tests |
| `src/app/api/forms/loans/[token]/activity/route.ts` | New — GET |
| `src/app/forms/loans/[token]/page.tsx` | Render shell |
| `src/components/loan-log/LoanLogForm.tsx` | `embedded` mode — no duplicate header |
