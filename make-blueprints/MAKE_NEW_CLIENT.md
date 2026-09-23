# Make.com — New Client scenario (Step 1)

## Required module order

1. **GHL New Client Form** webhook (closer submits)
2. **ClickUp** — create Client Hub task → save task `id`
3. **Slack** — create client channel → save channel `id`
4. **HTTP** — `POST /api/admin/onboard` (**last**; single write to Mr. Waiz)

Blueprint reference: [`ccm-new-client-onboard.blueprint.json`](ccm-new-client-onboard.blueprint.json)

## Mr. Waiz payload (step 1)

### Core contact / IDs

| GHL / Make source | JSON field | Mr. Waiz column |
|-------------------|------------|-----------------|
| Client name (person) | `primary_contact_name` | `primary_contact_name`, `primary_contact` |
| *(derived)* | — | `name` = person name until kickoff |
| Email | `email` | `email`, `billing_email` |
| Phone | `phone` | `phone` |
| Date signed | `date_signed` | `date_signed` |
| ClickUp module output | `clickup_task_id` | `clickup_task_id` |
| Slack module output | `slack_id` | `slack_id` |
| GHL contact id | `ghl_contact_id` (`{{1.contact_id}}`) | `ghl_contact_id` |

Always include `"lifecycle_status": "new_account"`.

### Offer / money (already supported)

| GHL / Make source | JSON field | Mr. Waiz column |
|-------------------|------------|-----------------|
| Offer / product (RM · DSCR · Call Center Lead) | `offer` | `offer`, `reporting_type` |
| Sales package (Call Center · Leads Only) | `sales_package` | `sales_package` (+ derives `service_program`) |
| MRR | `mrr` | `mrr` |
| Billing type | `billing_type` | `billing_type` |
| Contract term | `contract_term_months` | `contract_term_months` |
| Cash collected | `cash_collected` | signing billing row |
| Lead source | `source` | `source` |
| Sales call recording URL | `sales_call_recording` | `client_calls` row |

**Sales package form options:** `Call Center` or `Leads Only` (also accepts legacy `Core Offer` / `Mid Offer`). Codes stored: `core_offer` / `mid_offer`. Do not put Call Center / Leads Only in the product `offer` field.

### New Client Form fields (closer nuance)

| GHL form field | JSON field | Where it lands |
|----------------|------------|----------------|
| Appointment Watch (Yes/No) | `appointment_watch` | `clients.appointment_watch` (boolean) |
| Daily adspend | `daily_adspend` | `clients.daily_adspend` |
| Agreed Offer Terms | `offer_summary` | `clients.offer_summary` |
| Custom ads (write-out) | `custom_ads` | `client_notes` (internal) |
| Break Down on Onboarding Setup | `onboarding_setup` | `client_notes` (internal) |
| Notes on Client | `notes` | `client_notes` (internal) |

Notes are **not** separate `clients` columns. Mr. Waiz writes one internal note per non-empty field, tagged with a `[New Client Form — …]` marker so re-runs do not duplicate.

`appointment_watch` accepts `Yes` / `No` / `true` / `false` (case-insensitive).

### Recommended Make HTTP body

Map `{{1.*}}` to your GHL webhook field names (rename if your form keys differ):

```json
{
  "primary_contact_name": "{{1.name}}",
  "lifecycle_status": "new_account",
  "email": "{{1.email}}",
  "phone": "{{1.phone}}",
  "date_signed": "{{1.date_signed}}",
  "clickup_task_id": "{{2.id}}",
  "slack_id": "{{3.id}}",
  "ghl_contact_id": "{{1.contact_id}}",
  "cash_collected": "{{1.cash_collected}}",
  "contract_term_months": "{{1.contract_term}}",
  "billing_type": "{{1.billing_type}}",
  "mrr": "{{1.mrr}}",
  "source": "{{1.source}}",
  "offer": "{{1.offer}}",
  "sales_package": "{{1.sales_package}}",
  "sales_call_recording": "{{1.sales_call_recording}}",
  "appointment_watch": "{{1.appointment_watch}}",
  "daily_adspend": "{{1.daily_adspend}}",
  "offer_summary": "{{1.offer_summary}}",
  "custom_ads": "{{1.custom_ads}}",
  "onboarding_setup": "{{1.onboarding_setup}}",
  "notes": "{{1.notes}}"
}
```

## Retire these Make modules

Remove from the New Client scenario (and any linked onboarding scenarios):

- ClickUp **Update task custom field** modules that mirror client email, phone, NMLS, address, etc.
- ClickUp **Set custom field** loops fed from GHL perspective fields
- Duplicate Mr. Waiz HTTP calls (only one onboard POST at the end)
- Separate `PATCH /api/admin/clients/{id}` for `slack_id` if already sent in onboard payload (optional keep for channel re-creation)

ClickUp should remain: **create task**, optional **update task status** on launch, assignees, comments — not client field storage.

## Environment (Railway / Mr. Waiz)

| Variable | Purpose |
|----------|---------|
| `ADMIN_WEBHOOK_SECRET` | Bearer token on onboard HTTP module |
| `CLICKUP_AUTO_CREATE_ON_ONBOARD` | Set to `false` when Make always sends `clickup_task_id` |
| `GHL_CS_API_TOKEN` | CS subaccount PIT — tags GHL contact `OB Form Filled` on OB submit |
| `GHL_CS_LOCATION_ID` | CS location id — same for all clients |
| `CLICKUP_API_TOKEN` | OB complete comment + optional field updates on ClickUp task |

## Idempotency

Re-running the scenario with the same `clickup_task_id` updates the same Mr. Waiz client row (no duplicate folder). New Client Form notes are inserted once per marker.
