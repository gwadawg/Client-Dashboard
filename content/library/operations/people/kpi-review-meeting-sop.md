---
title: KPI Review Meeting SOP
slug: kpi-review-meeting-sop
domain: operations
owner: operations
status: draft
last_updated: 2026-07-22T00:00:00.000Z
review_cycle: monthly
artifact_type: sop
related_docs:
  - docs/operations/people/under-kpi-diagnosis-ladder.md
  - docs/operations/people/client-success-daily-os.md
  - docs/kpis/client-diagnostic-playbook-runnable.md
  - docs/client-fulfillment/client-success/constraint-troubleshooting-sop.md
  - docs/superpowers/specs/2026-07-21-kpi-review-meeting-sop-design.md
  - docs/superpowers/specs/2026-07-22-kpi-meeting-commitments-design.md
department: operations
---

# KPI Review Meeting SOP

## Purpose

Run Monday Week Plan and Thursday Commitment Check so every under-KPI account leaves with an **action plan** and a short **explanation of what went wrong** — without turning the meeting into a diagnosis workshop.

## Scope

**In:** Mon KPI (~25 min) and Thu KPI (~25 min) for Client Success, Media Buyer, and Call Center Manager. Structured commitments feed Mon Ops Planning **Needs Founder**.

**Out:** Creative debates, Founder status theater, deep coaching, rewriting the grader, Fri Exec Q&A form (separate).

## Trigger

- **Monday ~10:00 America/Sao_Paulo** — Week Plan (`mon-kpi-week-plan` in Mr. Waiz Team Meetings)
- **Monday ~10:30** — Ops Planning Needs Founder (approve queue; not this SOP’s room)
- **Thursday ~10:00 America/Sao_Paulo** — Commitment Check (`thu-kpi-commitment-check`)

## Inputs

- Mr. Waiz Client Success / Ops overview: **Act now** (911) + **Below KPI** accounts
- Open commitments from Monday (Thursday)
- [Under-KPI Diagnosis Ladder](/library/under-kpi-diagnosis-ladder) for async diagnosis between Mon and Thu

## Outputs

- Structured **Commitments** rows in Team Meetings (Why + constraint + plan + owner + due)
- Needs Founder flags for Ops approval (GHL / DATA_HOLD / 911 asks)
- Thursday: landed / blocked / missed on each open commitment
- After approve: owner pastes ClickUp URL and marks in progress (manual)

## Tools

- Mr. Waiz Team Meetings: `/dashboard?view=team_meetings`
- Commitments panel on Mon KPI / Thu KPI; Needs Founder on Mon Ops Planning
- Resource Library: `/library/kpi-review-meeting-sop`, `/library/under-kpi-diagnosis-ladder`
- Live grading / focus: Client Success overview (numbers from Mr. Waiz — do not re-debate formulas in the room)

## Role ownership (positions only)

| Role | Owns in the room |
|------|------------------|
| **Client Success** | Hosts; R/Y/G rollup; client/LO risk; captures commitments in the panel |
| **Media Buyer** | Reds on CPL / CPQL / opt-in / lead quality |
| **Call Center Manager** | Reds on hand-raise/booking, show, dial coverage on under-KPI logos |
| **Founder** | Not required in Mon/Thu KPI room; batch-approves Needs Founder in Ops Planning |

North star: RM/DSCR = **CPConv**; HE = **hand-raise and/or show**. Do not chase CPL alone when CPConv is healthy.

---

## Section A — Monday Week Plan (~25 min)

### Pre-work (Client Success, before the call)

1. Open Act now + Below KPI accounts (exclude fresh launches unless flagged).
2. Sort reds by seat before the call (Media Buyer vs Call Center Manager vs Client Success).
3. Open the Team Meetings runbook for Mon KPI.

### In room

