---
title: KPI Review Meeting SOP
slug: kpi-review-meeting-sop
domain: operations
owner: operations
status: draft
last_updated: 2026-07-21T00:00:00.000Z
review_cycle: monthly
artifact_type: sop
related_docs:
  - slug: under-kpi-diagnosis-ladder
    label: Under-KPI Diagnosis Ladder
    relation: next-step
department: operations
---

# KPI Review Meeting SOP

## Purpose

Run Monday Week Plan and Thursday Commitment Check so every under-KPI account leaves with an **action plan** and a short **explanation of what went wrong** — without turning the meeting into a diagnosis workshop.

## Scope

**In:** Mon KPI (~25 min) and Thu KPI (~25 min) for Client Success, Media Buyer, and Call Center Manager.

**Out:** Creative debates, Founder status theater, deep coaching, rewriting the grader, other meeting series (setter weekly, daily training, Ops Planning, Fri Exec Q&A).

## Trigger

- **Monday ~10:00 America/Sao_Paulo** — Week Plan (`mon-kpi-week-plan` in Mr. Waiz Team Meetings)
- **Thursday ~10:00 America/Sao_Paulo** — Commitment Check (`thu-kpi-commitment-check`)

## Inputs

- Mr. Waiz Client Success / Ops overview: **Act now** (911) + **Below KPI** accounts
- Open commitments from Monday (Thursday)
- [Under-KPI Diagnosis Ladder](/library/under-kpi-diagnosis-ladder) for async diagnosis between Mon and Thu

## Outputs

- Meeting disposition notes with one line per red (why + plan)
- Named commitments with role owner + due date (usually Thursday)
- Thursday: landed / blocked / missed on each open commitment

## Tools

- Mr. Waiz Team Meetings: `/dashboard?view=team_meetings`
- Resource Library: `/library/kpi-review-meeting-sop`, `/library/under-kpi-diagnosis-ladder`
- Live grading / focus: Client Success overview (numbers from Mr. Waiz — do not re-debate formulas in the room)

## Role ownership (positions only)

| Role | Owns in the room |
|------|------------------|
| **Client Success** | Hosts; R/Y/G rollup; client/LO risk; captures action plans + explanations into meeting notes |
| **Media Buyer** | Reds on CPL / CPQL / opt-in / lead quality |
| **Call Center Manager** | Reds on hand-raise/booking, show, dial coverage on under-KPI logos |
| **Founder** | Not required in-room; reviews notes later; 911 / DATA_HOLD / GHL approval |

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
   - Capture **one** constraint label + **one** action plan + **one-sentence explanation**.
4. **OB glance** — launches this week only (gate risk), then close.

### Note / action-plan line format

Paste into meeting **summary** or **follow_ups** (existing disposition fields — no special form field yet):

```
[Client] · [911|Below] · Why: [one sentence] · Constraint: [system|quality / label] · Plan: [role] will [action] by [date] · Success: [signal]
```

Even if the plan is “observe 48h,” write the Why line.

### Form checklist keys (do not rename)

| Key | Meaning |
|-----|---------|
| `ryg_scan_done` | R/Y/G scan done |
| `reds_have_owners` | Reds have role owners |
| `commitments_named` | Commitments named + due |
| `ob_glance` | OB glance for launches this week |

### In / Out

**In:** reds with role owners, explanations, action plans, OB glance.

**Out:** creative debates, Founder status theater, deep how-to coaching, full diagnostic workshop.

---

## Section B — Thursday Commitment Check (~25 min)

### In room

1. **Open commitments only** — no full book re-scan.
2. Each item: **landed / blocked / missed**.
3. Still red → re-commit with updated Why/Plan line, or escalate to Fri Exec Q&A intake.
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

Owning role runs the [Under-KPI Diagnosis Ladder](/library/under-kpi-diagnosis-ladder) on their reds. Update the note line on Thursday if the diagnosis changed.

## Quality bar

- Every Mon red has a complete note line (Why + Plan + role + due).
- Positions only — no personal names in the standard.
- Meeting stays ~25 minutes; depth lives in the library ladder, not the form.
- One primary constraint per red; system/data fork before quality levers.

## Escalation

| Situation | Who |
|-----------|-----|
| 911 north star | Founder same day |
| DATA_HOLD / attribution broken | Founder immediately — no funnel thrash |
| GHL / automation change | Ops diagnoses; Founder approves before change |
| Commitment blocked across seats | Fri Exec Q&A intake (decision) |

## Metrics

- % of Mon reds with a complete note line
- % of Thu open commitments dispositioned (landed / blocked / missed)
- Meeting duration stays near 25 minutes

## Related Docs

- [Under-KPI Diagnosis Ladder](/library/under-kpi-diagnosis-ladder)
- [Client Success Daily OS](client-success-daily-os.md)
- [Client Diagnostic Playbook (Runnable)](../../kpis/client-diagnostic-playbook-runnable.md)
- [Constraint Troubleshooting SOP](../../client-fulfillment/client-success/constraint-troubleshooting-sop.md)
- [KPI Review Meeting SOP Design](../../superpowers/specs/2026-07-21-kpi-review-meeting-sop-design.md)
- [Team Call Runbooks Design](../../plans/2026-07-21-team-call-runbooks-design.md)
