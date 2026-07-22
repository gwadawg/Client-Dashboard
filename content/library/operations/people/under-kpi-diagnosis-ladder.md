---
title: Under-KPI Diagnosis Ladder
slug: under-kpi-diagnosis-ladder
domain: operations
owner: operations
status: draft
last_updated: 2026-07-21T00:00:00.000Z
review_cycle: monthly
artifact_type: sop
related_docs:
  - slug: kpi-review-meeting-sop
    label: KPI Review Meeting SOP
    relation: prerequisite
department: operations
---

# Under-KPI Diagnosis Ladder

## Purpose

A short field guide for the role that owns a red account: confirm whether the miss is **system/data broken** or **quality execution**, then pick **one** lever. The app already grades accounts — this is not a second grader.

## Scope

**In:** Async diagnosis after Monday KPI names a red (or when a mid-week fire appears).

**Out:** Replacing Mr. Waiz bands, copying full tier tables, stacking multiple fixes at once, GHL changes without Founder approval.

## Trigger

- Monday KPI named a red with an action plan, or
- Mid-week Act now / Below KPI flag that needs a plan before Thursday Commitment Check

## Inputs

- Mr. Waiz account health for the client (W14 / current grading window)
- Monday note line (Why + Plan), if already written
- Live spend, leads, booked, show/no-show dispositions

## Outputs

- Updated constraint label: **system** or **quality** (+ layer)
- One lever with role owner + timebox + success signal
- Optional update to the meeting note line for Thursday

## Solve cadence

1. **Mon** — room names the red + thin explanation + action plan ([KPI Review Meeting SOP](/library/kpi-review-meeting-sop)).
2. **Tue–Wed** — owning role runs this ladder.
3. **Thu** — Commitment Check: did the action land? Update Why/Plan if diagnosis changed.

## Ladder (execute in order)

| Step | Check | Outcome |
|------|--------|---------|
| 0 | Data complete for W14? (spend, leads, booked, show/no-show dispositions) | No → **system / DATA_HOLD** — fix data first; no layer “fixes” |
| 1 | Known webhook / GHL / attribution break? | Escalate Ops/Founder; no funnel thrash |
| 2 | External shock? (holiday, Meta platform change, LO calendar shut) | Observe 48–72h; document the factor |
| 3 | App north star still Below/911? | If no, do not invent a red (optional leading watch only) |
| 4 | First broken layer top→down: Ads → Landing → Call center → Show/LO | That layer = **primary constraint** |
| 5 | System vs quality | See definitions below |
| 6 | One lever + role owner + timebox | Use [Constraint Troubleshooting SOP](../../client-fulfillment/client-success/constraint-troubleshooting-sop.md); success = band move |
| 7 | Escalate | 911 same day; DATA_HOLD immediate; GHL changes need Founder approval |

## System vs quality

| Class | Meaning | Typical owners |
|-------|---------|----------------|
| **System** | Tracking, disposition, spend sync, webhooks, attribution — numbers cannot be trusted or are incomplete | Ops / Founder |
| **Quality** | Creative, targeting, landing/opt-in, setter execution, dial coverage, LO show process | Media Buyer / Call Center Manager / Client Success (by layer) |

## Basic data-accuracy checklist

Software does most of the grading. Before blaming quality, confirm:

- [ ] Ad spend present for the window
- [ ] Lead volume not obviously missing vs Meta/GHL
- [ ] Appointment outcomes dispositioned (show / no-show / cancelled / rescheduled)
- [ ] Booking agent / credit looks sane on recent books
- [ ] No phantom duplicate shows or spend double-count

## Numbers source of truth

Live account status and bands come from **Mr. Waiz**. Do not copy tier tables into this doc. For deeper runnable diagnosis see [Client Diagnostic Playbook](../../kpis/client-diagnostic-playbook-runnable.md) and [Diagnostic Rulebook](../../kpis/client-performance-diagnostic-rulebook.md).

## Quality bar

- One primary constraint per red
- System/data cleared before quality levers
- Every diagnosis ends with a role + action + timebox (or explicit observe window)

## Escalation

| Situation | Who |
|-----------|-----|
| 911 | Founder same day |
| DATA_HOLD / attribution | Founder immediately |
| GHL automation change | Ops diagnoses; Founder approves |
| Cross-seat blocker | Fri Exec Q&A intake |

## Related Docs

- [KPI Review Meeting SOP](/library/kpi-review-meeting-sop)
- [Client Diagnostic Playbook (Runnable)](../../kpis/client-diagnostic-playbook-runnable.md)
- [Client Performance Diagnostic Rulebook](../../kpis/client-performance-diagnostic-rulebook.md)
- [Constraint Troubleshooting SOP](../../client-fulfillment/client-success/constraint-troubleshooting-sop.md)
- [Fulfillment KPI standards](../../client-fulfillment/client-success/fulfillment-constraint-diagnosis-kpi-standards.md)
