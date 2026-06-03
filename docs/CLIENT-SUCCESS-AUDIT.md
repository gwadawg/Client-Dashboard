# Client Success Tab — KPI Measurement Audit

**Scope:** How the Client Success (`client_health`) tab measures KPIs, flags underperforming clients, and handles the date/timeline filter. **Analysis only — no code changes in this pass.**

**Date:** June 2026
**Audited by:** Engineering + Performance Marketing review
**Companion doc:** [`docs/KPIS.md`](KPIS.md) (canonical KPI definitions), [`docs/council-client-success.md`](council-client-success.md) (LLM Council verdict, produced after this audit), [`docs/CLIENT-HEALTH-REDESIGN.md`](CLIENT-HEALTH-REDESIGN.md) (the build-ready redesign spec that acts on these findings)

---

## 0. TL;DR

The Client Success view is well-architected: a deterministic grading engine, current-vs-prior comparison, root-cause "constraint" inference, and a per-client timeline. Most KPI formulas are correct and match `docs/KPIS.md`.

**Two definition bugs to fix before anything else (flagged by the team):**

1. **The "verdict metric" is mislabeled.** The grading engine calls its north-star "CPConv" but actually computes `ad_spend ÷ shows` — that is **Cost Per Show (CPS)**, not Cost Per Conversation. The canonical CPConv (`docs/KPIS.md` L74) is `ad_spend ÷ (live_transfers + shows + claimed)`. The correct, conversation-inclusive metric already exists in code as `cp_conversation` ([`metrics.ts:213`](../src/lib/metrics.ts)) but **the health grader ignores it** and grades on shows only. This undercounts every client that converts via **live transfers** or **claimed** conversations rather than booked-and-shown appointments.
2. **Booking Rate punishes the live-transfer path.** Booking Rate = `booked ÷ qualified_leads` counts only booked appointments. A client that converts a lot of qualified leads through **live transfers** (a legitimate, often faster path that skips the appointment) will show a *low* booking rate while actually performing well. Judged on booking rate alone, that client looks like it's failing the call-center layer when it isn't. The fair denominator is conversation-based, not appointment-based.

The **second risk is in the time dimension, exactly as suspected:**

1. **You cannot see "overall" health at all.** "All Time" resolves to empty dates and the view loads nothing.
2. **Recent windows systematically punish clients** because the lagging KPIs (show, close, CPS) cannot have matured yet — appointments booked in the last few days haven't happened, so their outcomes are missing from the numerator while the booking sits in the denominator.
3. **No maturity/lag handling exists.** There is no 3-7 day buffer, no rolling average, and no "this cohort is still maturing" signal. The only recency tool is the equal-length prior-period trend.
4. **Local-vs-UTC date math** can shift edge events by a day, and `clients.timezone` is stored but never used.

Net effect: a healthy client can look like it's "slipping" on a Last-7-Days view purely because the week's appointments haven't occurred yet — and you have no clean "overall" baseline to sanity-check against.

---

## 1. Architecture map (what we audited)

| Layer | File | Role |
|-------|------|------|
| Nav entry | [`src/lib/nav.ts`](../src/lib/nav.ts) | `client_health` labeled "Client Success" |
| Host shell + date filter | [`src/components/DashboardView.tsx`](../src/components/DashboardView.tsx) | `getDateRange` (~L82-95) resolves the preset to `{start,end}` |
| Overview UI | [`src/components/ClientHealthDashboard.tsx`](../src/components/ClientHealthDashboard.tsx) | Summary cards, bar chart, sortable table |
| Drill-down UI | [`src/components/ClientHealthDetail.tsx`](../src/components/ClientHealthDetail.tsx) | Per-client funnel + timeline |
| **Grading engine** | [`src/lib/client-health.ts`](../src/lib/client-health.ts) | Thresholds, tiers, constraint inference, trend |
| KPI math | [`src/lib/metrics.ts`](../src/lib/metrics.ts) | `calculateMetrics` (all KPIs computed in JS) |
| API | [`src/app/api/client-health/route.ts`](../src/app/api/client-health/route.ts) | Current + prior snapshots per client |
| Timeline API | [`src/app/api/client-health/[clientId]/timeline/route.ts`](../src/app/api/client-health/%5BclientId%5D/timeline/route.ts) | Per-client weekly/daily drop-off chart |

