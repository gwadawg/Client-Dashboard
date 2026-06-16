# Make.com — New Client scenario (Step 1)

## Required module order

1. **GHL New Client Form** webhook (closer submits)
2. **ClickUp** — create Client Hub task → save task `id`
3. **Slack** — create client channel → save channel `id`
4. **HTTP** — `POST /api/admin/onboard` (**last**; single write to Mr. Waiz)

Blueprint reference: [`ccm-new-client-onboard.blueprint.json`](ccm-new-client-onboard.blueprint.json)

## Mr. Waiz payload (step 1 core fields)

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
| `GHL_CS_API_TOKEN` | CS subaccount PIT — tags GHL contact `OB form Filled` on OB submit |
| `GHL_CS_LOCATION_ID` | CS location id — same for all clients |
| `CLICKUP_API_TOKEN` | OB complete comment + optional field updates on ClickUp task |

## Idempotency

Re-running the scenario with the same `clickup_task_id` updates the same Mr. Waiz client row (no duplicate folder).
