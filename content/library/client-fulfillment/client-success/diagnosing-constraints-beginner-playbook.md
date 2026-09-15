---
title: Diagnosing Constraints SOP
slug: diagnosing-constraints-beginner-playbook
domain: client-fulfillment
owner: operations
status: active
last_updated: 2026-09-15
review_cycle: monthly
artifact_type: sop
related_docs:
  - slug: under-kpi-diagnosis-ladder
    label: Under-KPI Diagnosis Ladder
    relation: implements
  - slug: kpi-review-meeting-sop
    label: KPI Review Meeting SOP
    relation: reference
department: client-success
---

# Diagnosing Constraints SOP

## Purpose

Teach anyone on the team how to diagnose and fix constraints in client
ad accounts — the same way we run Monday KPI — without drowning in
advanced rulebooks.

You will learn:

1. What "good" looks like (North Star + layer KPIs)
2. How to find the **one** bottleneck
3. What to leave alone
4. How to fix the right layer

## Scope

**In:** Paid-ads clients (RM + DSCR) graded in Mr. Waiz Client Success.
HE / call-center-only notes are called out separately.

**Out:** Rewriting grader bands, GHL changes without Founder approval,
stacking five fixes at once.

## The #1 rule

> **Don't solve a constraint that isn't there.**
> If something is working, leave it alone.

Yes, we can improve things. We never radically change something that is
already performing. That is the #1 mistake new media buyers and CSMs make.

---

## Our North Star

Before you diagnose, you need to know what "good" looks like.

For paid-ads clients in **Mr. Waiz**, the account verdict is:

| North Star | Formula | Why it matters |
|------------|---------|----------------|
| **CPConv** | Ad Spend ÷ Unique Conversations | One number that already includes ad cost, landing, booking, and show quality |

**Unique Conversation** = a lead who spoke to the LO via any path:

```text
show  ∪  claimed  ∪  live_transfer
```

(one person counts once)

```text
The further DOWN the funnel you go, the less control Media Buying has.

  Ads / Landing     →  Media Buyer owns most levers
  Call Center       →  CCM owns booking / hand-raise
  Show Rate         →  CCM + Client Success
  Close / LO bail   →  mostly client-side (report, don't thrash ads)
```

### Default "healthy" bands (global)

These are the **default** judgment bars. Some clients have a custom
**CPL** bar in Admin → Client Roster. When CPL is customized, CPQL and
CPConv move with it. Measurement math never changes — only the bar.

| Metric | 911 | Below KPI | At KPI | Above KPI |
|--------|-----|-----------|--------|-----------|
| **CPConv** (north star) | > ~$313* | > ~$160* | ≤ ~$77* | cheaper still |
| **CPL** | > $25 | > $20 | ≤ $15 | cheaper |
| **CPQL** | > ~$63* | > ~$40* | ≤ ~$23* | cheaper |
| **Lead → Qual %** | < 40% | < 50% | ≥ 65% target / 50–65 ok | > 65% |
| **Hand-raise %** | < 20% | < 25% | ≥ 30% | higher |
| **Show Rate** | < 55% | < 63% | ≥ 70% | higher |
| **Close Rate** | < 10% | < 20% | ≥ 35% target / 20–35 ok | > 35% |

\*Cost bands for CPQL / CPConv are **derived** from CPL + conversion
bands in Mr. Waiz (`src/lib/client-health.ts`). Open the client's
Client Success card for the live numbers.

### Leading Meta / landing metrics (diagnose ads, not the verdict)

| Metric | Formula | 911 | Below | At | Above |
|--------|---------|-----|-------|----|-------|
| **CTR** | Clicks ÷ Impressions × 100 | < 0.8% | 0.8–1.2% | 1.3–2.5% | > 2.5% |
| **Frequency** | Impressions ÷ Reach | > 4.0 | 3.0–4.0 | 1.5–3.0 | < 1.5 (maybe too thin) |
| **Opt-in rate** | Leads ÷ Ad clicks × 100 | < 10% | 10–14.9% | 15–29.9% | > 30% (check quality) |

📋 Opt-in is the bridge between "ads are interesting" and "we got a
lead." High CTR + high CPL almost always means the **landing page** is
the constraint — not the creative.

