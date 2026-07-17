# CS Appointments (Onboarding / Launch / Check-in)

Scheduled Client Success calls from the **GHL Client Success** sub-account flow into Mr. Waiz so Ops can see upcoming onboarding, launch, and check-in calls on the dashboard.

## Flow

```
GHL CS calendars → Make.com → POST /api/webhooks/cs-appointments → cs_appointments
                                                                      ↓
                                                    join clients.clickup_task_id
                                                                      ↓
                                          Ops Overview + Client Roster/File
```

## Prerequisites

1. **ClickUp Task ID** custom field on GHL CS contacts (required before booking).
2. Three separate GHL calendars (onboarding / launch / check-in).
3. Rows in `cs_calendar_config` mapping each calendar ID → call type.
4. Make scenario posting to the webhook with `Authorization: Bearer {ADMIN_WEBHOOK_SECRET}`.

## Seed calendar config

Replace the calendar IDs with your GHL CS calendar IDs:

```sql
insert into cs_calendar_config (calendar_id, calendar_name, call_type) values
  ('REPLACE_ONBOARDING_CAL_ID', 'CS Onboarding', 'onboarding'),
  ('REPLACE_LAUNCH_CAL_ID', 'CS Launch', 'launch'),
  ('REPLACE_CHECKIN_CAL_ID', 'CS Check-in', 'checkin')
on conflict (calendar_id) do update
  set calendar_name = excluded.calendar_name,
      call_type = excluded.call_type;
```

Unknown `calendar_id` values are rejected by the webhook (`400`) until seeded.

## Webhook payload

`POST /api/webhooks/cs-appointments`

| Field | Required | Notes |
|-------|----------|-------|
| `ghl_appointment_id` | yes | Upsert key |
| `clickup_task_id` | yes | From CS contact custom field |
| `calendar_id` | yes | Must exist in `cs_calendar_config` |
| `scheduled_at` | yes | ISO datetime |
| `calendar_name` | no | |
| `booked_at` | no | |
| `status` | no | `scheduled` (default), `cancelled`, `completed`, `no_show` |
| `raw` | no | Full GHL payload (defaults to entire body) |

**Response:** `{ ok, id, mapped_client, call_type, created }`

`mapped_client` is true when a `clients` row has that `clickup_task_id`. Appointments still save when unmapped.

## Schema notes

- **No** `client_id`, `ghl_contact_id`, or `call_type` on `cs_appointments`.
- Call type is resolved via `cs_calendar_config` at read/ingest validation time.
- Client identity is `clickup_task_id` only (soft join to `clients`).
- Completed call notes/recordings stay on `client_calls` (unchanged).

## Dashboard

- **Ops Overview** — “Upcoming CS calls” (next 14 days), including unmapped ClickUp IDs.
- **Client File** — “CS Calls” tab with full appointment history (when the client has a ClickUp task ID).
- **Client Roster** — “Next CS” column (Full + Client Success views).

## Make scenario

See [`make-blueprints/MAKE_CS_APPOINTMENTS.md`](../make-blueprints/MAKE_CS_APPOINTMENTS.md) and the blueprint stub.
