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

| GHL form field | JSON field | Mr. Waiz |
|----------------|------------|---------|
| **Offer Type** (RM · DSCR · HE) | `reporting_type` | `reporting_type` + `offer` (HE → `CALL_CENTER`) |
| **Offer** (Call Center · Leads Only) | `sales_package` | `sales_package` → `core_offer` / `mid_offer` (+ derives `service_program`) |
| MRR | `mrr` | `mrr` |
| Billing type | `billing_type` | `billing_type` |
| Contract term | `contract_term_months` | `contract_term_months` |
| Cash collected | `cash_collected` | signing billing row |
| Lead source | `source` | `source` |
| Sales call recording URL | `sales_call_recording` | `client_calls` row |

**Do not** put Call Center / Leads Only in `reporting_type`. That is the **Offer** field → `sales_package`.

| Form "Offer" | Make `sales_package` | Stored code | Fulfillment |
|---|---|---|---|
| Call Center | `Call Center` | `core_offer` | Waiz dials |
| Leads Only | `Leads Only` | `mid_offer` | Client dials |

### New Client Form fields (closer nuance)

| GHL form field | JSON field | Where it lands |
|----------------|------------|----------------|
| Appointment Watch (Yes/No) | `appointment_watch` | `clients.appointment_watch` (boolean) |
| Daily adspend | `daily_adspend` | `clients.daily_adspend` |
| Agreed Offer Term | `offer_summary` | `clients.offer_summary` |
| Custom ads · Onboarding setup · Notes on client | `form_notes` | **notes only** — 3 separate `client_notes` rows |

`form_notes` is **not** stored on the client row. Each non-empty value becomes its own Client File note with a clear title:

- `Custom Ads (New Client Form)`
- `Onboarding Setup Breakdown (New Client Form)`
- `Notes on Client (New Client Form)`

`appointment_watch` accepts `Yes` / `No` / `true` / `false` (case-insensitive).

### Recommended Make HTTP body

```json
{
  "primary_contact_name": "{{1.full_name}}",
  "lifecycle_status": "new_account",
  "email": "{{1.email}}",
  "phone": "{{1.phone}}",
  "ghl_contact_id": "{{1.contact_id}}",
  "clickup_task_id": "{{2.id}}",
  "slack_id": "{{3.id}}",
  "reporting_type": "{{1.Offer}}",
  "sales_package": "{{1.Sales Package}}",
  "sales_call_recording": "{{1.Call Recording Link}}",
  "appointment_watch": "{{1.Appointment Watch}}",
  "daily_adspend": "{{1.Daily Adspend}}",
  "offer_summary": "{{1.Agreed Offer Term}}",
  "form_notes": {
    "custom_ads": "{{1.Custom Ads}}",
    "onboarding_setup": "{{1.Break Down on Onboarding Setup}}",
    "client": "{{1.Notes on Client}}"
  }
}
```

| Form | Make | Values |
|---|---|---|
| **Offer** | `reporting_type` | `RM` · `HE` · `DSCR` |
| **Sales Package** | `sales_package` | `Call Center` · `Leads Only` |

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
