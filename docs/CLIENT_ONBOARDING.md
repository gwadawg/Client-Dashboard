# Client Onboarding (Mr. Waiz)

Mr. Waiz (Supabase `clients` table) is the **source of truth** for client data. GHL handles the closer New Client form and outbound comms. Make.com orchestrates Slack, emails, and ClickUp **tasks only** (no field mirroring to ClickUp).

## Flow overview

| Step | Who | Where | Mr. Waiz effect |
|------|-----|-------|-----------------|
| 1. New Client | Closer | GHL form → Make → `POST /api/admin/onboard` | `lifecycle_status: new_account`, signing billing, sales call, ClickUp task |
| 2. Onboarding | Client | `/onboard` (static link in GHL emails) | Match by email/phone → update client; else unmapped queue |
| 3. Kickoff | CS manager | Kick-Off wizard in Client Roster | Ops fields + PM brief (JSON audit) |
| 4. Launch | Ops | Launch checklist wizard | `lifecycle_status: active`, `launch_date`, Slack via Make |

## 1. New Client (GHL + Make)

1. Closer submits **GHL New Client Form** after payment.
2. **Make.com** creates ClickUp Client Hub task, then Slack channel.
3. **Make.com** calls `POST /api/admin/onboard` **last** — single write with contact fields + both IDs.
4. Mr. Waiz upserts client (`lifecycle_status: new_account`); links `clickup_task_id` and `slack_id` (no duplicate ClickUp task when ID is sent).

Blueprint: [`make-blueprints/ccm-new-client-onboard.blueprint.json`](../make-blueprints/ccm-new-client-onboard.blueprint.json)  
Make SOP: [`make-blueprints/MAKE_NEW_CLIENT.md`](../make-blueprints/MAKE_NEW_CLIENT.md)

### Step 1 field mapping

| GHL / Make | Payload field | `clients` column |
|------------|---------------|------------------|
| Client name (person) | `primary_contact_name` | `primary_contact_name`, `primary_contact` |
| *(derived)* | — | `name` = person name until kickoff sets GHL sub-account name |
| Email | `email` | `email`, `billing_email` |
| Phone | `phone` | `phone` |
| Date signed | `date_signed` | `date_signed` |
| ClickUp task id | `clickup_task_id` | `clickup_task_id` |
| Slack channel id | `slack_id` | `slack_id` |
| GHL contact id (CS) | `ghl_contact_id` | `ghl_contact_id` |

### Recommended Make payload (after ClickUp + Slack modules)

```json
{
  "primary_contact_name": "{{1.name}}",
  "lifecycle_status": "new_account",
  "email": "{{1.email}}",
  "phone": "{{1.phone}}",
  "date_signed": "{{1.date_signed}}",
  "clickup_task_id": "{{2.id}}",
  "slack_id": "{{3.id}}",
  "ghl_contact_id": "{{1.contact_id}}"
}
```

Do **not** send GHL sub-account name at sign-up — kick-off sets `clients.name` later.

**Retire in Make:** ClickUp custom-field updates that mirror client data (tasks/status only). See [`MAKE_NEW_CLIENT.md`](../make-blueprints/MAKE_NEW_CLIENT.md).

**Optional env:** `CLICKUP_AUTO_CREATE_ON_ONBOARD=false` when Make always sends `clickup_task_id`.

## 2. Client onboarding form

**Public URL:** `https://<your-app>/onboard` — use this single link in GHL onboarding emails.

Clients enter email + phone (required for matching), licensed states, business info, address, and optional headshot.

- **1 match** → fields applied to `clients`, `new_account` → `onboarding`, then **GHL tag** + **ClickUp comment** + **Slack ops alert**. GHL/ClickUp only run when matched.
- **0 or 2+ matches** → `client_form_submissions` row with `status: unmapped`; **Slack ops alert** explains the match failure. Resolve in **Client Roster → Unmapped onboarding forms** — linking to a client then triggers GHL + ClickUp.

### Onboarding complete side effects (direct API)

When a matched client submits `/onboard`, Mr. Waiz:

1. **GHL** — adds tag `OB form Filled` on the stored `ghl_contact_id` (from Step 1). This tag triggers your GHL automations (confirmation email, etc.).
2. **ClickUp** — posts a formatted comment on `clickup_task_id` with all OB answers. Optionally updates task status (`CLICKUP_OB_TASK_STATUS`) and custom fields (`CLICKUP_OB_FIELD_MAP` JSON).

**Required env (Railway):**

| Variable | Purpose |
|----------|---------|
| `GHL_CS_API_TOKEN` or `GHL_API_TOKEN` | Private Integration Token with contacts write / tags |
| `GHL_CS_LOCATION_ID` | Waiz CS location — same for all clients (`ShWJuggoS02PZidEL4HK`) |
| `CLICKUP_API_TOKEN` | Already used elsewhere |

**Optional env:**

| Variable | Purpose |
|----------|---------|
| `CLICKUP_OB_TASK_STATUS` | ClickUp status name after OB submit (e.g. `ob form received`) |
| `CLICKUP_OB_FIELD_MAP` | JSON map of field keys → ClickUp custom field UUIDs |

Step 1 must store `ghl_contact_id` on the client (see Make payload above). CS location is global via `GHL_CS_LOCATION_ID` on Railway — not stored per client.

### Storage

Create a public Supabase Storage bucket `client-headshots` for headshot uploads.

### Make webhook (legacy — optional)

