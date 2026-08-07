---
title: KPI Review Meeting SOP
slug: kpi-review-meeting-sop
domain: operations
owner: client-success
status: draft
last_updated: 2026-08-06
review_cycle: monthly
artifact_type: sop
related_docs:
  - docs/operations/people/under-kpi-diagnosis-ladder.md
  - docs/operations/people/client-success-daily-os.md
  - docs/kpis/client-diagnostic-playbook-runnable.md
  - docs/client-fulfillment/client-success/constraint-troubleshooting-sop.md
  - docs/superpowers/specs/2026-07-21-kpi-review-meeting-sop-design.md
  - docs/superpowers/specs/2026-08-06-account-week-plans-design.md
  - docs/superpowers/specs/2026-07-22-kpi-meeting-commitments-design.md
---

# KPI Review Meeting SOP

## Purpose

Run Monday Week Plan and Thursday Commitment Check so every under-KPI account leaves with an **action plan** and a short **explanation of what went wrong** — without turning the meeting into a diagnosis workshop.

## Scope

**In:** Mon KPI (~25 min) and Thu KPI (~25 min) for Client Success, Media Buyer, and Call Center Manager. Capture work as **Account week plans** (one plan per client + tasks). Founder approves every plan in Account Work.

**Out:** Creative debates, Founder status theater, deep coaching, rewriting the grader, Fri Exec Q&A form (separate).

## Trigger

- **Monday ~10:00 America/Sao_Paulo** — Week Plan (`mon-kpi-week-plan` in Mr. Waiz Team Meetings)
- **Monday (after the call, anytime)** — Founder approve queue: Account Work (`/dashboard?view=account_work`)
- **Thursday ~10:00 America/Sao_Paulo** — Commitment Check (`thu-kpi-commitment-check`) — review plan tasks open vs done

## Inputs

- Mr. Waiz Client Success / Ops overview: **Act now** (911) + **Below KPI** accounts
- Open account week plans / tasks from Monday (Thursday)
- [Under-KPI Diagnosis Ladder](under-kpi-diagnosis-ladder.md) for async diagnosis between Mon and Thu

## Outputs

- **Account week plan** per red client: Why + tasks (person + day + optional free-text tag)
- Founder **approve/reject** every plan (Account Work → Approve)
- Thursday: open vs done on tasks; optional completion report
- Optional: log a completed task as **Account change** (Client Success action log) when it was a material change

## Tools

- Mr. Waiz Account Work: `/dashboard?view=account_work` (new plan, approve, week list)
- Team Meetings Mon/Thu embed the same week-plan form/list
- Client file: Account work history + Success interventions (measured account changes)
- Resource Library: `/library/kpi-review-meeting-sop`, `/library/under-kpi-diagnosis-ladder`
- Live grading / focus: Client Success overview (numbers from Mr. Waiz — do not re-debate formulas in the room)

## Role ownership (positions only)

| Role | Owns in the room |
|------|------------------|
| **Client Success** | Hosts; R/Y/G rollup; client/LO risk; captures week plans |
| **Media Buyer** | Reds on CPL / CPQL / opt-in / lead quality |
| **Call Center Manager** | Reds on unique hand-raise, **Show Rate** (unique booked → spoke to LO), dial coverage on under-KPI logos |
| **Founder** | Approves every week plan in Account Work (not required in Mon/Thu KPI room) |

North star: RM/DSCR = **CPConv**; HE = **hand-raise and/or Show Rate**. Do not chase CPL alone when CPConv is healthy.

**Show quality grade (Mr. Waiz / Client Success):** use **Show Rate** (unique booked → spoke), not **True Show** alone.

```text
Show Rate = unique booked leads who eventually spoke (show ∪ claimed ∪ live transfer)
           ÷ unique booked leads × 100
```

- Counts on the board: `spoke / unique booked` (e.g. 47/80).
- Recovery-inclusive: no-show → rebook → show still counts as success for that lead once.
- **True Show** = Shows ÷ (Shows + No-shows + LO bailed) on appointments that took place — booking-process secondary, **not** the Mon/Thu graded show metric.
- When Show Rate is red: confirmations, rebook process, LO prep — then check claimed / live-transfer path so speak outcomes are logged.

---

## Section A — Monday Week Plan (~25 min)

### Pre-work (Client Success, before the call)

1. Open Act now + Below KPI accounts (exclude fresh launches unless flagged).
2. Sort reds by seat before the call (Media Buyer vs Call Center Manager vs Client Success).
3. Open the Team Meetings runbook for Mon KPI (or Account Work → New plan).

### In room

