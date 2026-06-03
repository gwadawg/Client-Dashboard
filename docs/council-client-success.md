# LLM Council Verdict — Client Success KPI Measurement & Timeline

**Method:** 5 independent advisors (Contrarian, First Principles, Expansionist, Outsider, Executor) → anonymized peer review → chairman synthesis. Based on the Karpathy LLM Council methodology.

**Companion:** [`docs/CLIENT-SUCCESS-AUDIT.md`](CLIENT-SUCCESS-AUDIT.md)

**Question stress-tested:** (1) How to view the timeline (overall vs recent) while handling the 3-7 day result lag; (2) which KPIs + thresholds define an "underperforming" client.

---

## Post-council correction (verdict metric & booking rate)

The council was framed with the verdict metric described as "CPConv/CPS." After the session, the team flagged a definition error that changes the conclusion in the team's favor:

- **The true verdict metric is CPConv = `ad_spend ÷ (live_transfers + shows + claimed)`** — not CPS (`ad_spend ÷ shows`). The grading engine (`client-health.ts:155-156`) currently mislabels shows-only CPS as "CPConv." The correct conversation-inclusive metric already exists as `cp_conversation` (`metrics.ts:213`) but is unused by the grader.
- **Booking Rate must not stand alone.** A client converting qualified leads via **live transfers** (or `claimed`) will show a low booking rate yet be performing well, because live transfers skip the appointment. Booking rate alone over-flags these clients.

**How this updates the council's reasoning:** the Contrarian's strongest objection — "anchoring on CPS is a trap because it's the lowest-volume, most lag-poisoned metric (grades on ≥1 show)" — is **substantially defused by using true CPConv**: conversations (shows + live transfers + claimed) are *more numerous* and *resolve faster* than shows alone, so the conversation-inclusive north-star is both more robust and less lag-sensitive. Everywhere below that says "CPS/CPConv north-star," read it as **true CPConv (conversation-inclusive)**, and add "credit the live-transfer/claimed path in the booking/conversion view" as a prerequisite correctness fix.

---

## The framed question

A call-center reporting agency grades each client's health on a Client Success tab to spot underperformers. Today: 8 fixed-threshold KPIs, the client badge = its single WORST KPI tier, tiny min-volume guards (Show% grades on ≥3 booked, CPS on ≥1 show), and "All Time" is broken. Lagging KPIs (Show%, Close%, CPS) can't mature for 3-14 days, so recent windows make healthy clients look like they're slipping. Decide how to view overall-vs-recent with correct lag handling, and how to define "underperforming."

---

## Advisor positions (de-anonymized)