All metrics are computed in **application TypeScript** (not SQL) from row-level `events`, capped at 200,000 rows per query for this view.

---

## 2. KPI inventory & correctness

The view grades **8 KPIs**. All formulas were verified against `calculateMetrics` and `docs/KPIS.md` and are **correct**.

| # | KPI | Formula (as coded) | Denominator | Source |
|---|-----|--------------------|-------------|--------|
| 1 | Lead → Qualified % | `qualified_leads / new_leads × 100` | all leads | `client-health.ts:149` |
| 2 | Pickup Rate % | `pickups / outbound_dials × 100` | all dials | `metrics.ts:219` |
| 3 | Booking Rate % | `booked / qualified_leads × 100` | **qualified** leads | `metrics.ts:188` |
| 4 | Show Rate % | `shows / booked × 100` | **all bookings** | `metrics.ts:192` |
| 5 | Close Rate % | `closed / shows × 100` | shows | `client-health.ts:151` |
| 6 | CPL $ | `ad_spend / leads` | leads | `metrics.ts:210` |
| 7 | CPQL $ | `ad_spend / qualified_leads` | qualified leads | `client-health.ts:153` |
| 8 | CPS $ (graded) | `ad_spend / shows` | shows | `metrics.ts:215` |

**Two "conversation" concepts exist in code — keep them straight:**

| Metric | Formula | Source | Used by health grader? |
|--------|---------|--------|------------------------|
| **CPS** (Cost Per Show) | `ad_spend ÷ shows` | `metrics.ts:215` (`cps`) | **Yes** — this is what gets graded |
| **CPConv** (Cost Per Conversation) — the *intended* verdict metric | `ad_spend ÷ (live_transfers + shows + claimed)` | `metrics.ts:213` (`cp_conversation`); `client_conversations` at `metrics.ts:180` | **No** — computed but ignored by grading |
| `cpconv` field in the snapshot (MISLABELED) | `ad_spend ÷ shows` | `client-health.ts:155-156` | drives the "verdict" text, but it is really CPS |

Also surfaced in the detail view: **Conversation Yield** (`shows ÷ qualified_leads`) — note this too is **shows-only** and excludes live transfers and claimed.

### Correctness notes / flags

- **Booking Rate denominator is qualified leads** (not all leads) — matches `docs/KPIS.md` L42. Correct, but note it means booking rate is only meaningful once qualification tagging has happened (a manual GHL step that can lag).
- **Booking Rate ignores the live-transfer conversion path.** `booked ÷ qualified_leads` only credits booked appointments. A qualified lead converted via a **live transfer** (or a `claimed` conversation) never books, so a client leaning on live transfers reads as a *low* booking rate while genuinely converting. The grader's constraint inference can then wrongly blame the "call center" layer. A conversation-inclusive view (e.g. `(booked + live_transfers) ÷ qualified_leads`, or grading on Conversation Yield computed against `client_conversations`) is the fair measure. **This must be reconciled with the CPConv fix — both stem from treating "show" as the only valid conversion.**
- **CPConv is mislabeled as CPS (the verdict-metric bug).** `client-health.ts:155-156` names the snapshot field `cpconv` and the comment calls it "the verdict metric," but the arithmetic is `ad_spend ÷ shows` (CPS). The conversation-inclusive `cp_conversation` (`ad_spend ÷ (live_transfers + shows + claimed)`, `metrics.ts:213`) is never used for grading. Net effect: clients converting via live transfers/claimed are penalized on the single most important metric. Fixing this also *raises the denominator*, which improves statistical robustness (more conversations than shows → less whipsaw — see §3 and §6).
- **Show Rate denominator is all bookings** (`shows ÷ booked`), not `shows ÷ (shows + no_shows)` — matches `docs/KPIS.md` L43. **This is the single biggest source of the recency distortion** (see §4): a freshly booked appointment is already in the denominator but cannot be in the numerator until it actually happens.
- **Out-of-state double source** ([`metrics.ts:133-135`](../src/lib/metrics.ts)): `out_of_state_leads` sums both `is_out_of_state` flags on `lead` rows **and** standalone `out_of_state_lead` events. If both are ingested for one lead, it double-counts. Not a Client Success grading input, but worth fixing for reporting accuracy.
- **Qualification is manual** (`docs/KPIS.md` L47): no automatic rule. So Lead→Qualified %, Booking Rate, and CPQL all depend on a human tagging leads in GHL, which is itself a lagging, inconsistent input.