1. **Rules (60s)** — one primary constraint per red; owners speak only on their reds; no creative debates.
2. **R/Y/G scan** — Client Success drives the board; greens silent unless a leading watch needs a note.
3. **Per red (2–3 min max):**
   - Confirm north-star miss.
   - Fork: **system/data** vs **quality** (thin only — deep work uses the ladder async).
   - If dispositions look incomplete in-room, name **DATA_HOLD** and assign Call Center Manager / Client Success to finish Gate A before quality levers.
   - Add an **Account week plan** for the client: Why + one or more **tasks** (what to do, person, day, optional tag).
4. **OB glance** — launches this week only (gate risk), then close.

Even if the plan is “observe 48h,” add a plan with Why filled and at least one task.

### Form checklist keys (do not rename)

| Key | Meaning |
|-----|---------|
| `ryg_scan_done` | R/Y/G scan done |
| `reds_have_owners` | Reds have role owners |
| `commitments_named` | Week plans logged (Why + tasks) |
| `ob_glance` | OB glance for launches this week |

### In / Out

**In:** reds with owners, explanations, account week plans, OB glance.

**Out:** creative debates, Founder status theater, deep how-to coaching, full diagnostic workshop.

---

## Section B — Thursday Commitment Check (~25 min)

### In room

1. **Account Work week list** (or Thu Team Meetings embed) — open tasks vs done; no full book re-scan if plans cover the reds.
2. Each open task: **done** (optional how-it-went) / **cancel**, or leave open and re-plan next Mon.
3. Still red → new week plan next Mon or escalate to Fri Exec Q&A intake.
4. Remind: Thu EOD questions for Fri Exec Q&A (decisions only — not KPI status).

### Form checklist keys (do not rename)

| Key | Meaning |
|-----|---------|
| `commitments_checked` | Open plan tasks checked |
| `still_red_recommitted` | Still-red items re-planned or escalated |
| `fri_qa_reminded` | Fri Q&A intake reminded |

### In / Out

**In:** execution follow-through, re-plans, Fri Q&A remind.

**Out:** re-scanning the whole book, new creative debates, inventing status for Founder.

---

## Between Mon and Thu (async)

Owning roles run the [Under-KPI Diagnosis Ladder](under-kpi-diagnosis-ladder.md):

1. **Gate A** — prove data (appointments fully dispositioned + role-split spot-checks) before trusting Mr. Waiz
2. **Gate B** — challenge the app’s constraint against the first broken layer
3. **Gate C** — system vs quality + one plan

Refine the same plan tasks in Account Work; do not invent a parallel note system.

**After founder approves:** tasks are active work. Complete them in Account Work. For material shipped changes, use **Log as account change** so Client Success can measure outcome — separate from “did we do the task?”

## Quality bar

- Every Mon red has a week plan (Why + ≥1 task with assignee when known).
- Founder can clear pending plans without Slack archaeology.
- Thu answers “what did we execute?” from week list + client history.
- Account work ≠ Success interventions until someone opts into logging a change.
- Positions only — no personal names in the standard.
- Meeting stays ~25 minutes; depth lives in the library ladder, not the form.

## Escalation

| Situation | Who |
|-----------|-----|
| 911 north star | Founder same day (week plan + approve queue) |
| DATA_HOLD / attribution broken | Founder immediately — no funnel thrash |
| GHL / automation change | Ops diagnoses; Founder approves plan before change when risky |
| Work blocked across seats | Fri Exec Q&A intake (decision) |

## Metrics

- % of Mon reds with an approved week plan same week
- % of approved open tasks completed by Friday
- % of Thu open tasks dispositioned (done / cancelled / re-planned)
- Meeting duration stays near 25 minutes

## Related Docs

- [Account Week Plans Design](../../superpowers/specs/2026-08-06-account-week-plans-design.md)
- [Under-KPI Diagnosis Ladder](under-kpi-diagnosis-ladder.md)
- [KPI Meeting Commitments Design (superseded path)](../../superpowers/specs/2026-07-22-kpi-meeting-commitments-design.md)
- [Client Success Daily OS](client-success-daily-os.md)
- [Client Diagnostic Playbook (Runnable)](../../kpis/client-diagnostic-playbook-runnable.md)
- [Constraint Troubleshooting SOP](../../client-fulfillment/client-success/constraint-troubleshooting-sop.md)
- [KPI Review Meeting SOP Design](../../superpowers/specs/2026-07-21-kpi-review-meeting-sop-design.md)
- [Team Call Runbooks Design](../../plans/2026-07-21-team-call-runbooks-design.md)
