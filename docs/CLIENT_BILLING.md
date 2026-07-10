# Client Billing

## Where to look

| Place | Job |
|-------|-----|
| **Admin → Client Billing** | Ops worklist: who to charge, schedule, mark paid, void. **Writes** the ledger. |
| **Executive → Finance** | CEO books: Overview KPIs, company **Revenue** ledger, **Expenses** (coming). Confidential; needs revenue permission. |
| **Client File → Billing** | Per-client charge history (opens from roster or Finance ledger). |
| **Supabase** | Source of truth: `client_billings`, `billing_events`, `stripe_invoices` (later `expenses`). |

You file charges in Client Billing; you review company cash in Finance. Do not enter the same client charge twice.

---

The **Admin → Client Billing** tab shows each client's billing dates, a computed
next-billing date with status (upcoming / due soon / overdue), company totals, and
the full history of every billing made. Waiz owns all billing data; ClickUp is
used only as the reminder channel.

CEO cash KPIs (**Executive → Finance → Overview**) and the company charge log
(**Finance → Revenue**) read the same `client_billings` ledger.
Every charge should carry revenue tags so new vs recurring cash, by-type
breakdowns, and net-of-fees stay accurate.

## 1. Database setup

Run these migrations (idempotent) in **Supabase SQL Editor** (or apply via MCP):

- `supabase/migrations/add_client_billings.sql` — ledger table
- `supabase/migrations/add_billing_revenue_fields.sql` — CEO revenue tags
- `supabase/migrations/billing_data_foundation.sql` — Stripe ids, `is_first_payment`,
  `billing_events` audit log, `stripe_invoices` staging

Mirrored in `supabase/schema.sql`.

## 2. CEO revenue field dictionary

| Field | Values / meaning |
|-------|------------------|
| `revenue_type` | `mrr` retainer · `pif` paid-in-full · `performance` · `passthrough` ad-spend · `upsell` · `one_off` |
| `revenue_segment` | `front_end` = new cash · `back_end` = recurring |
| `term_months` | Months covered (required when type is `pif`) |
| `processing_fee` | Stripe/processor fee; CEO “net of fees” = collected − fee |
| `passthrough_amount` | Ad-spend reimbursement (excluded from revenue totals) |
| `lead_source` | Defaults from `clients.source` when blank |
| `method` | `stripe` \| `card` \| `ach` \| `wire` \| `manual` |
| `stripe_invoice_id` | Stripe Invoice id (`in_…`) for mapping |
| `stripe_payment_intent_id` | Stripe PaymentIntent id (`pi_…`) |
| `is_first_payment` | True on the client’s first paid non-passthrough billing |

**New cash rule:** Prefer `revenue_segment = front_end`. On create/mark-paid, the
API auto-sets `front_end` + `is_first_payment` when the client has no prior paid
revenue billing. Finance Overview also computes `new_logo_cash` as a tagging-independent
cross-check (first-ever paid billing landing in the month).

**Commissions:** Processor fees live on `processing_fee`. Closer/setter
commissions stay in the agent commission system — not duplicated on invoice rows.

## 3. How "next billing date" is computed

Derived in `src/lib/billing.ts` (no stored value, so it never drifts):

| billing_type  | Next billing date |
|---------------|-------------------|
| `monthly`     | One month after the latest recorded billing, on the day-of-month from `billing_day` / launch. If never billed, the signing date. |
| `pif_monthly` | Same recurring rule as `monthly`. |
| `pif`         | None — paid in full is one-time. |

Status (`deriveStatus`): `overdue` if the next date is past, `due_soon` if within
7 days (`DUE_SOON_DAYS`), otherwise `upcoming`.

## 4. Editing billing fields

`billing_type`, `mrr`, `date_signed`, `contract_end_date`, `contract_term_months`,
and `daily_adspend` are editable from the tab (inline) and persist through
`PATCH /api/clients/[id]`.

## 5. Recording billings

Expand a client row to schedule, mark paid, or void:

- `POST /api/billings` — create a billing; **requires** `revenue_type` (defaults
  from client `billing_type` when omitted). Accepts segment, term months, fee,
  Stripe ids, note.
- `PATCH /api/billings/[id]` — edit / mark paid; logs `billing_events`
- `DELETE /api/billings/[id]` — **void** (`status: voided`); row retained for audit

Every create / update / payment / void appends a row to `billing_events`
(`created` \| `updated` \| `payment` \| `voided` \| `status_changed`) with a
before/after payload.

Voided billings are filtered out of next-billing math, CEO revenue, and client
file displays. Client File → Billing shows type, new/recurring, term, fee,
first-payment badge, and Stripe invoice id.

Shared defaults live in `src/lib/billing-revenue.ts` (`resolveRevenueDefaults`).

## 6. Stripe (structure ready — sync later)

Schema is ready; live webhook sync is **not** implemented yet.

| Piece | Role |
|-------|------|
| `client_billings.stripe_invoice_id` | Paste / map an Invoice id onto a charge |
| `stripe_invoices` | Staging table for future webhook payloads + match to client/billing |

When wiring Stripe next:

1. Add env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
2. Webhook handler upserts into `stripe_invoices`
3. Mapping UI links an unmatched invoice → create/update `client_billings` with
   tags + `stripe_invoice_id`

Until then, paste `in_…` into the Billing form when recording payment.

## 7. ClickUp reminders (daily trigger)

`POST /api/billings/reminders` finds every live client that is due soon / overdue
and creates a ClickUp task for each. Guarded by `ADMIN_WEBHOOK_SECRET` (Bearer).
Needs:

- `CLICKUP_API_TOKEN`
- `CLICKUP_BILLING_LIST_ID`

Deduped via `billing_reminder_log` (one reminder per client per reminder date).

```bash
curl -fsS -X POST https://YOUR_APP_URL/api/billings/reminders \
  -H "Authorization: Bearer $ADMIN_WEBHOOK_SECRET"
```