`MAKE_ONBOARDING_COMPLETE_WEBHOOK_URL` is **no longer used** for onboarding complete. GHL + ClickUp are updated via direct API. You may remove the Make scenario if it was only for OB confirmation.

## 3. Kickoff (CS manager)

Open **Kick-off** from Client Roster after the OB call. Confirms client info, captures GHL location ID + sub-account name, PM landing-page brief (stored in `client_form_submissions`, not `clients` columns).

## 4. Launch checklist

Open **Launch** from Client Roster when kickoff is complete. The wizard is a 4-department checklist (18 items). All answers live in `client_form_submissions.responses` JSON — no extra columns on `clients`.

### Departments

**Media Buying**
- Headline / primary text aligned with creative message
- Correct states are being targeted
- Correct budget is set
- Campaign scheduled for launch at midnight *(type yes)*
- Correct funnel is in the ad and tested funnel is live correctly

**Funnel**
- Funnel headline congruent to ad message / angle
- Split test between two headlines is on
- Pixel data working with correct conversion event *(type yes)*
- GHL subaccount correctly integrated
- Privacy policy and compliant footer added
- Compliant checkbox for sending SMS with client's name

**GHL Subaccount**
- Client info NOT updated — client assigned user with HP tag *(type yes)*
- Custom values all filled out
- Calendar assigned to correct user
- A2P approved *(type yes)*

**Admin**
- Mr. Waiz and ClickUp fields fully filled out
- Make scenario for Facebook is active
- Full test lead executed: perspective → SMS → AI booking → appointment booked *(type yes)*

### Confirmation rules

- Routine items: checkbox only
- Critical items (marked *type yes* above): rep must type `yes` and check the box
- Final gate: rep types `LAUNCH` before submit
- **Completed by** dropdown: required; lists users with Client Roster or Billing access

### On complete

- `lifecycle_status → active`, `launch_date` set, launch call logged
- **ops-alerts** Slack channel: full department audit (configure slug in Automations; default `ops_alerts` via `SLACK_OPS_CHANNEL_SLUG`)
- **Client Slack channel** (`clients.slack_id`): short go-live announcement
- Make webhook fallback if Slack is unavailable: `MAKE_LAUNCH_COMPLETE_WEBHOOK_URL`

Blueprint: [`ccm-launch-complete.blueprint.json`](../make-blueprints/ccm-launch-complete.blueprint.json)

## Slack channel IDs (Automations tab)

**Dashboard → Admin → Automations** is where ops manages Slack channel IDs for future automations and Make scenarios.

| Channel type | Storage | How it gets set |
|--------------|---------|-----------------|
| Per-client | `clients.slack_id` | Make onboarding creates the channel and sends the ID on `POST /api/admin/onboard`; editable in Automations tab |
| Internal team | `slack_channels` table | Added manually in Automations tab (slug + label + channel ID) |

Suggested team channel slugs: `ops_alerts`, `client_success`, `billing`, `setters`. Reference these slugs in future automations or Make payloads.

`notification_automations` table exists for phase 2 (event → channel routing). No triggers are wired yet.

### Automations API

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET/POST /api/slack/channels` | `admin_automations` | List / create team channels |
| `PATCH/DELETE /api/slack/channels/[id]` | `admin_automations` | Update / delete team channel |
| `GET/PATCH /api/slack/client-channels` | `admin_automations` | List / update per-client `slack_id` |
| `GET /api/slack/automations` | `admin_automations` | Read-only automation stubs (phase 2) |

Grant the **Automations** tab in **Admin → Users** so ops can manage channel IDs without full Client Roster access.

## Audit trail

**Client File → Onboarding forms** shows every submission (type, date, submitter, expandable answers).

Roster shows progress strip: Sign | OB | KO | Live.

## API reference

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/admin/onboard` | Bearer `ADMIN_WEBHOOK_SECRET` | New client from Make |
| `PATCH /api/admin/clients/[id]` | Bearer `ADMIN_WEBHOOK_SECRET` | `slack_id`, integration fields |
| `POST /api/onboard/submit` | Public | Client onboarding form |
| `GET/POST /api/form-submissions/pending` | Admin session | Unmapped OB queue |
| `POST /api/clients/[id]/kickoff` | Admin session | Kickoff wizard |
| `POST /api/clients/[id]/launch` | Admin session | Launch checklist |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_WEBHOOK_SECRET` | Yes | Onboard + admin integration routes |
| `CLICKUP_API_TOKEN` | If auto-creating Hub tasks | When `clickup_task_id` not sent |
| `MAKE_ONBOARDING_COMPLETE_WEBHOOK_URL` | No | GHL confirmation email trigger |
| `MAKE_LAUNCH_COMPLETE_WEBHOOK_URL` | No | Launch go-live fallback when Slack unavailable |
| `SLACK_OPS_CHANNEL_SLUG` | No | Team channel for launch audit (default `ops_alerts`) |

## Decommission (ops)

1. Point GHL onboarding email link to `/onboard` (retire GHL OB form).
2. Remove Make modules that PATCH ClickUp client custom fields.
3. Retire external launch form; use Launch wizard only.
4. Keep ClickUp for OB task creation and optional status → Live on launch.

## Verification

1. Test New Client form → client row with `lifecycle_status: new_account` + `client_form_submissions` `new_client` row.
2. After Slack create → `slack_id` on client via PATCH.
3. Submit `/onboard` with matching email → client fields updated + `onboarding` submission.
4. Submit with unknown email → appears in unmapped queue; assign works.
5. Complete kickoff → `kickoff` submission in Client File.
6. Complete launch → `active`, launch date, Slack webhook fires.
