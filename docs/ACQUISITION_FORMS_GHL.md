# Acquisition Forms — GHL Magic Links & Sync-Back

Mr. Waiz native forms replace GHL disposition forms for structured logging. After submit, data is written to `acquisition_*` tables and synced back to GHL via API.

## Environment

```bash
GHL_ACQUISITION_LOCATION_ID=AcDN4LEPnbiqOCWzG1NH
GHL_ACQUISITION_API_TOKEN=<PIT with contacts.write + opportunities.write>
ACQUISITION_FORM_SECRET=<random string; or falls back to ADMIN_WEBHOOK_SECRET>
# Optional — skip pipeline stage lookup:
GHL_STAGE_DEMO_BOOKED_ID=<GHL stage id for Demo Booked>
```

## Phase 1: Demo booking credit

### When to use

After a setter books a **demo** on the Demo calendar, they open the magic link (SMS/email) and confirm credit fields. This replaces the legacy GHL “booking credit” form.

### Magic link format

```
https://wm-os-production.up.railway.app/forms/acquisition/demo-booked?contact_id={{contact.id}}&appointment_id={{appointment.id}}&token={{signed_token}}
```

`token` is an HMAC-SHA256 signature over `contact_id|appointment_id|exp` (72h TTL). Generate server-side:

```bash
node scripts/sign-acquisition-demo-link.mjs CONTACT_ID [APPOINTMENT_ID]
```

Or call from a small Make scenario: **only** to sign the URL (HTTP to an internal token endpoint is not exposed — use the Node script locally or embed signing in Make with the same HMAC logic).

### GHL workflow (recommended)

1. **Trigger:** Appointment Status → Booked (Demo calendar `71fF0PpCgY8Qv1PqeMFa`)
2. **Action:** Send SMS or email to setter with magic link
3. **Optional filter:** `location.id == AcDN4LEPnbiqOCWzG1NH`
4. **Retire:** Old GHL booking credit form / workflow that duplicated fields

### What syncs to GHL on submit

- Contact custom fields: Agent, Booking Source, Qualified, Appointment ID, Date Appt Booked For
- Pipeline: WM PIPE → **Demo Booked** (or `GHL_STAGE_DEMO_BOOKED_ID`)
- Contact note with setter + notes summary

If GHL sync fails, the form still saves in Mr. Waiz (`ghl_sync_status: failed` on `acquisition_form_submissions`).

### API

- `GET /api/acquisition/forms/demo-booked?contact_id&appointment_id&token` — prefetch lead for form
- `POST /api/acquisition/forms/demo-booked` — submit body + token

## What stays on Make

| Event | Endpoint |
|-------|----------|
| Contact created | `POST /api/acquisition/webhooks/lead` |
| Appointment created (shell) | `POST /api/acquisition/webhooks/appointment` |
| Dial completed | `POST /api/acquisition/webhooks/dial` |
| Meta spend | `POST /api/acquisition/ad-insights` |

Do **not** relay full GHL form payloads through Make — use Mr. Waiz forms for human disposition.

## Future forms

| Form | `form_type` | Status |
|------|-------------|--------|
| Demo booking credit | `demo_booking_credit` | Live |
| Intro disposition | `intro_disposition` | Planned |
| Closer demo audit | `demo_audit` | Planned |