---

## 3. Threshold review (how "underperforming" is defined today)

Each KPI is bucketed by hard-coded bands in `buildClientHealthSnapshot` ([`client-health.ts:161-209`](../src/lib/client-health.ts)) via `tierFromBands`. Tiers: **911 (critical) / Below KPI / At KPI / Above KPI / insufficient**.

| KPI | 911 (critical) | Below | At | Min volume to grade | Dir |
|-----|----------------|-------|-----|---------------------|-----|
| Lead→Qualified % | < 40 | < 50 | < 65 | 5 leads | higher better |
| Pickup % | < 20 | < 30 | < 45 | 20 dials | higher better |
| Booking % | < 20 | < 25 | < 30 | 5 qual leads | higher better |
| Show % | < 51 | < 56 | < 70 | 3 booked | higher better |
| Close % | < 10 | < 20 | < 35 | 3 shows | higher better |
| CPL $ | > 25 | > 20 | > 15 | 5 leads | lower better |
| CPQL $ | > 35 | > 30 | > 20 | 3 qual leads | lower better |
| CPS $ | > 225 | > 150 | > 80 | 1 show | lower better |

### Roll-up logic

- **Client status badge = the single WORST KPI tier** ([`client-health.ts:213-219`](../src/lib/client-health.ts)). One red KPI marks the whole client "911," even if the other seven are green.
- **Attention score** = sum of tier weights (critical=4, below=3, at=2, above=1) over graded KPIs ([`client-health.ts:221`](../src/lib/client-health.ts)).
- **Priority/sort score** = attention score + a spend boost (`log10(spend)/2`, capped 3) + 2 per critical KPI ([`client-health.ts:565-570`](../src/lib/client-health.ts)). Bigger-spend, more-broken clients float to the top. This is sensible triage logic.
- **Constraint inference** ([`client-health.ts:259-308`](../src/lib/client-health.ts)) classifies *why* a client is underperforming into one funnel layer (lead quality / lead cost / call center / show rate / data issue / healthy) and drives a plain-English playbook. Good design.

### Threshold concerns (inputs to the Council, not yet decided)

1. **Fixed, global bands.** Every client is graded against the same numbers regardless of vertical, geography, price point, or ramp stage. A new client in week 2 is judged against the same show-rate bar as a mature account.
2. **No per-client targets**, even though a partial `goals` table exists (`docs/KPIS.md` L262). No relative/peer benchmarking either.
3. **Min-volume guards are very low for the lagging KPIs.** Show rate grades on **≥3 bookings**, close rate on **≥3 shows**, CPS on **≥1 show**. A single show driving a CPS verdict is statistically meaningless and will whipsaw the badge.
4. **"Worst tier wins" is brittle.** Combined with low min-volume, one noisy lagging KPI can flip a healthy client to "911."
5. **CPS bands are absolute dollars.** $80/$150/$225 per show may be right for one vertical and absurd for another; no normalization.

