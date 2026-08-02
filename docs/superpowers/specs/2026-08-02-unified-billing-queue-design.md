# Unified Client Billing Queue + Locked Cadence

Date: 2026-08-02
Status: Implemented (ready for QA)
Surface: Admin → Client Billing (`BillingManager`,
`PerformanceBilling`)
Ledger: `client_billings` + `client_billing_cycles` (performance
workflow only)

## Problem

Performance billing is split from Fixed retainer into a separate
tab. Rates sit in a configuration table while cycle totals appear
as disconnected figures in status queues. Ops cannot clearly see
**when a report is due**, enter **shows / live transfers / bailed**
in one place, or open the itemized **billing work report** without
context switching.

Fixed retainer’s queue compounds confusion: clients with a known
due day show as **unscheduled** / “File billing” every month, even
though most already have a billing day. That implies ops must
re-schedule every cycle, which is not how the business works.

## Goals

1. **One Client Billing queue** for Fixed and Performance (mixed
   list, model badge, sorted by due date).
2. **Lock billing cadence once** per client (day of month + model +
   rates). After lock, the same day-of-month is always due until
   pause or churn — even if a prior month is late.
3. Remove the monthly **unscheduled / File billing** loop for
   locked clients.
4. Performance Manage panel: enter **Shows**, **Live transfers**,
   **Bailed**; bill conversations = shows + LTs at one rate;
   bailed at its own rate.
5. Keep and surface the existing **billing work report**
   (`/report/[token]/billing`), KPI report link, and **Pull live
   counts**.
6. Demote rate editing to **Setup**; queue is the ops worklist.

## Non-goals

- Collapsing performance cycles into `client_billings` only
- Stripe auto-charge / invoice sync
- CEO Finance KPI changes
- Auto-applying pulled counts without an explicit Pull + Save
- Top-level Fixed / Performance tabs (removed in favor of one
  queue)

## Decisions locked

| Topic | Decision |
|-------|----------|
| UI shape | Approach 1: unified queue; cycles stay under the hood for performance |
| List mix | One Past due / Upcoming list; Fixed + Performance; model badge |
| Cadence | Disposition once (day + model + rates) → locked until pause/churn |
| Due day | Reuse `clients.billing_day`; UI label “Billing day” (Fixed) / “Report due day” (Performance) |
| Late months | Due day does not shift; multiple open months allowed |
| Conversations | Shows + live transfers share `$/conversation` (= stored `pay_per_show`) |
| Bailed | Separate count + `pay_per_bailed` |
| Count entry | Separate Shows + Live transfers fields; sum into conversations |
| Work report | Keep `/report/{share_token}/billing`; extend for live transfers |
| Pending | New / undispositioned clients only (missing locked day or required rates) |
| Status label | Drop “unscheduled”; use **Pending** (needs disposition) or real workflow statuses |

## Architecture

```text
Admin → Client Billing
  ├── Queue (Past due | Upcoming)     ← mixed Fixed + Performance
  ├── Paid
  ├── Inactive (paused / churned)
  └── Setup (rates, model, day, lock)

Fixed work row  → client_billings open period for month
Performance row → client_billing_cycles (draft → report_sent →
                  ready_to_bill → billed) → client_billings on Bill
Work report     → /report/[token]/billing (+ pull counts API)
```

### Due date derivation

| Model | Due date meaning | Source |
|-------|------------------|--------|
| Fixed | Invoice / collection due | Locked `billing_day` in the open month |
| Performance | Report due | Same locked `billing_day` for the cycle’s month |

Past due / Upcoming bucketing uses that date for both models.
Relative “when” labels follow the same date (overdue stays Past
due, not Upcoming).

### Locked vs pending

A client is **locked** when:

- `billing_model` is set (`fixed` or `performance`)
- `billing_day` is set (1–31)
- For performance: `pay_per_show` (conversation rate) is set when
  they bill on conversations; `pay_per_bailed` set when they bill
  bails (base/`mrr` may be 0)

A client is **Pending** when active, not billing-paused, and not
locked. Pending clients appear only under **Setup** (not Past Due /
Upcoming). No monthly File billing prompt after lock.

Migration of today’s “unscheduled” rows: if day (+ rates as
required) already exist → treat as locked immediately.

## Data model

### Clients (Setup)

| Field | Role |
|-------|------|
| `billing_model` | `fixed` \| `performance` |
| `billing_day` | Locked day-of-month |
| `mrr` | Base retainer (may be 0 for pure performance) |
| `pay_per_show` | **$/conversation** (shows + live transfers) |
| `pay_per_bailed` | $/bailed |

