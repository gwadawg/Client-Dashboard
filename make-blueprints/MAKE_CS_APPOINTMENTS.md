# Make: CS Appointments → Mr. Waiz

Wire GHL Client Success calendars (onboarding / launch / check-in) into the dashboard.

## Endpoint

```
POST {APP_URL}/api/webhooks/cs-appointments
Authorization: Bearer {ADMIN_WEBHOOK_SECRET}
Content-Type: application/json
```

## Triggers

Use GHL appointment **Create**, **Update**, and **Delete** (or cancelled) for the three CS calendars only. Filter by `calendar.id` so fulfillment calendars never hit this route.

## JSON body (map from GHL)

```json
{
  "ghl_appointment_id": "{{appointment.id}}",
  "clickup_task_id": "{{contact.customField.ClickUp Task ID}}",
  "calendar_id": "{{calendar.id}}",
  "calendar_name": "{{calendar.name}}",
  "scheduled_at": "{{appointment.startTime}}",
  "booked_at": "{{appointment.dateAdded}}",
  "status": "scheduled"
}
```

On delete / cancel, set `"status": "cancelled"` and still send `ghl_appointment_id`, `clickup_task_id`, `calendar_id`, and `scheduled_at`.

## Checklist

1. Confirm ClickUp Task ID custom field exists on CS contacts and is filled for clients in roster.
2. Seed `cs_calendar_config` with the three calendar IDs (see [`docs/CS_APPOINTMENTS.md`](../docs/CS_APPOINTMENTS.md)).
3. Import or recreate from [`ccm-cs-appointment.blueprint.json`](./ccm-cs-appointment.blueprint.json) — replace URL + Bearer secret.
4. Book a test appointment → Ops Overview “Upcoming CS calls” should list it.
5. If `mapped_client: false`, fix `clients.clickup_task_id` for that client.
