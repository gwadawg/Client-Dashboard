# Acquisition Forms — GHL Magic Links & Sync-Back

Mr. Waiz native forms replace GHL disposition forms for structured logging. After submit, data is written to `acquisition_*` tables and synced back to GHL via API.

## Environment

```bash
GHL_ACQUISITION_LOCATION_ID=AcDN4LEPnbiqOCWzG1NH
GHL_ACQUISITION_API_TOKEN=<PIT with contacts.write + opportunities.write>
ACQUISITION_FORM_SECRET=<random string; or falls back to ADMIN_WEBHOOK_SECRET>
# Slack channel slug (register in Admin → Automations → Slack channels):
# ACQUISITION_SETTER_PENDING_SLACK_SLUG=setter_pending_actions
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

### GHL workflow (optional)

Mr. Waiz also posts to Slack `#setter-pending-actions` when Make sends a demo appointment webhook. Setters can use that link or the in-app queue (below).

1. **Trigger:** Appointment Status → Booked (Demo calendar `71fF0PpCgY8Qv1PqeMFa`)
2. **Action:** Make → `POST /api/acquisition/webhooks/appointment` (existing thin webhook)
3. **Slack:** Mr. Waiz posts magic link to `setter_pending_actions` (register channel in Automations)
4. **Retire:** Old GHL booking credit form / workflow that duplicated fields

### Setter Credit Queue (in-app)

Dashboard → **Acquisition** → **Credit Queue** lists demo bookings without booking credit. Each row has an **Open form** link (signed server-side). Toggle **My queue** to filter rows assigned to your sales rep name.

### What syncs to GHL on submit

- Contact custom fields: Agent, Booking Source, Qualified, Appointment ID, Date Appt Booked For
- Pipeline: WM PIPE → **Demo Booked** (or `GHL_STAGE_DEMO_BOOKED_ID`)
- Contact note with setter + notes summary

If GHL sync fails, the form still saves in Mr. Waiz (`ghl_sync_status: failed` on `acquisition_form_submissions`).

### API

- `GET /api/acquisition/forms/demo-booked?contact_id&appointment_id&token` — prefetch lead for form
- `POST /api/acquisition/forms/demo-booked` — submit body + token
- `GET /api/acquisition/setter-credit-queue` — authenticated queue with `form_url` per row

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
| Closer form | `closer_form` | Live (`/forms/acquisition/closer`; legacy `/demo-audit`) |
| Setter intro reflection | `setter_intro_reflection` | Live (`/forms/acquisition/intro-reflection`) |

### Closer form — outcome + reflection

Magic link (same signing as Log Close):

```
https://wm-os-production.up.railway.app/forms/acquisition/closer?contact_id={{contact.id}}&appointment_id={{appointment.id}}&token={{signed_token}}
```

**Outcome (always):** closer/setter names, recording/transcript URLs, notes, whether an offer was presented.

**If offer presented:** did they close on this call?

- **Closed on call** → roster vertical, service tier (RM/DSCR), cash collected. No reflection block.
- **Offer presented, not closed** → offer type, follow-up notes, plus **call reflection** (required).
- **No offer presented** → disposition + next step, plus **call reflection** (required).

**Call reflection** (non-closed deals only — not shown when `closed_on_call = yes`):

| Field | Required |
|-------|----------|
| Call rating 1–10 | Yes |
| One improvement for next call | Yes |
| Lead quality A–D | Yes |
| Lead quality explanation | Yes when C or D |
| Surface objection (dropdown + Other) | Yes |
| Root cause objection (dropdown + Other) | Yes |

Qualified is **not** on the closer form (too subjective). Reflection is stored on `acquisition_calls.details` (`call_rating`, `lead_quality_score`, `surface_objection`, `root_cause_objection`, etc.). Disposition defaults to root cause → surface objection when not set explicitly.

### Log Close (in-app, no magic link)

Dashboard → **Acquisition** → **Log Close**:

1. Search lead by name, phone, or email (requires `ghl_contact_id`).
2. Pick **which call** — showed appointments for that lead, or **No appointment / closed off-calendar**.
3. **Open Closer form** — server issues a signed URL (same form as appointment-tab links).

CLI (optional):

```bash
node scripts/sign-acquisition-closer-link.mjs CONTACT_ID [GHL_APPOINTMENT_ID]
```

Omit `GHL_APPOINTMENT_ID` when there is no calendar event.
