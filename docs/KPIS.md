# KPI Reference — Call Center Reporting

**Source of truth** for which metrics we track per client, how they are calculated, and how data flows from GoHighLevel (GHL) into this app.

**Pipeline:** GHL → Make.com → `POST /api/webhooks` (and related routes) → Supabase → Dashboard

**Client filter:** Every metric is scoped by client. In GHL/sheets this is **Account**, **Project Name**, or **Sub-account**. In the app this is `clients.name` (resolved from `client_name` on webhooks).

**Last updated:** May 2026

---

## Primary client KPIs

These are the headline metrics reported to clients (formerly tracked in the Waiz Google Sheet).

| KPI | Definition | Formula | GHL / sheet source |
|-----|------------|---------|-------------------|
| **Total Leads** | Every new lead/contact ingested | `COUNT(lead events)` | Leads tab |
| **Qualified Leads** | Leads manually tagged as qualified | `COUNT(leads WHERE qualified = Y)` | Leads col G |
| **Hot Leads** | Leads manually tagged as hot | `COUNT(leads WHERE hot = Y)` | Leads col H |
| **Out of State Leads** | Leads outside target geography | `COUNT(out-of-state leads)` | Out of State tab / Leads col M |
| **Appointments Booked** | Every appointment booked | `COUNT(appointment_booked events)` | Appointments tab |
| **Booking Rate** | Share of leads that book | `Appointments Booked ÷ Total Leads × 100` | Leads + Appointments |
| **Shows** | Lead attended the appointment | `COUNT(show events)` or `Showed? = Y` | Appointments col J |
| **No Shows** | Lead missed the appointment | `COUNT(no_show events)` or `Showed? = N` | Appointments col J |
| **Show Rate** | Shows vs all bookings | `Shows ÷ Appointments Booked × 100` | Appointments |
| **Live Transfers** | Live transfer to client/agent | `COUNT(live_transfer events)` | Live Transfers tab |
| **Total Conversations** | Meaningful completed calls (2 min+) | `COUNT(dials WHERE call_status = completed AND duration > 120s)` | Conversations tab |
| **Proposals Sent** | Proposal stage reached | `COUNT(pipeline WHERE proposal_sent = Y)` | Pipeline tab |
| **Closed** | Deal closed/won | `COUNT(pipeline WHERE closed = Y)` | Pipeline tab |

### Formula notes

- **Booking rate:** Use the same date window for leads and appointments. Filter both sides by the same client.
- **Show rate (client reporting):** `Shows ÷ Appointments Booked`, not shows ÷ (shows + no-shows only). Pending appointments stay in the denominator until they are marked show or no-show.
- **Qualified / Hot:** Manually tagged in GHL or the setter team — there is no automatic qualification rule.
- **Total conversations:** Do not count failed or zero-duration calls. Use **completed** status and **duration > 120 seconds** (2 minutes), matching the Daily Summary definition.

---

## Operational KPIs (call center performance)

Tracked on the internal dashboard and derived from call + funnel events (formerly in Daily Summary aggregates — **do not ingest Daily Summary as source of truth**; compute from row-level events).

| KPI | Definition | Formula |
|-----|------------|---------|
| **Outbound Dials** | All dial events | `COUNT(dial)` |
| **Pickups** | Calls at least 40 seconds | `COUNT(dial WHERE is_pickup = true)` — typically `duration ≥ 40s` |
| **Pick Up Rate** | Pickups per dial | `Pickups ÷ Outbound Dials × 100` |
| **Conversations (2 min+)** | Same as Total Conversations | `COUNT(dial WHERE is_conversation = true)` |
| **Conversation Rate** | Conversations per pickup | `Conversations ÷ Pickups × 100` |
| **Speed to Lead** | Minutes from lead to first dial | `AVG(first_dial.occurred_at − lead.occurred_at)` per contact |
| **Callback Requests** | Callback appointments booked | `COUNT(callback_booked)` |
| **Callback Rate** | Callbacks per lead | `Callbacks ÷ Total Leads × 100` |
| **Appts To Take Place** | Still scheduled (pending outcomes) | `Appointments Booked − Shows − No Shows` (when using separate booking + outcome rows) |
| **Dials Per Lead** | Dial effort per lead | `Outbound Dials ÷ Total Leads` |
| **Ad Spend** | Meta + Google + Local Services | `SUM(ad_spend.amount)` for date range |
| **CPL** | Cost per lead | `Ad Spend ÷ Total Leads` |
| **CP Appointment** | Cost per booking | `Ad Spend ÷ Appointments Booked` |
| **CPS** | Cost per show | `Ad Spend ÷ Shows` |

