# Client Offboarding (Churn)

When a Client Success coach knows a client is leaving, they complete the **Churn Offboarding** form in Mr. Waiz. That single flow:

1. Captures structured exit feedback and an operational checklist
2. Marks the client `churned` in Mr. Waiz (Supabase) with `churned_at` and status history
3. Syncs to **ClickUp** (status + comment) and **GHL** (contact tag)
4. Posts an ops alert to **Slack**
5. Stores a full audit trail in `client_form_submissions` for future churn analysis

Mr. Waiz is the source of truth for lifecycle status. ClickUp and GHL receive notifications/tags only.

---

## Where to find the form

| Location | Link / action |
|----------|----------------|
| **Team Forms hub** | [`/forms`](/forms) — bookmark this for all internal forms |
| **Churn form** | [`/forms/churn`](/forms/churn) — select client from dropdown, then submit |
| **Resources tab** | Resources → **Team Forms** section (pinned at top when filtering Forms) |
| **Shortcuts** | Roster / Client File / Billing **Offboard** or **Churn** buttons (opens form with client pre-selected) |

Staff must be logged in to submit (the form is not public like `/onboard`).

Pre-select a client: `/forms/churn?clientId={uuid}`

---

## Adding future forms

1. Add a route under `src/app/forms/[slug]/`
2. Register the form in [`src/lib/internal-forms.ts`](../src/lib/internal-forms.ts) — it will automatically appear on `/forms` and in Resources → Team Forms
3. Optionally add a row in the Resources library (category **Form**, URL `/forms/your-slug`) for extra visibility

---

## Form fields

| Field | Required | Notes |
|-------|----------|-------|
| Churn reason | Yes | Uses shared reason codes (`poor_results`, `pricing_cost`, `competitor`, etc.) |
| Effective churn date | Yes | Date the client actually left |
| Client feedback | Yes | Verbatim or summarized — what they said about leaving |
| Internal notes | No | Lessons learned, product feedback for the team |
| Exit call recording URL | No | Link to call recording |
| Would they rejoin? | No | `yes` / `no` / `unknown` |
| Offboarding checklist | All required | See below |

### Offboarding checklist

- Exit / churn call completed
- Meta ads paused or ownership transferred
- GHL sub-account access documented / revoked
- Billing finalized (final invoice collected or written off)
- Client Slack channel archived or notified

---

## What happens on submit

### Mr. Waiz (Supabase)

- `clients.lifecycle_status` → `churned`
- `clients.is_live` → `false`
- DB trigger sets `clients.churned_at`
- `client_status_history` row enriched with `reason_code` and feedback note
- `client_calls` row with `call_type: 'churn'`
- `client_form_submissions` row with `form_type: 'churn'`

### ClickUp

If the client has `clickup_task_id` and `CLICKUP_API_TOKEN` is set:

- Task status updated to `CLICKUP_CHURN_TASK_STATUS` (when configured)
- Formatted comment posted with reason, feedback, checklist, and lost MRR

### GHL

If the client has `ghl_contact_id` and GHL tokens are configured:

- Contact tag added: `Client Churned` (override with `GHL_CLIENT_CHURNED_TAG`)

Configure GHL automations to react to this tag (sub-account cleanup, internal notifications, etc.).

### Slack

Ops channel alert (slug from `SLACK_OPS_CHANNEL_SLUG`, default `ops_alerts`) with reason, feedback summary, checklist, and sync status.

---

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `CLICKUP_API_TOKEN` | For ClickUp sync | API auth |
| `CLICKUP_CHURN_TASK_STATUS` | Recommended | ClickUp Client Hub status name (e.g. `churned`) |
| `GHL_CS_API_TOKEN` or `GHL_API_TOKEN` | For GHL tag | Contact tag write |
| `GHL_CS_LOCATION_ID` | For GHL tag | CS location ID |
| `GHL_CLIENT_CHURNED_TAG` | Optional | Default: `Client Churned` |
| `SLACK_BOT_TOKEN` | For Slack alert | Direct ops posting |
| `SLACK_OPS_CHANNEL_SLUG` | Optional | Default: `ops_alerts` |

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/clients/[id]/churn` | Load wizard context |
| `POST` | `/api/clients/[id]/churn` | Submit offboarding |

Auth: `admin_clients` or `admin_billing` permission.

---

## Related docs

- [`CLIENT_ONBOARDING.md`](./CLIENT_ONBOARDING.md) — inbound lifecycle (sign → OB → kickoff → launch)
- [`KPIS.md`](./KPIS.md) — churn / lost MRR formulas
