# Client Billing

The **Admin → Client Billing** tab shows each client's billing dates, a computed
next-billing date with status (upcoming / due soon / overdue), company totals, and
the full append-only history of every billing made. Waiz owns all billing data;
ClickUp is used only as the reminder channel.

## 1. One-time database setup

Run the migration once in **Supabase Dashboard → SQL Editor → New query**:

- `supabase/migrations/add_client_billings.sql`

It creates the `client_billings` ledger table and its indexes. It is idempotent
(safe to re-run) and is also mirrored into `supabase/schema.sql`.

## 2. How "next billing date" is computed

Derived in `src/lib/billing.ts` (no stored value, so it never drifts):

| billing_type  | Next billing date |
|---------------|-------------------|
| `monthly`     | One month after the latest recorded billing, on the day-of-month from `date_signed`. If never billed, the signing date. |
| `pif_monthly` | Same recurring rule as `monthly`. |
| `pif`         | None — paid in full is one-time. |

Status (`deriveStatus`): `overdue` if the next date is past, `due_soon` if within
7 days (`DUE_SOON_DAYS`), otherwise `upcoming`.

## 3. Editing billing fields

`billing_type`, `mrr`, `date_signed`, `contract_end_date`, `contract_term_months`,
and `daily_adspend` are editable from the tab (inline) and persist through
`PATCH /api/clients/[id]`.

## 4. Recording billings

Expand a client row to record a billing, mark one paid, or void one:

- `POST /api/billings` — record a billing (`client_id`, `billed_on`, `amount`, …)
- `PATCH /api/billings/[id]` — edit / mark paid (status `paid` stamps `paid_on`)
- `DELETE /api/billings/[id]` — **void** a row (`status: voided`); the ledger row is retained for audit but excluded from totals

Voided billings are filtered out of next-billing math, CEO revenue, and client file displays.

## 5. ClickUp reminders (daily trigger)

`POST /api/billings/reminders` finds every live client that is due soon / overdue
and creates a ClickUp task for each. It is guarded by the shared
`ADMIN_WEBHOOK_SECRET` (Bearer), and needs two env vars (see [`.env.local.example`](../.env.local.example) and [`CLIENT_ONBOARDING.md`](CLIENT_ONBOARDING.md)):

- `CLICKUP_API_TOKEN`
- `CLICKUP_BILLING_LIST_ID`

New-client onboarding also uses `CLICKUP_CLIENT_HUB_LIST_ID` (see [`CLIENT_ONBOARDING.md`](CLIENT_ONBOARDING.md)).

Schedule it to run once a day with any external scheduler. Examples:

**Railway cron service** (separate service in the same project):

```bash
curl -fsS -X POST https://YOUR_APP_URL/api/billings/reminders \
  -H "Authorization: Bearer $ADMIN_WEBHOOK_SECRET"
```

**cron-job.org / GitHub Actions**: a daily job hitting the same URL with the
`Authorization: Bearer <ADMIN_WEBHOOK_SECRET>` header.

The endpoint returns `{ matched, created, errors }`.

> Note: it creates a task per due/overdue client on each run and does not yet
> dedupe across days. Run it once daily, or add a "reminder sent" guard if you
> increase the frequency.