---

## The funnel as an element tree

Read this top → bottom. Stop at the **first** broken layer that
explains a bad CPConv.

```text
SPEND
  │
  ├─ L1  ADS (Meta)
  │     CTR · Frequency · CPL
  │     "Are people noticing and clicking?"
  │
  ├─ L2  LANDING / LEAD QUALITY
  │     Opt-in · Lead→Qual · CPQL
  │     "Are clicks becoming the RIGHT leads?"
  │
  ├─ L3  CALL CENTER
  │     Hand-raise (booked ∪ claimed ∪ LT) ÷ Qualified
  │     Pickup / speed-to-lead (supporting)
  │     "Are qualified leads raising their hand?"
  │
  ├─ L4  SHOW QUALITY
  │     Show Rate = unique booked who spoke ÷ unique booked
  │     (True Show is secondary — process only)
  │     "Of people we booked, did they speak to the LO?"
  │
  └─ L5  CLIENT / LO  (report — limited control)
        Close rate · LO bail
        "Did the conversation become a deal?"
              │
              ▼
         NORTH STAR = CPConv
```

🔴 **Diagnostic order:** If you don't have enough leads, you cannot
honestly diagnose booking. If you don't have enough bookings, you
cannot honestly diagnose show rate. Fix **one** constraint at a time.

---

## How the process works

```text
1. Identify which KPIs are below goal (start with CPConv)
2. Find which pillar (layer) contains the constraint
3. Implement specific fixes for THAT constraint only
4. Measure results and repeat
```

### Golden guardrails

| # | Rule |
|---|------|
| G-1 | If **CPConv is healthy**, do **not** chase CPL or pause ads solely because CPL rose |
| G-2 | If **all layers look fine** but CPConv is red → **DATA_HOLD** (attribution). No thrash |
| G-3 | Low Lead→Qual = ads / targeting / messaging — **not** call center — until proven otherwise |
| G-4 | High CTR + expensive CPL → suspect **opt-in / landing** before new creative |
| G-5 | External shocks (holiday, Meta, LO calendar closed) → observe **48–72h** first |
| G-6 | Any **GHL automation** change needs **Founder approval** |

---

## Worked example (do the math)

Same spirit as the external Diagnosing & Fixing Constraints SOP —
with **Mr. Waiz** formulas.

### Goals (example account)

- CPL At ≤ $15 (client default)
- Lead→Qual ≥ 50%
- Hand-raise ≥ 30%
- Show Rate ≥ 70%
- Close ≥ 20%
- CPConv At (healthy)

### Actuals after ~1 month

| Input | Value |
|-------|------:|
| Ad spend | $1,500 |
| Leads | 55 |
| Qualified | 30 |
| Unique hand-raises (booked ∪ claimed ∪ LT) | 12 |
| Unique booked | 10 |
| Unique booked who spoke | 7 |
| Closed | 3 |

### Calculate

```text
CPL          = 1500 ÷ 55              = $27.27     → 911 / expensive
Lead→Qual    = 30 ÷ 55                = 54.5%      → At KPI
CPQL         = 1500 ÷ 30              = $50.00     → Below / expensive
Hand-raise   = 12 ÷ 30                = 40%        → Above KPI
Show Rate    = 7 ÷ 10                 = 70%        → At KPI
CPConv       = 1500 ÷ 7               = $214.29    → Below KPI*
Close        = 3 ÷ 7                  = 42.9%      → Above KPI
```

\*Uses conversations as denominator (spoke paths). If the LO only
"showed" on booked appointments and you ignore claimed/LT, the number
moves — always use Mr. Waiz Unique Conversations for the verdict.

### What is the constraint?

Walk **top → bottom**:

1. CPL / CPQL are bad → **Lead cost** (or quality if Lead→Qual were bad)
2. Lead→Qual is fine → not a quality miss
3. Hand-raise and Show Rate are fine → do **not** rewrite scripts

**Primary constraint = L1 Lead Cost** (ads / audience / creative).

**Pull these levers (only):**

- Refresh creatives (new hooks / formats)
- Check frequency / fatigue
- Review offer angle vs ICP
- Leave booking + show process alone