### Alerts

- **Stale booking alert:** Client has no `appointment_booked` or `callback_booked` in the last **3+ days** (see `/api/alerts`).

---

## Sheet tabs → app mapping

### Ingest (row-level source of truth)

| Sheet tab | App `event_type` | Webhook |
|-----------|------------------|---------|
| **Leads** | `lead` | `POST /api/webhooks` |
| **Appointments** | `appointment_booked` | `POST /api/webhooks` |
| **Appointments** (outcome) | `show`, `no_show` | `POST /api/webhooks` or `POST /api/webhooks/appointment-status` |
| **Conversations** | `dial` | `POST /api/webhooks` |
| **Live Transfers** | `live_transfer` *(planned)* | `POST /api/webhooks` |
| **Pipeline** | `proposal_sent`, `closed` *(planned)* | `POST /api/webhooks` |
| **Callbacks** (callback calendar) | `callback_booked` | `POST /api/webhooks` |
| **Ad spend** | — | `POST /api/ad-spend` |

### Reference only (do not ingest as KPI source)

| Tab | Use |
|-----|-----|
| **Daily Summary** | Cross-check aggregates only; all KPIs computed from events |
| **Agents** | Maps to `agents` table in app (Admin → Agent Roster) |
| **Raw GHL Leads** | Optional full payload in `events.raw` on lead ingest |

### Ignore completely

- CFNB  
- Ad stats  
- Costs  
- Calendar  

---

## Field mapping (GHL → webhook → `events` table)

### Lead (`event_type: lead`)

| Sheet (Leads) | Webhook field | DB column |
|---------------|---------------|-----------|
| Date Created | `occurred_at` | `occurred_at` |
| Account | `client_name` | → `client_id` |
| Lead Name | `lead_name` | `lead_name` |
| Phone Number | `lead_phone` | `lead_phone` |
| Email | `lead_email` | `lead_email` |
| Link To Contact | `ghl_contact_id` | `ghl_contact_id` |
| Qualified | `qualified` *(planned)* | `raw` until column added |
| Hot | `hot` *(planned)* | `raw` |
| Out of State? | `out_of_state` *(planned)* | `raw` |
| Ad Name / Ad Set | — | `raw` |
| LTV, Age, State, etc. | — | `raw` |

### Appointment (`event_type: appointment_booked`)

| Sheet (Appointments) | Webhook field | DB column |
|----------------------|---------------|-----------|
| Date Appointment Created | `occurred_at` | `occurred_at` |
| Date Of Appointment / Requested Time | `scheduled_at` | `scheduled_at` |
| Project Name | `client_name` | → `client_id` |
| Lead Name / Email / Phone | `lead_name`, `lead_email`, `lead_phone` | same |
| Calendar Name | `calendar_name` | `calendar_name` |
| Stage Booked | `stage_booked` | `stage_booked` |
| Showed? Y/N | `show` / `no_show` or status webhook | `event_type` |
| Agent | `agent_name` | `agent_name` |
| GHL appointment ID | `external_id` | `external_id` |

### Call (`event_type: dial`)

