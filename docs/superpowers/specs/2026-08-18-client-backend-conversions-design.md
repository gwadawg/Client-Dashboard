---
title: Client Backend Conversions — Design
status: draft
last_updated: 2026-08-18
artifact_type: design
related_docs:
  - docs/KPIS.md
  - docs/CLIENT_OFFER_TYPES.md
  - docs/superpowers/specs/2026-08-14-client-loan-log-form-design.md
  - src/lib/metrics.ts
  - src/components/client-workspace/ClientKpiPanel.tsx
  - src/components/ClientConversionsView.tsx
  - src/components/LeadProfilesTable.tsx
  - src/lib/nav.ts
---

# Client Backend Conversions — Design

## Purpose

Show proposal / submission / funded KPIs on **every fulfillment offer**,
not only Reverse, and make each unique-lead count clickable into the
leads that produced it.

Storage already exists: GHL/Make and the loan-log form write
`proposal_made`, `submission_made`, and `loan_funded` on `events`.
This pass surfaces that data. It does not add a loan table.

## Current state

- Unique-lead funnel rollup lives in `calculateMetrics` (`docs/KPIS.md`).
  Funded implies submitted and proposed. Submitted implies proposed.
  A proposal does not imply submitted or funded.
- Reverse and DSCR (`usesRmKpiLayout`) already show a Conversions card
  block and a **Conversions & ROI** button.
- Call Center uses the appointment/calling layout and has neither.
- Explorer tabs are Leads, Dials, Appointments, Speed to Lead, Meta Ads.
  Lead Profiles already accepts `?conv=` for Has Proposal / Submission /
  Funded. There is no Conversions tab, and KPI cards do not set it.
- `tab=kpis&sub=conversions` opens the ROI page. That collides with an
  Explorer tab that also needs `sub=conversions`.

## Non-goals (this pass)

- A `loan_outcomes` table or first-class `loan_size` / `commission`
  columns (they stay on `events.raw`)
- A conversion-only table layout (reuse Lead Profiles)
- Merging synthetic loan-log `ldr:` ids with later GHL contact ids
- Changing loan-log write rules or the lifetime unique index
- New KPI formulas or a different date-window rule
- Multi-select stage filters
- Making cost / volume cards clickable

## Success criteria

- An operator can open any Reverse, DSCR, or Call Center client, see
  Proposals / Submissions / Funded for the selected range, and click a
  count to land on those exact leads.
- Conversions & ROI matches the Reverse page and is available on DSCR
  and Call Center. Cost-per-stage and ROAS are omitted when ad spend in
  range is $0. Step rates still show.
- Explorer → Conversions with a stage filter lists the same unique-lead
  set as that KPI card for the same client(s) and dates.
- Old KPI bookmarks `?tab=kpis&sub=conversions` still open ROI.

## Audience and entry

| Item | Value |
|------|--------|
| Surfaces | Client Workspace → KPIs, KPIs → Conversions & ROI, Explorer → Conversions |
| Offers | Reverse, DSCR, Call Center |
| Permission | KPI / ROI: `dashboard`. Explorer tab and card click-through: `data_explorer` |
| Scope | Current workspace client (or live/all), date range, live-only flag |
| Chrome | Existing Client Workspace. No new nav group. |

## Architecture

No new tables. Three reads of the same `events` + `calculateMetrics`
scope:

```text
events (proposal_made / submission_made / loan_funded)
  + loan-log / GHL ingest (already shipping)
        |
        +-- KPIs: unique-lead counts + cost/ROAS when spend > 0
        +-- Conversions & ROI: existing ClientConversionsView
        +-- Explorer → Conversions: LeadProfilesTable + ?conv=
```

Lead identity stays Lead Profiles today: `ghl_contact_id`, else phone.
Synthetic `ldr:` loan-log rows are not merged with a later GHL id.

## Funnel matching

Explorer filters use the same unique-lead rollup as the KPI cards:

| Filter (`conv`) | Who appears |
|-----------------|-------------|
| *(empty)* All | Leads in range (same as Explorer → Leads) |
| `proposal_made` | Reached proposal **or beyond** (includes submitted and funded) |
| `submission_made` | Reached submission **or beyond** (includes funded) |
| `loan_funded` | Has a funded loan |

Date window is the stage event (or a later implied stage) in range,
not “leads created in range who later converted.”