---

## Priority (Client Success focus)

Across the portfolio, prioritize unstable accounts. Use the labels
Mr. Waiz already shows — do not invent a second priority system.

| Focus | Meaning | Typical signals |
|-------|---------|-----------------|
| **Act now** | Burning money / brand-new | Active < 30 days; CPConv 911; CPL ~2× target; **zero leads in 72h** |
| **Below KPI** | Under target / sliding | Below band on W14; trending worse 3+ days on W7 |
| **Monitor** | Stable | CPConv safely At/Above on ~30d; watch trajectory only |

### Trajectory (every Monday)

Assign a trajectory to CPL and CPConv (compare **7d vs 14d**):

| Label | Meaning |
|-------|---------|
| **Above KPI** | Better than target; cost not rising |
| **At KPI** | On target; stable |
| **Picking Up** | Still below target, but cost improving |
| **Slowing Down** | At/Above target, but cost rising |
| **Below KPI** | Below target; not improving |
| **911** | Exploded; urgent |

Longer windows are more objective. A tiny 7d wiggle can be noise — but
a sudden spike still deserves a note.

---

## Theory of Constraints (why we only fix one thing)

A campaign is only as good as its **biggest** bottleneck.

You can buy $2 leads all day. If hand-raise is 1%, CPConv still dies.

Ask:

1. What improves performance the **most**?
2. What is the **easiest** correct fix?

Pick the constraint that wins on **both**. Then one plan:

```text
[Client] · [911|Below] · Why: [one sentence]
· Constraint: [layer]
· Plan: [role] will [action] by [date]
· Success: [metric → band]
```

---

## KPI cards (beginner reference)

### L1 — Ads

#### CTR

| | |
|--|--|
| **What** | Share of impressions that click |
| **Why** | First signal the creative still interrupts the scroll |
| **Diagnose** | Falling CTR + rising frequency → fatigue |
| **Standards differ** | RM creative often runs lower CTR than broad consumer; still use the tier table above as the ops bar |

#### Frequency

| | |
|--|--|
| **What** | Avg times one person saw the ad |
| **Why** | High frequency burns audience before CPQL moves |
| **Diagnose** | > 3 prepare refresh; > 4 act now |
| **Standards differ** | Tiny geos hit high frequency faster — expand radius before blaming creative |

#### CPL

| | |
|--|--|
| **What** | Spend ÷ total leads |
| **Why** | Cheap traffic signal — **not** the verdict |
| **Diagnose** | Only with CPQL + opt-in + CPConv |
| **Standards differ** | High-cost states often get a **custom CPL** bar in Client Roster |

### L2 — Landing / quality

#### Opt-in rate

| | |
|--|--|
| **What** | Leads ÷ ad clicks (Mr. Waiz) |
| **Why** | Proves whether the page converts motivated clicks |
| **Diagnose** | Healthy CTR + bad CPL → message match, load speed, form friction |
| **Standards differ** | Waiz pages use **qualification friction on purpose**. > 30% opt-in + rising CPQL = maybe **too soft** |

#### Lead → Qualified %

| | |
|--|--|
| **What** | Qualified ÷ leads |
| **Why** | Quality report card for targeting / messaging |
| **Diagnose** | < 40–50% → ads attracting wrong people (not CCM) |
| **Standards differ** | Qualification tags are **manual** — inconsistent tagging looks like a quality crash |

#### CPQL

| | |
|--|--|
| **What** | Spend ÷ qualified leads |
| **Why** | Primary **ad-layer** efficiency KPI |
| **Diagnose** | Fine CPL + bad CPQL = wrong audience. Bad CPL + fine Lead→Qual = expensive but right people |
| **Standards differ** | Derived from each client's CPL bar |

### L3 — Call center

#### Hand-raise rate (graded conversion)

| | |
|--|--|
| **What** | Unique (booked ∪ claimed ∪ LT) ÷ Qualified |
| **Why** | Fair conversion benchmark — credits live transfer + claimed |
| **Diagnose** | Healthy CPQL + low hand-raise → script, dial coverage, calendar slots, LT path |
| **Standards differ** | HE grades hand-raise ÷ **total leads** (no ad-cost grades) |

