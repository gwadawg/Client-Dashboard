---
title: Client Work Log — Findings, Cadence, Bets
status: approved
last_updated: 2026-08-18
artifact_type: design
related_docs:
  - docs/CLIENT-HEALTH-REDESIGN.md
  - content/library/operations/people/kpi-review-meeting-sop.md
  - src/lib/client-health-interventions.ts
  - src/components/ClientTimelineChart.tsx
  - src/components/ClientActionLog.tsx
---

# Client Work Log — Findings, Cadence, Bets

## Purpose

Log every account action so operators can see **what we did**, without
treating hygiene as a KPI intervention. Measure only hypothesized
bets. Overlay the Client Success timeline by layer.

## Non-goals (this pass)

- Replacing week plans
- Overlaying logs on the portfolio CS bar chart
- Per-row chart visibility flags or 1–5 impact scores
- A fourth work type (strategy / escalation)
- Client-facing share of this log
- Soft-delete / audit trail on hard deletes

## Operating model

One table: `client_action_logs`. Three `work_type` values.

- **Finding** — discovery, not a change. No hypothesis, no baseline,
  no review. Observed date is `change_date`. Can be promoted to a bet.
- **Cadence** — expected hygiene. Planned date from the week-plan
  task; done date is `change_date`. No KPI measurement.
- **Bet** — hypothesized KPI mover. Baseline freezes only when the
  change goes **live**. Planned bets keep `change_date` null.

Week plans stay the weekly checklist. Completing a task always files
a work-log row of the task's `work_type`. No "log as account change"
opt-in.

## Dates

| Type | planned_date | change_date | review_date | baseline |
|------|--------------|-------------|-------------|----------|
| Finding | optional | observed | none | none |
| Cadence | from `scheduled_for` | completion | none | none |
| Bet (planned) | intend-to-ship | **null** | set | do not freeze |
| Bet (live) | kept | went live | yes | 14d before live |

Charts and `v_client_activity` use live date (`change_date`), then
`planned_date`, then `created_at`. Ghost markers use `planned_date`
when live date is still null.

## Visuals

**Work strip** (always on) under the KPI chart: every log in range.
Findings as amber diamonds, cadence as slate ticks, bets as
status-colored spans from live → review. Planned-not-live as hollow
marks.

**KPI overlay** (toggles, persisted in `localStorage`):

- Default on: Bets
- Default off: Findings, Cadence
- Overlay x = week of `change_date` (or planned week for ghosts)
- Same-week collisions: one marker + stacked tooltip
- Bet measurement band: live week → review week

Pending interventions and Media Buyer reflections stay **bets only**.

## Write path

All inserts go through `createClientActionLog` (used by
`POST /api/client-actions` and week-plan complete). Freeze baseline
only when `work_type = bet`, `change_date` is set, and status is not
`planned`. Eval skips non-bets and planned bets with null live date.

Existing rows backfill to `work_type = 'bet'`.
