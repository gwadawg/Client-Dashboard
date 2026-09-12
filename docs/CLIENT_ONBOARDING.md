# Client Onboarding (Mr. Waiz)

Mr. Waiz (Supabase `clients` table) is the **source of truth** for client data. GHL handles the closer New Client form and outbound comms. Make.com orchestrates Slack, emails, and ClickUp **tasks only** (no field mirroring to ClickUp).

## Flow overview

| Step | Who | Where | Mr. Waiz effect |
|------|-----|-------|-----------------|
| 1. New Client | Closer | GHL form → Make → `POST /api/admin/onboard` | `lifecycle_status: new_account`, signing billing, sales call, ClickUp task |
| 2. Onboarding | Client | `/onboard` (static link in GHL emails) | Match by email/phone → update client; else unmapped queue |
| 3. Kickoff | CS manager | Kick-Off wizard in Client Roster | Ops fields + PM brief (JSON audit) |
| 3b. Launch Kit | CSM | **Kit** wizard in Client Roster | Branded client PDF → Storage, `launch_kit` submission, Slack links |
| 4. Launch | Ops | Launch checklist wizard | `lifecycle_status: active`, `launch_date`, Slack via Make |

**Scheduled CS calls** (onboarding / launch / check-in calendars from GHL Client Success) sync via Make into `cs_appointments` and show on Ops Overview + Client Roster/File. See [`docs/CS_APPOINTMENTS.md`](CS_APPOINTMENTS.md).

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

**Public URLs** (also listed under Resources / Forms via `src/lib/internal-forms.ts`):

| Offer | Path | Notes |
|-------|------|--------|
| Core / RM (default) | `/onboard` | Universal link in GHL onboarding emails for non-DSCR-performance closes |
| DSCR performance | `/onboard/dscr` | Same Mr. Waiz match pipeline; Leads vs Conversations + CRM (Leads only). Design: [`docs/superpowers/specs/2026-08-11-dscr-performance-onboarding-form-design.md`](superpowers/specs/2026-08-11-dscr-performance-onboarding-form-design.md) |

**Example:** `https://<your-app>/onboard` or `https://<your-app>/onboard/dscr`

Clients enter email + phone (required for matching), licensed states, business info, address, and optional headshot.

- **1 match** → fields applied to `clients`, `new_account` → `onboarding`, then **GHL tag** + **ClickUp comment** + **Slack ops alert**. GHL/ClickUp only run when matched.
- **0 or 2+ matches** → `client_form_submissions` row with `status: unmapped`; **Slack ops alert** explains the match failure. Resolve in **Client Roster → Unmapped onboarding forms** — linking to a client then triggers GHL + ClickUp.

### Team member invite (unique per client)

Primary onboarding stays on the universal `/onboard` link. For additional users (LOA / Co-LO / other), use the **unique team invite** on Client File → Contacts:

- **Copy link** generates (or returns) `clients.team_invite_token` → `/onboard/team/<token>`
- Submit writes directly to `client_contacts` for that client (no email/phone matching)
- **Rotate** invalidates the old token and copies a new URL

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `GET /api/clients/[id]/team-invite` | Admin session | Ensure token + return URL |
| `POST /api/clients/[id]/team-invite` `{ rotate: true }` | Admin session | Rotate token |
| `GET/POST /api/onboard/team` | Public (token) | Prefetch + submit team member form |

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

## 3b. Launch Kit (CSM)

The Launch Kit is the client's leave-behind from the Launch Call: a branded PDF covering what is live, how to run Week 1, and where every file lives. Process owner and copy source of truth: Wm-os `docs/client-fulfillment/onboarding/sop-client-launch-kit.md` + `docs/templates/client-launch-kit-template.md`. Mr. Waiz is the execution surface.

Open **Kit** from Client Roster once kickoff is complete (available for `new_account`, `onboarding`, and `active` so a kit can be regenerated after go-live).

### Variant matrix

The PDF is deterministic — no AI, no free-form copy. Only per-client fields are substituted. Two axes pick the pages:

| Axis | Source | Values |
|------|--------|--------|
| Product | `clients.reporting_type` | `rm` (Reverse mortgage) · `dscr` |
| Who works leads | `clients.service_program` | `core` → **Waiz** (call center / Laura) · `lead_gen` → **client** (LO / VA, gets playbooks) |

`CALL_CENTER` clients prefill "Waiz" and require the CSM to choose the product. Both can be overridden in step 1 of the wizard.

### Wizard steps