1. **Rules (60s)** — one primary constraint per red; owners speak only on their reds; no creative debates.
2. **R/Y/G scan** — Client Success drives the board; greens silent unless a leading watch needs a note.
3. **Per red (2–3 min max):**
   - Confirm north-star miss.
   - Fork: **system/data** vs **quality** (thin only — deep work uses the ladder async).
   - If dispositions look incomplete in-room, name **DATA_HOLD** and assign Call Center Manager / Client Success to finish Gate A before quality levers.
   - Add **one** commitment row: constraint + plan + Why + owner + due. Toggle **Needs Founder** when Ops must approve.
4. **OB glance** — launches this week only (gate risk), then close.

Even if the plan is “observe 48h,” add a row with Why filled.

### Form checklist keys (do not rename)

| Key | Meaning |
|-----|---------|
| `ryg_scan_done` | R/Y/G scan done |
| `reds_have_owners` | Reds have role owners |
| `commitments_named` | Commitments logged in panel (Why + plan + due) |
| `ob_glance` | OB glance for launches this week |

### In / Out

**In:** reds with role owners, explanations, action plans, OB glance.

**Out:** creative debates, Founder status theater, deep how-to coaching, full diagnostic workshop.

---

## Section B — Thursday Commitment Check (~25 min)

### In room

1. **Open commitments panel only** — no full book re-scan.
2. Each item: **landed / blocked / missed**.
3. Still red → re-commit (edit plan / due) or escalate to Fri Exec Q&A intake.
4. Remind: Thu EOD questions for Fri Exec Q&A (decisions only — not KPI status).

### Form checklist keys (do not rename)

| Key | Meaning |
|-----|---------|
| `commitments_checked` | Open commitments checked |
| `still_red_recommitted` | Still-red items re-committed |
| `fri_qa_reminded` | Fri Q&A intake reminded |

### In / Out

**In:** commitment follow-through, re-commits, Fri Q&A remind.

**Out:** re-scanning the whole book, new creative debates, inventing status for Founder.

---

## Between Mon and Thu (async)

Owning roles run the [Under-KPI Diagnosis Ladder](/library/under-kpi-diagnosis-ladder):

1. **Gate A** — prove data (appointments fully dispositioned + role-split spot-checks) before trusting Mr. Waiz
2. **Gate B** — challenge the app’s constraint against the first broken layer
3. **Gate C** — system vs quality + one plan

Refine the same commitment rows; do not invent a parallel note system.

After Ops **Approve**, create the ClickUp task, paste the URL on the row, mark **in progress**. Seat-owned items (`needs_founder` off) may move to in progress without Ops.

## Quality bar

- Every Mon red has a commitment row (Why + Plan + role + due).
- Positions only — no personal names in the standard.
- Meeting stays ~25 minutes; depth lives in the library ladder, not the form.
- One primary constraint per red; system/data fork before quality levers.

## Escalation

| Situation | Who |
|-----------|-----|
| 911 north star | Founder same day (Needs Founder + Ops) |
| DATA_HOLD / attribution broken | Founder immediately — no funnel thrash |
| GHL / automation change | Ops diagnoses; Founder approves in Needs Founder before change |
| Commitment blocked across seats | Fri Exec Q&A intake (decision) |

## Metrics

- % of Mon reds with a commitment row
- % of Needs Founder items dispositioned same Monday
- % of Thu open commitments dispositioned (landed / blocked / missed)
- Meeting duration stays near 25 minutes

## Related Docs

- [Under-KPI Diagnosis Ladder](/library/under-kpi-diagnosis-ladder)
- [KPI Meeting Commitments Design](../../superpowers/specs/2026-07-22-kpi-meeting-commitments-design.md)
- [Client Success Daily OS](client-success-daily-os.md)
- [Client Diagnostic Playbook (Runnable)](../../kpis/client-diagnostic-playbook-runnable.md)
- [Constraint Troubleshooting SOP](../../client-fulfillment/client-success/constraint-troubleshooting-sop.md)
- [KPI Review Meeting SOP Design](../../superpowers/specs/2026-07-21-kpi-review-meeting-sop-design.md)
- [Team Call Runbooks Design](../../plans/2026-07-21-team-call-runbooks-design.md)