- **Contrarian (Response C):** The real problem is **cohort accounting**, not display. Show%/CPS must be keyed to the booking cohort's **appointment date**, not the event-ingest date — otherwise every windowing trick relabels the same garbage. CPS as north-star is a trap (most lag-poisoned, lowest-volume). Worst-tier→weighted-average risks *hiding* a dying KPI = silent churn. Per-client/peer targets at these volumes are statistical fiction. Demands: the actual per-client lag distribution and how many clients clear min-volume in 7 days.
- **First Principles (Response E):** The dashboard is a **triage queue, not a report card** — "call this client before they fire us." Underperformance is a **derivative (trajectory), not a level**. Split into two instruments: **Baseline** (the verdict, computed only on matured data — never grade what hasn't happened) and **Recent** (the alarm, leading indicators only that move before revenue). Never put a lagging KPI on a 7-day window.
- **Expansionist (Response A):** Lag is a **forecasting engine**, not a bug. Model maturation curves (Day-2 Show% → Day-10), project outcomes early, build per-client/per-vertical benchmark moat, predictive churn scoring, and a client-facing "maturing" trust badge.
- **Outsider (Response B):** The **jargon is opaque** — "911," "attention score," "CPConv/verdict metric/CPS" (three names, one thing). Grading by the single worst KPI makes everyone look broken. Show two plain numbers — "overall" vs "lately" — with too-recent data greyed out and labeled "too soon to tell."
- **Executor (Response D):** **Monday plan, by impact-per-effort.** Hour 1: fix "All Time" (a ternary), raise min-volume guards. Hours 2-4: maturity-aware lagging KPIs (exclude last-N-day cohorts from Show%/Close%/CPS — one WHERE clause × 3 calcs). Day 2: timezone. Defer the rest; wire a cheap "maturing" badge using data already computed.

---

## Where the Council Agrees (high-confidence)

1. **Stop grading the future.** The recency false-alarm is the #1 problem, and it is caused by scoring lagging KPIs (Show%, Close%, CPS) on cohorts that physically cannot have resolved yet. Four of five advisors converged here independently.
2. **Kill "worst-tier-wins."** Letting one noisy, low-volume KPI condemn an entire client is the second structural flaw. It makes healthy clients read as "911" and erodes trust in the badge.
3. **Min-volume guards are far too low** (≥1 show for CPS, ≥3 booked for Show%). Verdicts are driven by statistical noise.
4. **Separate "overall health" from "recent change."** Both First Principles and Outsider land on the same UI: a baseline number next to a recent number, with immature data visibly marked provisional.
5. **CPConv (conversation-inclusive) is the right economic north-star.** It should anchor the matured *verdict*, not fire the recent *alarm* (leading indicators do that). Note (per the correction above): using **true CPConv** — `÷ (live_transfers + shows + claimed)` rather than shows-only CPS — gives it more volume and faster resolution, so it is a far more robust verdict metric than the shows-only number the Contrarian rightly criticized.

## Where the Council Clashes

- **Re-key cohorts (Contrarian) vs. exclude immature cohorts (Executor).** The Contrarian says you must attribute Show%/CPS to the appointment's `scheduled_at` date, or every fix is cosmetic. The Executor says just exclude the last N days from the denominator — a one-line change. *Why reasonable people differ:* re-keying is the more correct model but a bigger build; exclusion kills ~90% of the false alarms immediately. They are not mutually exclusive — exclusion now, re-keying as the durable fix.
- **Build the forecasting moat now (Expansionist) vs. don't (everyone else).** The Expansionist sees a churn-prediction/benchmarking product. The peer review was nearly unanimous that this is the **biggest blind spot**: maturation curves and per-client benchmarks are statistical fiction at these volumes and on mis-keyed data. *Verdict: the upside is real but premature — it's phase 3, not phase 1.*
- **Relative/per-client thresholds (First Principles) vs. global bands (status quo).** First Principles wants deltas vs each client's own trailing baseline; the Contrarian warns per-client/peer baselines are noise at low volume. *Resolution: trajectory-based alarms yes, full per-client statistical baselines no — not yet.*

## Blind Spots the Council Caught (emerged in peer review)

1. **Nobody validated that the thresholds actually predict churn.** The whole system assumes a "Failing" Show% means a client is at risk — but that link was never tested against clients who actually left. Calibrate tiers against real outcomes.
2. **No defined action loop.** It's called a triage queue, but no advisor specified *who* acts on a flag, the escalation path, or the cost of a false positive (calling a healthy client "underperforming" and breaking a working funnel).
3. **The lag distribution is unknown.** Everyone assumed "3-14 days" — nobody measured it. The actual per-client maturation distribution gates whether any of this is statistically real, and what N to use.
4. **Upstream data integrity is unverified.** Make.com/GHL ingestion gaps, duplicate/missing show/no_show events, and manual `is_qualified` tagging lag would make cohort keying, maturity windows, and baselines all "confidently wrong."
5. **"Show%" is ambiguous** — `shows ÷ booked` vs `shows ÷ (shows + no_shows)` mature at different rates and answer different questions.

## The Recommendation

**Adopt a two-instrument model — a matured "Baseline" verdict and a leading-indicator "Recent" alarm — and stop scoring lagging KPIs on short windows. Sequence it the Executor's way, but treat cohort re-keying (Contrarian) as the durable fix, not the band-aid.**

Concretely, in order:

1. **Measure first (gate everything).** Pull the actual per-client lag distribution: for resolved appointments, days from `occurred_at`/booking to `scheduled_at` to outcome. This sets N and tells you how many clients clear a credible min-volume in 7/14/30 days. Do **not** design windows on a guessed "3-7 days."
2. **Quick wins (days):** fix "All Time" (open-ended range = your real baseline), raise min-volume guards (Show% ≥10 booked, CPS ≥5 shows, Close% ≥10 shows), and exclude last-N-day cohorts from the lagging-KPI denominators. This kills the bulk of false alarms immediately.
3. **Fix the definitions (prerequisite correctness, do alongside step 2):** switch the verdict field from shows-only CPS to **true CPConv** (`cp_conversation` = `÷ (live_transfers + shows + claimed)`), and credit the **live-transfer/claimed conversion path** so booking-rate doesn't falsely flag live-transfer-heavy clients. Without this, the verdict metric and the call-center constraint inference are wrong for a whole class of clients.
4. **Restructure the verdict:** Baseline tab = lagging KPIs on **matured cohorts only**, anchored on **true CPConv**. Recent tab = **leading indicators only** (dials, pickup, lead-to-qualified, booking) for drop-off alarms. Replace "worst-tier-wins" with the existing weighted attention score plus a hard "any critical KPI ≥ min-volume" override so a genuinely dying KPI can't hide.
5. **Durable fix:** re-key Show%/CPConv to the appointment cohort date so the numbers are right at the source, then relabel jargon ("911"→"Critical", and stop calling shows-only CPS "CPConv") for the humans reading it.
6. **Later (only after volumes/keys are sound):** maturation-curve forecasting, per-client baselines, and the client-facing scorecard the Expansionist described.

## The One Thing to Do First

**Run the lag-distribution analysis on resolved appointments** (booking date → outcome date, per client). Until you know the real maturation curve and how many clients clear min-volume in each window, every threshold, window size, and "maturing" cutoff is a guess — and you'd be automating panic on unfalsifiable data.
