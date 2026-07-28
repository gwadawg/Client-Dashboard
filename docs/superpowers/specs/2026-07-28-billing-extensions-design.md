# Billing Extensions (Free Month)

Date: 2026-07-28  
Status: Approved for planning  
Surface: Admin → Client Billing (`BillingManager`)  
Ledger: `client_billings`

## Problem

Ops sometimes give a client a free month so they can get results and
stay. Today that is improvised with `$0` rows, discounts, or notes.
There is no first-class way to mark a due billing cycle as an
**extension**, so history and disposition of the monthly queue are
unclear.

## Goals

1. Let ops mark a due/scheduled (or issued) billing as an
   **extension** — a free month that still advances the billing cycle.
2. Keep the existing Manage panel intact (record payment, mark paid,
   adjust amounts, due date, issue, void).
3. Show an **Extension** badge in Admin Billing and Client File →
   Billing history.
4. Force `$0` collected when marked as extension.

## Non-goals

- Finance / CEO KPI changes or filtering extensions from Revenue in
  v1 (a `$0` row may still appear in the ledger)
- New `revenue_type` value
- Client-roster / pause-based skip without a ledger row
- Un-marking an extension (void + reschedule if wrong)
- Changing **Extend due date** (push due date only — different concept)

## Decisions locked

| Topic | Decision |
|-------|----------|
| Meaning | `$0` paid cycle; advances next billing date |
| Amount | Always force `$0` (all amount fields + `amount_paid`) |
| Finance v1 | No KPI / filter changes |
| Data model | Boolean `is_extension` on `client_billings` |
| UX | **Mark as extension** button only (no checkbox) |
| Existing UI | Additive — no removals from Manage panel |
| Row handling | Flip the existing due row (one PATCH) |
| First payment | Extensions never set `is_first_payment` |
| Naming | Label **Extension** / **Mark as extension**; keep **Extend due date** separate |

## Data model

Add to `client_billings`:

| Column | Notes |
|--------|-------|
| `is_extension` | `boolean not null default false` |

Mirror in `supabase/schema.sql`. Migration under
`supabase/migrations/`.

Thread through:

- `BILLING_LEDGER_FIELDS` in `src/lib/billing-revenue.ts`
- `Billing` type in `src/components/billing/billing-types.ts`

## Behavior

When ops clicks **Mark as extension** on a billing row:

1. Set `is_extension = true`
2. Zero `base_amount`, `performance_amount`, `late_fee`, `discount`,
   `amount`, `amount_paid`
3. Set `status = paid`
4. Set `paid_on` to today if unset
5. Do **not** set `is_first_payment`
6. Append `billing_events` audit (same path as other PATCH updates)

Next billing date continues to derive from recorded (non-voided,
non-scheduled) rows — an extension advances the cycle like any other
paid disposition.

Optional `note` remains available via existing note fields / later
edit; not required to mark extension.

## API

- `PATCH /api/billings/[id]` — accept `is_extension`
  - When `is_extension: true`, apply the zero + paid behavior above
    (server-enforced, not UI-only)
- `POST /api/billings` — accept `is_extension` for completeness;
  same zeroing rules if true
- Auth unchanged: `admin_billing` + revenue permission for dollar
  writes

## UI

### Admin → Client Billing

In the existing Manage panel (scheduled and issued editors), add
**Mark as extension** next to **Mark fully paid** / record-payment
actions.

- Does not remove Record payment, Mark fully paid, Adjust amounts,
  Due date, Issue billing, or Void
- After mark: row shows **Extension** in the status/meta line (same
  area as “first payment”)

### Client File → Billing

Show an **Extension** badge on history rows where
`is_extension` is true.

### Finance / CEO

Unchanged in v1.

## Edge cases

| Case | Handling |
|------|----------|
| Already-paid row marked extension | Allowed: zero amounts, set flag + paid |
| Wrong mark | Void + reschedule (no un-mark in v1) |
| `is_first_payment` | Always false for extensions |
| Revenue ledger | May list `$0` extension lines until a later Finance filter |

## Testing (manual)

1. Schedule or open a due billing → **Mark as extension** → amounts
   `$0`, status paid, badge shows, next billing date advances.
2. Confirm existing actions still work on a non-extension row.
3. Confirm Client File history shows the Extension badge.
4. Confirm Extend due date still only changes due date.

## Docs

Short section in `docs/CLIENT_BILLING.md` describing extensions vs
extend-due-date and the `$0` paid-cycle behavior.