A KPI click never lands on All. It always sets that stage’s `conv`.

## KPI grid

Every offer shows the same **Conversions** block Reverse already has
(unique-lead counts, funded-transaction / loan-volume cards, cost-per-stage,
ROAS when commission exists). Call Center gets that block under
appointment and calling stats.

When `ad_spend` in range is $0:

- Omit Cost per Proposal, Cost per Submission, Cost per Funded
  (borrower and transaction), and ROAS.
- Keep unique-lead counts. Keep Loan Volume if it is already on the
  Reverse block (it is not a cost).

**Clickable cards** (need `data_explorer`; otherwise render as static):

| Card | Goes to |
|------|---------|
| Proposals Made | Explorer → Conversions, `conv=proposal_made` |
| Submissions | Explorer → Conversions, `conv=submission_made` |
| Unique Funded Borrowers (Funded Loans) | Explorer → Conversions, `conv=loan_funded` |

Preserve client, date range, and live-only. Do not click Funded
Transactions, Loan Volume, or cost cards — those numbers are not the
unique-lead list.

**Conversions & ROI** button shows for all three offers. Same
`ClientConversionsView` as Reverse. Hide money / what-if spend math
when `ad_spend` is $0; keep proposal → submission → funded rates.

## URL

Split the two “conversions” meanings:

| Intent | URL |
|--------|-----|
| ROI page | `tab=kpis&sub=roi` |
| Explorer list | `tab=explorer&sub=conversions&conv=proposal_made\|submission_made\|loan_funded` |

Compatibility: `tab=kpis&sub=conversions` still opens ROI (button,
simulator “actuals” link, and bookmarks). Switching to Explorer with
that leftover `sub` must **not** open ROI; Explorer resolves
`sub=conversions` as the new tab.

KPI tab has no sub-tab bar. `sub=roi` (and the `conversions` alias)
only toggles the ROI page vs the grid.

## Explorer → Conversions

Add a **Conversions** tab next to Leads / Dials / Appointments.

It is `LeadProfilesTable` with the existing stage `<select>` driven by
`conv`. Same one-row-per-lead table, expand for timeline, search by
name / phone / email (search still ignores the date range).

Empty copy when a stage is set and the list is empty: “No leads reached
this stage in this range.”

Loan size and commission stay on the expanded timeline when present in
`events.raw`. No new columns.

## Permissions and mixed scope

- No `data_explorer`: hide the Conversions Explorer tab; conversion
  count cards are not links.
- Client-scoped users still only see their client.
- All-clients / mixed Reverse+DSCR+Call Center: conversion cards still
  show; cost/ROAS follow combined spend (hide if $0). The list includes
  every in-scope lead at that stage; client name stays on the row.

## Data notes (do not change this pass)

- `events_conversion_unique` keeps one row per client + contact +
  stage for life. A second funded on the same contact is still **one**
  unique funded lead. That matches the click-through list.
- Loan-log money lives in `events.raw` (`loan_size`,
  `commission_amount`). `clients.loan_log_token` is unchanged.
- Legacy aliases (`proposal_sent`, `loan_processing`, `closed`) stay
  normalized at ingest.

## Tests

- Conversion cards and the ROI button render for Reverse, DSCR, and
  Call Center. Cost-per-stage and ROAS omit when `ad_spend` is 0;
  unique-lead counts still show.
- Funnel rollup unchanged: funded counts in submissions and proposals;
  submitted counts in proposals; proposal-only does not count as
  submitted or funded.
- Clicking Proposals / Submissions / Unique Funded sets
  `tab=explorer`, `sub=conversions`, and the matching `conv`, keeping
  client and date range.
- `tab=kpis&sub=roi` opens ROI. `tab=kpis&sub=conversions` still opens
  ROI. Explorer `sub=conversions` is the lead list, not ROI.
- Explorer Conversions with each `conv` value returns the same
  unique-lead set as that KPI for the same scope.
- Call Center with no spend: ROI rates show; money cards stay hidden.
- No Explorer permission: no Conversions tab and no KPI jump into it.

## Docs to update at implement time

- `docs/KPIS.md` — Conversions section is all offers, not Reverse-only.
  Call Center hides cost/ROAS when spend is $0.
- `src/lib/nav.ts` — `DataExplorerTab` includes `conversions`; KPI
  `sub=roi` documented next to the `sub=conversions` alias.