No separate `pay_per_live_transfer` on clients in v1.

Optional explicit flag `billing_cadence_locked` is **not**
required if lock is derived from day + model + rates; prefer
derived lock to avoid dual state. Document the derivation in code
and `docs/CLIENT_BILLING.md`.

### `client_billing_cycles`

Add:

| Column | Notes |
|--------|-------|
| `live_transfer_count` | `int not null default 0` |

Performance amount:

```text
conversations = show_count + live_transfer_count
performance_amount =
  conversations * pay_per_show
  + bailed_count * pay_per_bailed
total = max(0, base_amount + performance_amount - discount)
```

Update `computePerformanceAmount` in `src/lib/billing-model.ts`
to accept live transfer count (or a conversations total). Keep
API field name `pay_per_show` in DB for compatibility; UI label
**$/conversation**.

### Billing work report

Extend `src/lib/billing-work-report.ts` and
`/api/report/billing-work`:

- Summarize unique billable **live transfers** in period (same
  uniqueness rules spirit as shows)
- Charges: conversation count = unique shows + unique live
  transfers at `pay_per_show`; bailed unchanged
- **Pull live counts** fills Shows, Live transfers, Bailed
- Public page `/report/[token]/billing` shows the new breakdown

## UI

### Queue columns

Client · Offer (existing) · Model badge · Amount · Paid · Balance ·
Due date · When · Status · Action

Performance amount may be provisional until counts are saved.
Status examples: Pending · Awaiting report · Objection window ·
Ready to bill · Scheduled · Overdue · Paid (Paid tab).

### Manage — Fixed

Unchanged: schedule/edit amounts, mark paid, extension, void.

For locked Fixed clients, opening the month does **not** require
a separate “File billing” disposition each time — create or open
the month’s ledger row from Manage when recording/paying, using
the locked day as due.

### Manage — Performance

- Period start/end
- Shows, Live transfers, Bailed
- Base, discount; cycle rate overrides optional
- Live total (conversations × rate + bailed × rate)
- **Save** · **Pull live counts** · **Open work report** ·
  **KPI report**
- Mark report sent → dispute / ready → Bill / Bill + mark paid ·
  Void

### Setup

Single configuration table for active clients (both models):

- Billing model dropdown
- Billing / report due day
- Base $, $/conversation, $/bailed (performance-relevant fields
  enabled when model is performance)
- Pause billing · Pause client · Churn

Remove the standalone Performance configuration block at the
bottom of the old Performance tab (folded into Setup).

## Behavior notes

1. **Auto month appearance:** Locked clients appear in Past due /
   Upcoming from the locked day each month without ops creating a
   schedule prompt.
2. **Performance cycle ensure:** When Manage opens (or queue loads)
   for a locked performance client with no open cycle for the
   current period, ensure a draft cycle for that month (defaults
   from client rates).
3. **Objection window:** Unchanged (3 days after report sent).
4. **Pause:** Remove from live queue; keep locked settings.
5. **Churn:** Remove from queue; void open cycles / scheduled
   billings per existing triggers; cadence ends.

## API / code touchpoints

- `BillingManager.tsx` — remove Fixed/Performance top tabs; merge
  queue builders; Pending vs locked; drop unscheduled copy
- `PerformanceBilling.tsx` — fold Manage into shared row editor or
  keep as panel component used from unified queue
- `src/lib/billing-model.ts` — conversation math + LT count
- `src/lib/billing.ts` / queue helpers — due from locked day;
  pending detection
- `GET/POST/PATCH` billing-cycles — `live_transfer_count`
- Billing work report lib + API + page — LT section / charges
- `docs/CLIENT_BILLING.md` — locked cadence + unified queue +
  conversation billing

Auth unchanged: admin billing + revenue capability for dollar
writes.

## Testing

- Locked Fixed client: appears on `billing_day` each month; no
  “unscheduled” after disposition
- Pending client: status Pending until day (+ rates) set
- Late June + July due: both visible; July due day unchanged
- Performance: Shows=10, LT=5, rate=$30 → conversation $450;
  bailed separate
- Pull live counts + work report totals match filed unique counts
- Mark report sent still opens 3-day objection → ready to bill →
  ledger row

## Migration

1. SQL: `live_transfer_count` on `client_billing_cycles`; mirror
   `schema.sql`
2. Treat existing clients with `billing_day` set as locked (no
   backfill flag)
3. UI cutover: single queue; deprecate Performance top tab
4. Doc update in same change set as implementation