---

## 4. Date / timeline review (the core concern)

### 4.1 The preset filter

`getDateRange` ([`DashboardView.tsx:82-95`](../src/components/DashboardView.tsx)):

```
this_month | last_month | last_30 | last_7 | all_time | custom
```

The Client Success view inherits `{start, end}` from this and re-fetches on change.

### 4.2 Confirmed defects

**(a) "All Time" shows nothing.** `all_time` returns `{ start: "", end: "" }`. The component bails (`if (!startDate || !endDate) return;`) and the API returns HTTP 400 (`route.ts:35-37`). **There is no working "overall baseline" view** — which is precisely the "are the overall KPIs good or bad?" question you want answered.

**(b) Local-vs-UTC mismatch.** Presets are built from the **local** clock (`new Date().getFullYear()/getMonth()`, `now.getTime() - N*86400000`) then sliced to a date string, but every query pins **UTC** boundaries (`${start}T00:00:00.000Z` … `T23:59:59.999Z`, `route.ts:58-59`). Near midnight this shifts edge events into the wrong day. `clients.timezone` exists in the schema but is **never used** in any metric query.

**(c) No attribution-lag / maturity handling.** There is no constant or window anywhere that says "ignore the last N days because results haven't landed." The only mitigation is that late show/no-show outcomes are back-dated to the booking's `occurred_at` ([`src/lib/appointments.ts`](../src/lib/appointments.ts)) — which keeps history honest but **does nothing for the recent window**: the outcome simply doesn't exist yet.

**(d) No rolling/trailing averages.** All windows are calendar slices. "Recent vs overall" exists only as the equal-length prior-period trend (`getPriorPeriod`, `compareHealthTrend`), and the trend is computed on the **attention-score delta (±2)** — not per-KPI deltas.

### 4.3 Why "recent" systematically understates lagging KPIs

This is the crux. Consider **Show Rate = shows ÷ booked** on a **Last 7 Days** window:

- An appointment booked on day 6 for a consult scheduled 5 days out is **counted in `booked`** (it occurred_at is in-window) but **cannot be a `show` yet** — the consult hasn't happened.
- So the recent window's numerator is structurally incomplete while the denominator is complete → **show rate reads artificially low**, then "recovers" days later as outcomes land.
- Same mechanic hits **Close Rate** (closes lag shows) and **CPS/CPConv** (spend is immediate, shows trail).

A client doing everything right will frequently render as "Slipping / Below KPI / 911" on a 7-day view, purely as a measurement artifact. This is the false-alarm engine the audit set out to find.

---

## 5. Leading vs lagging KPI classification

Grounding the lag discussion: how fast does each KPI's data fully materialize after the activity happens?

| Speed | KPIs | Why | Honest minimum window |
|-------|------|-----|-----------------------|
| **Leading** (same day – 48h) | Outbound Dials, Pickup %, Speed-to-Lead, Total Leads, CPL | Recorded at the moment of the call/lead; spend posts daily | Last 7 days is fine; even Last 1-3 days is directional |
| **Mid** (2–4 days) | Lead→Qualified %, Booking %, CPQL | Depend on manual qualification tagging + booking activity, both slightly delayed | Last 7-14 days |
| **Lagging** (3–14+ days) | Show %, Close %, CPS, CPConv, Conversation Yield | Gated by `scheduled_at` (appointment is in the future) and on outcomes/closes that resolve days later | Last 30 days, or maturity-filtered cohorts only |

Note on CPConv vs CPS for lag: **live transfers and claimed conversations resolve faster than shows** (they often happen same-day, not on a future appointment date). So the correct **CPConv** (`÷ (live_transfers + shows + claimed)`) is *less* lag-poisoned and higher-volume than the shows-only CPS the grader uses today — another reason to switch the verdict metric to true CPConv.

**Implication:** judging leading and lagging KPIs on the *same* window is the root design flaw. A correct view either (a) uses different windows per KPI class, or (b) excludes immature cohorts from the lagging KPIs.

