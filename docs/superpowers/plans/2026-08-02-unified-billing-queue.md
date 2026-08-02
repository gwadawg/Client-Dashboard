# Unified Billing Queue — Implementation Plan

Date: 2026-08-02
Spec: `docs/superpowers/specs/2026-08-02-unified-billing-queue-design.md`

## Overview

Merge Fixed + Performance into one Client Billing queue.
Replace monthly “unscheduled / File billing” with **locked cadence**
(day-of-month set once). Add live-transfer counts to performance
cycles and the billing work report. Conversations =
shows + live transfers at `pay_per_show`.

## Task 1 — Migration + schema

Files:

- `supabase/migrations/add_billing_cycle_live_transfers.sql`
- `supabase/schema.sql` (mirror)

```sql
alter table client_billing_cycles
  add column if not exists live_transfer_count int not null default 0;
```

No new client columns. Lock is derived (see Task 2).

## Task 2 — Cadence helpers (`src/lib/billing.ts` + billing-model)

Add shared helpers (new file ok:
`src/lib/billing-cadence.ts` if `billing.ts` is crowded):

1. **`isCadenceLocked(client)`**
   - `billing_day` in 1–31
   - `billing_model` is `fixed` or `performance`
   - Performance: `pay_per_show != null` **or**
     `pay_per_bailed != null` (at least one rate when they use
     performance; base/`mrr` may be 0)
   - Fixed: `mrr` may be enough with day; keep aligned with
     existing “billing configured” checks where possible

2. **`dueDateForMonth(year, monthIndex, billing_day)`** —
   clamp day to month length (reuse existing clamp logic)

3. **`openCadenceMonths(client, billings|cycles, today)`** —
   months that still need disposition:
   - Start from earliest unpaid/open month (or current month if
     never billed / no open cycle)
   - Include every month through the current month whose
     `dueDateForMonth` is on or before “next upcoming horizon”
     (e.g. today + 45 days) **and** has no completed disposition
   - Fixed completed = paid / extension / voided ledger for that
     period (or paid covering that due month)
   - Performance completed = cycle `billed` (or voided) for that
     period
   - **Do not** skip a late month when computing the next due —
     late June stays open when July appears

4. Update / document `computeNextBillingDate`: for locked clients,
   prefer next open cadence due date (not “always +1 month from
   last paid” when prior months are still open). Keep PIF behavior.

5. **`computePerformanceAmount`** — accept
   `live_transfer_count`; formula:

   ```text
   (show_count + live_transfer_count) * pay_per_show
   + bailed_count * pay_per_bailed
   ```

Unit tests: `src/lib/billing-cadence.test.ts` (or extend existing
billing tests) for lock detection, clamp, late+current months,
conversation math.

## Task 3 — Billing cycles API

Files:

- `src/app/api/billing-cycles/route.ts`
- `src/app/api/billing-cycles/[id]/route.ts`

- Add `live_transfer_count` to `CYCLE_FIELDS` select/insert/patch
- Recompute `performance_amount` with new formula on create/update
- Optional **ensure** endpoint or POST body flag
  `{ ensure_current: true, client_id }` that creates a draft cycle
  for the current calendar month if none open (defaults from
  client `mrr` / `pay_per_show` / `pay_per_bailed`)

## Task 4 — Billing work report (live transfers)

Files:

- `src/lib/billing-work-report.ts`
- `src/app/api/report/billing-work/route.ts`
- `src/app/report/[token]/billing/page.tsx`

1. Load `live_transfer` events in period (same client scope as
   shows / LO bails).
2. Unique billable LT count per lead (mirror show uniqueness;
   document interaction: if lead also has unique show, still count
   LT separately for conversation billing — shows and LTs are both
   conversations unless product later says otherwise; **v1: count
   both** when both occurred).
3. Summary fields: `live_transfers`, `unique_live_transfers`.
4. Charges: conversation units =
   `unique_shows + unique_live_transfers` at `pay_per_show`;
   bailed unchanged; expose `live_transfer_count` /
   `filed_live_transfer_count` alongside shows.
5. Page UI: summary card + table section for live transfers;
   charge line shows conversations breakdown.
6. Pull live counts (Manage) sets Shows, Live transfers, Bailed
   from summary unique fields.

## Task 5 — Types + billing UI primitives

Files:

- `src/components/billing/billing-types.ts`
- `src/components/billing/PerformanceBilling.tsx` (extract pieces)
- Prefer extracting:
  - `PerfCycleEditor` (Manage body)
  - `PerfSetupFields` (rates + day + model) for Setup table

Extend `BillingCycle` with `live_transfer_count`.
Add work-row kinds if needed:

- `pending_setup` — active, not locked → **Set up billing**
- `cadence_due` — locked Fixed month with no ledger row yet
  (replaces `schedule_prompt` / “unscheduled”)
- Keep `recorded` for real `client_billings` rows
- Performance: row backed by cycle (`perf_cycle`) or
  `cadence_due` that ensures cycle on Manage open

Drop copy: “unscheduled”, “File billing”, “No billing filed for
this cycle.”

## Task 6 — Unified `BillingManager` queue

File: `src/components/BillingManager.tsx`

1. Remove top `ViewHub` tabs Fixed / Performance.
2. Sub-views: Queue | Paid | Inactive | Setup (both models).
3. Build **one** `pastDue` / `upcoming` / `paid` from:
   - Fixed locked: open ledger rows + `cadence_due` for open
     months without a row
   - Performance locked: open cycles (effective status) + ensure
     missing current-month draft via API when Manage opens (or
     queue load batch ensure)
   - Pending (either model): `pending_setup` rows (not mixed into
     Past due as overdue — bucket Upcoming or a thin Pending
     strip at top of Queue)
4. Columns: Client · Offer · **Model** · Amount · Paid · Balance ·
   Due · When · Status · Action
5. Due / When always use cadence or row due date; overdue dates
   must land in **Past due**, never Upcoming with “N days ago”.
6. Manage expand:
   - Fixed → existing schedule/pay/extension editors; creating the
     month’s row uses locked `billing_day` as due (no separate
     monthly disposition ritual)
   - Performance → `PerfCycleEditor` (period, shows, LTs, bailed,
     Save, Pull live counts, Open work report, KPI report,
     report-sent workflow)
7. Setup table: all active clients (fixed + performance); day
   labeled by model; `$/conversation` label on `pay_per_show`;
   `$/bailed`; base; model dropdown; pause/churn actions.
8. Paid / Inactive: include both models.

## Task 7 — Docs

- `docs/CLIENT_BILLING.md` — locked cadence, unified queue,
  Pending vs locked, conversation billing, work report links,
  remove “schedule every month” language
- Spec status can stay “Approved for planning” until ship

## Verify (manual)

1. Client with `billing_day` set: **no** “unscheduled”; shows due
   on that day; Past due if date passed without disposition.
2. New client missing day: **Pending** → Set up billing → locks.
3. Leave June unpaid into July: both months visible; July due day
   unchanged.
4. Performance: Shows 10 + LT 5 @ $30 → $450 conversations; bailed
   separate; work report + pull counts agree.
5. Open work report / KPI report links still work from Manage.
6. Mark report sent → 3-day objection → ready → Bill writes
   `client_billings`.
7. Pause / churn remove from live queue; settings retained on
   pause.

## Suggested PR order

1. Tasks 1–2 (schema + helpers + tests)  
2. Tasks 3–4 (API + work report)  
3. Tasks 5–6 (UI unification)  
4. Task 7 (docs)

Ship behind no feature flag; cut over the Admin Billing tab in
one UI PR after helpers land.
