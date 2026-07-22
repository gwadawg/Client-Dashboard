---
title: Under-KPI Diagnosis Ladder
slug: under-kpi-diagnosis-ladder
domain: operations
owner: operations
status: draft
last_updated: 2026-07-22T00:00:00.000Z
review_cycle: monthly
artifact_type: sop
related_docs:
  - docs/operations/people/kpi-review-meeting-sop.md
  - docs/kpis/client-diagnostic-playbook-runnable.md
  - docs/kpis/client-performance-diagnostic-rulebook.md
  - docs/client-fulfillment/client-success/constraint-troubleshooting-sop.md
department: operations
---

# Under-KPI Diagnosis Ladder

## Purpose

Before the team fully trusts Mr. Waiz’s red / constraint on a client, prove the **data is dispositioned and complete**, then decide whether the miss is **system/data broken** or **quality execution**, then pick **one** lever.

Mr. Waiz grades accounts. This ladder is the human trust check — not a second grader and not a place to copy tier tables.

## Scope

**In:** Async diagnosis after Monday KPI names a red (or mid-week Act now / Below), before quality levers.

**Out:** Rewriting bands, stacking multiple fixes, GHL changes without Founder approval, creative debates in the Mon/Thu room.

## Trigger

- Monday KPI named a red with an action plan, or
- Mid-week Act now / Below KPI that needs a plan before Thursday Commitment Check

## Inputs

- Mr. Waiz account health for the client (current grading window)
- Monday note line (Why + Plan), if already written
- Meta / GHL / appointment outcomes for a spot-check

## Outputs

- **Data trust result:** pass → proceed · fail → **system / DATA_HOLD**
- Constraint label: **system** or **quality** (+ layer)
- One lever with role owner + timebox + success signal
- Updated meeting note line for Thursday if diagnosis changed

## Solve cadence

1. **Mon** — room names the red + thin Why/Plan ([KPI Review Meeting SOP](/library/kpi-review-meeting-sop)).
2. **Tue–Wed** — owning roles run **Gate A → B → C** below.
3. **Thu** — Commitment Check: did the action land? Update Why/Plan if Gate A failed or the constraint changed.

---

## Gate A — Prove the data (do this before trusting Mr. Waiz)

**Rule:** If Gate A fails, stop. Label **system / DATA_HOLD**. Fix data / escalate. Do **not** change ads, scripts, or dial plans based on a red you cannot trust.

### Shared stop conditions (anyone can call DATA_HOLD)

- [ ] Appointment outcomes for the window are **fully dispositioned** (no material blanks) — show / no-show / cancelled / rescheduled / LO bailed as applicable
- [ ] Pending appointments are not being treated as shows or no-shows
- [ ] Mr. Waiz is not grading on **insufficient / empty** volume when the account clearly had activity (or the reverse: grading hard on tiny n)

If any fail → **DATA_HOLD**. Client Success records Why: “data incomplete — dispositions / volume” and owns the fix chase (or escalates Ops/Founder).

### Role-split spot-check

#### Media Buyer — spend + lead ingest

- [ ] Ad spend present for the window (not blank / not $0 when ads were live)
- [ ] Lead volume roughly matches Meta / GHL (no obvious missing ingest days)
- [ ] No obvious spend double-count or wrong client attribution
- [ ] If CPL / CPQL / opt-in look insane vs Meta Ads Manager → treat as **system** until reconciled

#### Call Center Manager — appointments + booking credit

- [ ] **Every appointment in the window has an outcome** (dispositioned properly) — this is the #1 trust check for show % and CPConv
- [ ] Show / no-show / LO bailed / cancelled / rescheduled labels match reality (spot-check a sample of recent books)
- [ ] Booking agent / credit looks sane on recent books (wrong setter credit ≠ wrong quality diagnosis)
- [ ] Live transfers / claimed conversations that should count are present if the LO / floor says they happened
- [ ] No phantom duplicate shows for the same lead

#### Client Success — book call + north star

- [ ] Gate A Media Buyer + CCM checks done (or blocked with named owner)
- [ ] North star still red **after** dispositions are clean (RM/DSCR = CPConv; HE = hand-raise and/or show)
- [ ] If all layer metrics look fine but CPConv is red → suspect **attribution / data_issue**, not quality
- [ ] Decide: **pass Gate A** or **DATA_HOLD** with Founder/Ops escalate when tracking is broken

### Disposition standard (appointments and all)

“Dispositioned properly” means:

| Outcome | Must be set when… |
|---------|-------------------|
| **Show** | Lead attended |
| **No-show** | Lead missed (and it is not pending) |
| **LO bailed** | Partner LO missed (do not bury as lead no-show) |
| **Cancelled / rescheduled** | Meeting moved or killed — not left blank |
| **Pending** | Future or undecided only — **never** used in show % as if it were final |

Blank Showed? / blank status on past appointments = **Gate A fail**. Fill them before trusting show rate, conversation count, or CPConv.

---

## Gate B — Challenge Mr. Waiz’s constraint (only if Gate A passed)

1. Open the client in Mr. Waiz. Note: focus label, north-star tier, **primary constraint** the app shows.
2. Confirm north star is still Below/911. If not → do not invent a red (optional leading watch only).
3. Walk layers **top → bottom**. Stop at the **first** broken layer that explains the north-star miss:

| Layer | What you look at | Typical quality owner if real |
|-------|------------------|-------------------------------|
| L1 Ads | CPL, spend efficiency, audience | Media Buyer |
| L2 Landing / lead quality | Lead→qual, opt-in, CPQL | Media Buyer |
| L3 Call center | Hand-raise / booking, dials, script | Call Center Manager |
| L4 Show / LO | Net show, LO bail, confirmations | Call Center Manager + Client Success |

4. Ask: does Mr. Waiz’s constraint match the first broken layer?  
   - **Yes** → proceed to Gate C.  
   - **No** (app says call center but dispositions were the problem, or metrics OK but CPConv red) → prefer **system / data_issue** or re-label to the true first layer.

---

## Gate C — System vs quality + one plan

| Class | Meaning | Do |
|-------|---------|----|
| **System** | Tracking, disposition gaps, spend sync, webhooks, attribution — numbers not trustworthy or incomplete | Fix data / escalate Ops/Founder. No funnel thrash. |
| **Quality** | Creative, targeting, landing, setter execution, dial coverage, LO show process | One lever from [Constraint Troubleshooting SOP](../../client-fulfillment/client-success/constraint-troubleshooting-sop.md) |

### One-plan rule

Write (or update) the note line:

```
[Client] · [911|Below] · Why: [one sentence] · Constraint: [system|quality / label] · Plan: [role] will [action] by [date] · Success: [signal]
```

- One primary constraint only  
- Success signal = the band or disposition fix that must move  
- External shock (holiday, Meta, LO calendar shut) → observe 48–72h and document — still Gate A first  

### Escalation

| Situation | Who |
|-----------|-----|
| Gate A fail / DATA_HOLD | Client Success + Ops; Founder if attribution / GHL |
| 911 after Gate A pass | Founder same day |
| GHL automation change | Ops diagnoses; Founder approves before change |
| Cross-seat blocker | Fri Exec Q&A intake |

---

## Ladder summary (order)

| Step | Gate | Check | If fail / outcome |
|------|------|--------|-------------------|
| 0 | A | Appointments (+ related outcomes) fully dispositioned | DATA_HOLD |
| 1 | A | Role-split spend / leads / booking credit / phantom checks | DATA_HOLD |
| 2 | A | Volume / insufficient not misread | DATA_HOLD or observe |
| 3 | B | North star still red; first broken layer matches app | Re-label or data_issue |
| 4 | C | System vs quality | System → fix data; Quality → one lever |
| 5 | C | One plan + escalate rules | Note line for Thu |

## Numbers source of truth

After Gate A passes, live status and bands come from **Mr. Waiz**. Do not copy tier tables here. Deeper runnable diagnosis: [Client Diagnostic Playbook](../../kpis/client-diagnostic-playbook-runnable.md) · [Diagnostic Rulebook](../../kpis/client-performance-diagnostic-rulebook.md).

## Quality bar

- Gate A before any quality lever  
- Appointments dispositioned properly — non-negotiable  
- Positions only; one primary constraint; one plan  

## Related Docs

- [KPI Review Meeting SOP](/library/kpi-review-meeting-sop)
- [Client Diagnostic Playbook (Runnable)](../../kpis/client-diagnostic-playbook-runnable.md)
- [Client Performance Diagnostic Rulebook](../../kpis/client-performance-diagnostic-rulebook.md)
- [Constraint Troubleshooting SOP](../../client-fulfillment/client-success/constraint-troubleshooting-sop.md)
- [Fulfillment KPI standards](../../client-fulfillment/client-success/fulfillment-constraint-diagnosis-kpi-standards.md)