| Sheet (Conversations) | Webhook field | DB column |
|-----------------------|---------------|-----------|
| Date & Time of Call | `occurred_at` | `occurred_at` |
| Sub-account | `client_name` | → `client_id` |
| Direction | `direction` | `direction` |
| Status | `call_status` | `call_status` |
| Durations (seconds) | `duration_seconds` | `duration_seconds` |
| Agent | `agent_name` | `agent_name` |
| Recording URL | `recording_url` | `recording_url` |
| Call Summary | `call_summary` | `call_summary` |

**Derived on ingest (Make):**

```text
is_pickup       = duration_seconds >= 40
is_conversation = duration_seconds >= 120 AND call_status = 'completed'
```

### Live transfer (`event_type: live_transfer`) — planned

| Sheet (Live Transfers) | Webhook field |
|------------------------|---------------|
| Date | `occurred_at` |
| Project Name | `client_name` |
| Lead Name / Phone | `lead_name`, `lead_phone` |
| Agent | `agent_name` |

### Ad spend (`ad_spend` table)

| Field | Webhook (`POST /api/ad-spend`) |
|-------|----------------------------------|
| Date | `date` → `spend_date` |
| Client | `client_name` or `client_id` |
| Platform | `platform`: `meta` \| `google` \| `local_services` |
| Amount | `amount` |

---

## Show / no-show handling (choose one model)

Document your live Make scenario to match one approach:

| Model | Behavior | Best for |
|-------|----------|----------|
| **A — Outcome rows** | Keep `appointment_booked`; add separate `show` / `no_show` events | Sheet-style show rate (bookings stay in denominator) |
| **B — Status update** | `POST /api/webhooks/appointment-status` flips row `appointment_booked` → `show` / `no_show` | Single row per appointment in DB |

**Client show rate** uses **Appointments Booked** in the denominator — prefer **Model A** or keep immutable booking counts.

---

## Implementation status

| KPI | Dashboard today | Notes |
|-----|-----------------|-------|
| Total Leads | Yes | `lead` events |
| Appointments Booked | Yes | `appointment_booked` |
| Booking Rate | Yes | |
| Shows / No Shows | Yes | |
| Show Rate | Yes | `shows ÷ appointments booked` |
| Outbound Dials, Pickups, CPL, etc. | Yes | See `src/lib/metrics.ts` |
| Total Conversations (2 min+) | Partial | Uses `is_conversation` on dials; align `call_status = completed` in Make |
| Qualified / Hot / Out of State | Yes | `is_qualified`, `is_hot`, `is_out_of_state` on lead webhooks |
| Live Transfers | Yes | `event_type: live_transfer` |
| Proposals Sent / Closed | Yes | `event_type: proposal_sent`, `closed` |
| Goals (targets) | Partial | Requires `goals` table in Supabase |

**Code references:**

- Metric formulas: `src/lib/metrics.ts`
- Webhook ingest: `src/app/api/webhooks/route.ts`
- Dashboard display: `src/components/DashboardView.tsx`
- Agent breakdown: `src/app/api/agent-stats/route.ts`

---

## Data prep checklist (go-live)

1. Create each client in **Admin → Client Roster** (`clients.name` must match GHL location / sheet Account).
2. Point Make scenarios at your app URL with `Authorization: Bearer <ADMIN_WEBHOOK_SECRET>`.
3. Backfill or live-stream: `lead`, `dial`, `appointment_booked`, show/no-show, `callback_booked` where used.
4. Send daily **ad spend** per client/platform.
5. For speed-to-lead: reuse `ghl_contact_id` on lead and first dial for the same contact.
6. Do **not** sync Daily Summary totals — validate against them only.

---

## Date filtering

| Data | Filter field |
|------|----------------|
| Events (leads, dials, bookings) | `occurred_at` |
| Show heat map | `scheduled_at` |
| Ad spend | `spend_date` |

Use the same client + date range when comparing booking rate across leads and appointments.