1. **Variant** — product, who works leads, contact first name, company / DBA, go-live date, market.
2. **What's live** — funnel, CRM, calendar, Meta ads, Skool, Launch Kit Drive folder, Slack channel name. Every URL must be a full `http(s)` link or explicitly marked *Not part of this account* (funnel and CRM can never be N/A). `[TO FILL]` is rejected at generate.
3. **Operator setup** — CSM name, who works leads (sentence subject), speed standard *as sold* (blank → kit says "as sold on your Kickoff" instead of inventing a number), internal notes.
4. **Review & generate** — intake table, blocking errors, version list with **Download** and **Send to client**.

**Save draft** stores a `client_form_submissions` row with `status: draft`; reopening the wizard resumes from it. Drafts are dismissed once a kit is generated.

### On generate

- Renders with `@react-pdf/renderer` (server-side, Node — no Chromium). Template copy lives in `src/lib/launch-kit/copy/` with `TEMPLATE_VERSION`; edit Wm-os first, then mirror here and bump the version.
- Uploads to the private bucket **`client-launch-kits`** at `{client_id}/{slug}-launch-kit-v{n}.pdf`. Every generate is a new version; nothing is overwritten.
- Inserts `client_form_submissions` (`form_type: launch_kit`, `status: applied`) with the intake, `storage_path`, `version`, `template_version`, `variant`. Changed funnel / CRM URLs are written back to `clients` (`applied_patch`).
- Posts to the **ops** team channel (`SLACK_OPS_CHANNEL_SLUG`) with an app link + 7-day signed download URL, and to the `mrwaiz` activity feed.
- Does **not** post to the client. Drive upload is manual: CSM downloads → drops into `{Client Drive}/Launch Kit/01-Launch-PDF/`.

### Send to client

**Send to client** (per version) posts a 7-day signed link + the Launch Kit folder link to `clients.slack_id`. Done by the CSM on the Launch Call, never automatically. Stamps `sent_to_client_at` on the submission. Requires the client channel to be mapped in Admin → Automations.

### Launch checklist gate

The Launch wizard shows a non-blocking notice when no kit exists. It does not prevent go-live.

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

Roster shows progress strip: Sign | OB | KO | Kit | Live. Launch Kit rows in Client File → Forms & history include a **Download Launch Kit PDF** link.

## API reference

| Endpoint | Auth | Purpose |
|----------|------|---------|
| `POST /api/admin/onboard` | Bearer `ADMIN_WEBHOOK_SECRET` | New client from Make |
| `PATCH /api/admin/clients/[id]` | Bearer `ADMIN_WEBHOOK_SECRET` | `slack_id`, integration fields |
| `POST /api/onboard/submit` | Public | Client onboarding form |
| `GET/POST /api/onboard/team` | Public (token) | Team member invite form |
| `GET/POST /api/clients/[id]/team-invite` | Admin session | Copy / rotate team invite URL |
| `GET/POST /api/form-submissions/pending` | Admin session | Unmapped OB queue |
| `POST /api/clients/[id]/kickoff` | Admin session | Kickoff wizard |
| `GET/POST /api/clients/[id]/launch-kit` | Admin session (`admin_clients` / `admin_billing`) | Prefill + versions / `{ mode: 'draft' \| 'generate', draft }` |
| `POST /api/clients/[id]/launch-kit/send` | Admin session | Post a kit version to the client Slack channel |
| `GET /api/clients/[id]/launch-kit/download?submission=` | Admin session (+ `client_health`) | Redirect to a fresh 15-min signed URL |
| `POST /api/clients/[id]/launch` | Admin session | Launch checklist |

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ADMIN_WEBHOOK_SECRET` | Yes | Onboard + admin integration routes |
| `CLICKUP_API_TOKEN` | If auto-creating Hub tasks | When `clickup_task_id` not sent |
| `MAKE_ONBOARDING_COMPLETE_WEBHOOK_URL` | No | GHL confirmation email trigger |
| `MAKE_LAUNCH_COMPLETE_WEBHOOK_URL` | No | Launch go-live fallback when Slack unavailable |
| `SLACK_OPS_CHANNEL_SLUG` | No | Team channel for launch audit + Launch Kit notices (default `ops_alerts`) |
| `SLACK_BOT_TOKEN` | For Launch Kit Slack posts | Existing bot; no new scopes needed (`chat:write` only — links, not file uploads) |

### Launch Kit storage

Run `supabase/migrations/add_launch_kit_form_type.sql` — adds the `launch_kit` form type and creates the private `client-launch-kits` bucket (PDF only, 10 MB). `node scripts/verify-onboard-infra.mjs` checks both buckets.

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
6. Open Kit → generate → PDF in `client-launch-kits`, `launch_kit` submission, ops Slack post with download link; Send to client posts to `slack_id`.
7. Complete launch → `active`, launch date, Slack webhook fires.