#### Booking rate (reference)

| | |
|--|--|
| **What** | Unique booked ÷ Qualified (RM) |
| **Why** | Volume of calendar books — **not** the Client Success conversion grade |
| **Diagnose** | Use with hand-raise; LT-heavy accounts look "low book" while converting |

### L4 — Show quality

#### Show Rate (graded)

| | |
|--|--|
| **What** | Unique booked who eventually spoke ÷ unique booked |
| **Why** | Primary quality grade — recovery-inclusive |
| **Diagnose** | Confirmations, rebook after no-show, LO prep, claimed/LT logging |
| **Standards differ** | Do **not** grade Media Buyer on this seat |

#### True Show (secondary)

| | |
|--|--|
| **What** | Shows ÷ (Shows + No-shows + LO bailed) |
| **Why** | Slot-level process quality |
| **Diagnose** | Use for booking ops — not Mon/Thu north-star show grade |

### North star + client-side

#### CPConv

| | |
|--|--|
| **What** | Spend ÷ unique conversations |
| **Why** | Verdict metric — integrates the whole machine |
| **Diagnose** | If red, walk L1→L4; if layers green, DATA_HOLD |
| **Standards differ** | Per-client CPL overrides shift the $ bars |

#### Close rate / LO bail

| | |
|--|--|
| **What** | Funded / closed ÷ spoke; LO missed ÷ booked |
| **Why** | Context for CS — mostly client execution |
| **Diagnose** | Verify lead quality first if close is chronically low |
| **Standards differ** | Visible in detail; should not thrash a healthy ad account alone |

---

## Role ownership (who pulls which lever)

| Role | Owns when red |
|------|----------------|
| **Media Buyer** | CTR, frequency, CPL, CPQL, opt-in, Lead→Qual |
| **Call Center Manager** | Hand-raise, dials/pickup, speed-to-lead, booking script |
| **Client Success** | Show Rate process, LO prep, dispositions, CPConv accountability |
| **Founder** | 911 escalation, GHL changes, DATA_HOLD |

---

## Quick diagnosis flowchart

```text
START: Open Mr. Waiz → Client Success for the client
  │
  ├─ Appointments dispositioned? ──No──► DATA_HOLD (fix data)
  │
  Yes
  │
  ├─ CPConv At/Above? ──Yes──► Don't chase CPL. Check WATCH only.
  │
  No / 911
  │
  ├─ External factor? ──Yes──► Observe 48–72h
  │
  No
  │
  Walk layers top → bottom; STOP at first broken layer:
  │
  ├─ Lead→Qual bad? ──────────────► L2 Lead quality
  ├─ CPL/CPQL bad, Qual OK? ──────► L1 Lead cost
  ├─ Opt-in bad, CTR OK? ─────────► L2 Landing
  ├─ Hand-raise bad, CPQL OK? ────► L3 Call center
  ├─ Show Rate bad, hand-raise OK?► L4 Show process
  └─ All green, CPConv red? ──────► DATA_HOLD attribution
  │
  ▼
ONE plan → Mon/Thu note → measure → repeat
```

---

## HE / Call Center clients (short)

No CPL / CPQL / CPConv grading.

North star = **hand-raise and/or Show Rate**.

Constraint order: call center → show quality. Same one-plan rule.

---

## Related docs (go deeper when ready)

- [Under-KPI Diagnosis Ladder](/library/under-kpi-diagnosis-ladder) —
  Gate A data trust before quality levers
- [KPI Review Meeting SOP](/library/kpi-review-meeting-sop) — Mon/Thu
  room
- Wm-os: Constraint Troubleshooting SOP — full lever lists
- Wm-os: Client Diagnostic Playbook (Runnable) — AI/ops full procedure
- Dashboard formulas: `docs/KPIS.md` in Mr. Waiz repo

## Quality bar

- [ ] Diagnosed top → bottom
- [ ] One primary constraint only
- [ ] Did not "fix" a healthy layer
- [ ] Success signal named to a band
- [ ] Gate A dispositions clean before trusting Show Rate / CPConv
