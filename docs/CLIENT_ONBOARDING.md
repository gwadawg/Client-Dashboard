# Client Onboarding (Mr. Waiz)

Automated new-client provisioning: **GHL New Client Form → Make.com → Mr. Waiz → ClickUp Client Hub**.

Mr. Waiz (Supabase `clients` table) is the **reporting master record**. ClickUp remains the **task execution layer** for the 7-phase onboarding SOP.

## Flow

1. Closer submits the **GHL New Client Form** after payment.
2. **Make.com** calls Mr. Waiz: `POST /api/admin/onboard`.
3. Mr. Waiz upserts the client (`lifecycle_status: onboarding`), links the ClickUp task, **auto-records new cash collected** as a paid billing, and logs the sales call recording.
4. Make continues with GHL contact creation, Slack channels, manager assignment — using `client_id` and `clickup_task_id` from the response.

See [`make-blueprints/ccm-new-client-onboard.blueprint.json`](../make-blueprints/ccm-new-client-onboard.blueprint.json) for the HTTP module payload shape.

## What you have at sign-up (field mapping)

| Sign-up data | Payload field | Stored in Mr. Waiz |
|--------------|---------------|-------------------|
| Name | `name` | `clients.name` + `primary_contact_name` |
| Email | `email` | `email`, `billing_email` |
| Phone | `phone` | `phone` |
| ClickUp task id | `clickup_task_id` | `clickup_task_id` (links existing Hub task; does **not** create a new one) |
| Slack ID | `slack_id` | `slack_id` |
| Cash collected | `cash_collected` | **Auto-created** paid row in `client_billings` (ref `onboard-signing`) — no manual Client Billing entry needed |
| Contract term | `contract_term_months` | `contract_term_months` |
| PIF or monthly | `billing_type` | `billing_type` (`monthly`, `pif`, or `pif_monthly`) |
| MRR | `mrr` | `mrr` |
| Source | `source` | `source` |
| Offer | `offer` | `offer` + `reporting_type` (`RM` or `HE`) |
| Date signed | `date_signed` | `date_signed` |
| Sales call recording | `sales_call_recording` | `client_calls` row (`call_type: other`, notes: Sales call) |

**Not available at sign-up** (fill later in Client Roster / client file): NMLS, brokerage, licensed states, timezone, GHL location id, launch date, etc.

### Name field note

At sign-up, `name` is usually the **client contact name** (same value lands in `primary_contact_name`). When the GHL sub-account is created, update `clients.name` in the roster to match the **GHL location name** so lead webhooks match.

## Environment variables

Add to `.env.local` (and Railway):

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_WEBHOOK_SECRET` | Yes | Bearer token for `/api/admin/onboard` and other webhook routes |
| `CLICKUP_API_TOKEN` | If auto-creating Hub tasks | Only needed when `clickup_task_id` is **not** sent |
| `CLICKUP_CLIENT_HUB_LIST_ID` | No | Client Hub list id (default: `901314164414`) |

## API: POST /api/admin/onboard

**Auth:** `Authorization: Bearer <ADMIN_WEBHOOK_SECRET>`

**Required field:** `name`

**Sign-up payload (recommended Make JSON):**

```json
{
  "name": "{{1.name}}",
  "email": "{{1.email}}",
  "phone": "{{1.phone}}",
  "clickup_task_id": "{{1.clickup_task_id}}",
  "slack_id": "{{1.slack_id}}",
  "cash_collected": "{{1.cash_collected}}",
  "contract_term_months": "{{1.contract_term}}",
  "billing_type": "{{1.billing_type}}",
  "mrr": "{{1.mrr}}",
  "source": "{{1.source}}",
  "offer": "{{1.offer}}",
  "date_signed": "{{1.date_signed}}",
  "sales_call_recording": "{{1.sales_call_recording}}"
}
```

**Field aliases accepted:**

| Payload | Also accepts |
|---------|--------------|
| `name` | `agency_name`, `business_name` |
| `primary_contact_name` | `client_name`, `primary_contact` (defaults to `name`) |
| `clickup_task_id` | `clickup_id`, `clickup_client_id` |
| `slack_id` | `slackId` |
| `cash_collected` | `cash_collected_amount` |
| `sales_call_recording` | `sales_call_url`, `sales_call_recording_url` |
| `contract_term_months` | (send as integer from form) |
| `offer` / `reporting_type` | Normalized to `RM` or `HE` |
| `billing_type` | `monthly`, `pif`, `pif_monthly` (labels like "PIF" are normalized) |
| `lifecycle_status` | Default: `onboarding` |

**Upsert logic:** matches existing client by `clickup_task_id`, then `email`, then `name` + `date_signed`, then `name` alone. Re-sending the same payload updates fields and idempotently refreshes the signing billing + sales call link.

**Response:**

```json
{
  "client_id": "uuid",
  "client": { "...": "..." },
  "clickup_task_id": "86abc123",
  "clickup_task_url": "https://app.clickup.com/t/86abc123",
  "billing_id": "uuid",
  "sales_call_id": "uuid",
  "created": true
}
```

## Webhook client resolution

Lead/event webhooks (`POST /api/webhooks`) resolve clients in this order:

1. `client_id` (if provided)
2. `ghl_location_id` / `location_id`
3. `client_name` (exact match on `clients.name`)

After GHL sub-account setup, update `clients.name` and set `ghl_location_id` so lead events ingest correctly.

## Manual corrections

Use **Admin → Client Roster** and **Open file** for anything missing at sign-up. Cash collected appears under **Client Billing** and the client file ledger; the sales call appears under **Client Calls**.

## Verification

1. Submit a test New Client Form → confirm Supabase row with `lifecycle_status: onboarding`.
2. Confirm `clickup_task_id`, `slack_id`, and signing fields are populated.
3. Confirm a paid `client_billings` row exists for cash collected.
4. Confirm the sales recording appears in **Client Calls**.
5. CEO Dashboard **New Clients Signed** reflects `date_signed`.
