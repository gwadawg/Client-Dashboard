# Client Onboarding (Mr. Waiz)

Automated new-client provisioning: **GHL New Client Form → Make.com → Mr. Waiz → ClickUp Client Hub**.

Mr. Waiz (Supabase `clients` table) is the **reporting master record**. ClickUp remains the **task execution layer** for the 7-phase onboarding SOP.

## Flow

1. Closer submits the **GHL New Client Form** after payment.
2. **Make.com** calls Mr. Waiz first: `POST /api/admin/onboard`.
3. Mr. Waiz upserts the client (`lifecycle_status: new_account`), creates a **ClickUp Client Hub** task, stores `clickup_task_id`.
4. Make continues with GHL contact creation, Slack channels, manager assignment — using `client_id` and `clickup_task_id` from the response.

See [`make-blueprints/ccm-new-client-onboard.blueprint.json`](../make-blueprints/ccm-new-client-onboard.blueprint.json) for the HTTP module payload shape.

## Environment variables

Add to `.env.local` (and Railway):

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_WEBHOOK_SECRET` | Yes | Bearer token for `/api/admin/onboard` and other webhook routes |
| `CLICKUP_API_TOKEN` | Yes | ClickUp personal API token |
| `CLICKUP_CLIENT_HUB_LIST_ID` | No | Client Hub list id (default: `901314164414`) |
| `CLICKUP_BILLING_LIST_ID` | For billing reminders | Separate billing reminder list |
| `CLICKUP_ONBOARDING_LIST_ID` | Optional | Reserved for a separate onboarding checklist list (phase 2) |

## API: POST /api/admin/onboard

**Auth:** `Authorization: Bearer <ADMIN_WEBHOOK_SECRET>`

**Required field:** `name` (or `agency_name` / `business_name`)

**Optional fields** (map from GHL form in Make):

| Payload field | Supabase column |
|---------------|-----------------|
| `name` / `agency_name` / `business_name` | `name` |
| `primary_contact_name` / `client_name` | `primary_contact_name` |
| `email` | `email`, `billing_email` (if billing_email omitted) |
| `phone` | `phone` |
| `mrr` | `mrr` |
| `billing_type` | `billing_type` |
| `contract_term_months` | `contract_term_months` |
| `offer` / `reporting_type` | `offer`, `reporting_type` (RM/HE) |
| `date_signed` | `date_signed` |
| `nmls` | `nmls` |
| `brokerage_name` | `brokerage_name` |
| `ghl_location_id` / `location_id` | `ghl_location_id` |
| `ghl_subaccount_url` | `ghl_subaccount_url` |
| `source` | `source` |
| `lifecycle_status` | `lifecycle_status` (default: `new_account`) |

**Upsert logic:** matches existing client by `clickup_task_id`, then `email`, then `name` + `date_signed`, then `name` alone.

**Response:**

```json
{
  "client_id": "uuid",
  "client": { "...": "..." },
  "clickup_task_id": "86abc123",
  "clickup_task_url": "https://app.clickup.com/t/86abc123",
  "created": true
}
```

## Webhook client resolution

Lead/event webhooks (`POST /api/webhooks`) resolve clients in this order:

1. `client_id` (if provided)
2. `ghl_location_id` / `location_id`
3. `client_name` (exact match on `clients.name`)

Set `ghl_location_id` during onboarding so GHL lead events match even when location name differs from `clients.name`.

## Manual corrections

Use **Admin → Client Roster** to edit `ghl_location_id` or view the linked ClickUp task. New clients should no longer require manual roster entry when Make is wired correctly.

## Verification

1. Submit a test GHL New Client Form → confirm Supabase row with `lifecycle_status: new_account`.
2. Confirm ClickUp Client Hub task exists and `clickup_task_id` is stored.
3. Fire a test lead webhook with `ghl_location_id` → confirm event ingests without "client not found".
4. CEO Dashboard **New Clients Signed** reflects `date_signed`.