---

## 6. Candidate options (inputs to the LLM Council — NOT yet decided)

### A. Timeline / "overall vs recent" viewing

- **A1 — Fix table-stakes first:** make "All Time" load (open-ended query), and align preset date math to a single timezone (use `clients.timezone` or a fixed business TZ). Low effort, unblocks the "overall" question.
- **A2 — Dual-window display:** show **Baseline** (e.g. 90-day or all-time) next to **Recent** (trailing 7/14) per client, with explicit deltas, so "good overall but slipping recently" is readable at a glance (per `kpi-dashboard-design`: always show context + comparison).
- **A3 — Maturity-aware lagging KPIs:** for Show/Close/CPS, only count cohorts old enough to have resolved (e.g. exclude appointments whose `scheduled_at` is in the future or within the last N days). Removes the artifact at the source.
- **A4 — "Maturing" indicator:** grey-out / annotate the most recent N days (3-7) as provisional rather than scoring them red.
- **A5 — Rolling trailing averages (7/14/30):** smooth daily noise instead of calendar buckets; pairs well with A2.
- **A6 — Split leading vs lagging windows:** leading KPIs on 7-day, lagging KPIs on 30-day, on the same screen.

### B. KPI set & "underperforming" definition

- **B0 — Fix the definitions first (prerequisite):** (a) make the verdict metric the true **CPConv** = `ad_spend ÷ (live_transfers + shows + claimed)` (use the existing `cp_conversation`), not shows-only CPS; (b) credit the **live-transfer/claimed conversion path** in (or alongside) Booking Rate so live-transfer-heavy clients aren't falsely flagged. These are not optional design choices — they are correctness fixes the team explicitly called out.
- **B1 — Trim headline KPIs to 5-7** (per `kpi-dashboard-design`) with the rest as drill-down, vs keep all 8 visible.
- **B2 — Anchor on a north-star: true CPConv** (conversation-inclusive). It is also higher-volume and less lag-poisoned than CPS, so it doubles as a more robust trigger than the current shows-only metric. Compare against the current equal-weight worst-tier roll-up.
- **B3 — Replace "worst tier wins"** with the weighted attention score (or a hybrid) so one noisy KPI can't flip a client to 911.
- **B4 — Raise min-volume guards** for lagging KPIs (e.g. show rate ≥ 10 booked, CPS ≥ 5 shows) so verdicts aren't driven by 1-3 events.
- **B5 — Per-client / relative targets:** use the `goals` table or peer percentiles instead of one global band set, optionally with a ramp grace period for new clients.

---

## 7. What's working well (keep)

- Deterministic, transparent grading (no black box).
- Current-vs-prior equal-length comparison with trend arrows.
- Root-cause constraint inference + plain-English playbooks with owners/timeboxes.
- Spend-weighted priority sort for triage.
- A per-client KPI timeline already exists for drop-off detection ([`timeline/route.ts`](../src/app/api/client-health/%5BclientId%5D/timeline/route.ts)) and recomputes rates per bucket (never averages rates — mathematically correct).

---

## 8. Open questions for the Council

1. How do we let the team see **overall health vs recent trend** simultaneously without the recency artifact? (Options A1-A6)
2. What is the **right definition of "underperforming"** — worst-tier, weighted score, or north-star-anchored? (Options B2-B3)
3. Are **8 KPIs the right set**, and should thresholds be **global, per-client, or relative**? (Options B1, B4-B5)
4. How do we handle the **3-7 day result lag** explicitly so we react to real drop-offs but not to measurement noise? (Options A3-A4)
5. **Definition correctness (prerequisite):** switch the verdict metric to true **CPConv** (`÷ live_transfers + shows + claimed`) and credit the live-transfer/claimed conversion path so a high-live-transfer client isn't flagged for a "bad" booking rate. (Option B0)
