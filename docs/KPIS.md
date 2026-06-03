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
| **Booking Rate** | Share of qualified (dialable) leads that book | `Appointments Booked ÷ Qualified Leads × 100` | Leads + Appointments |
| **Shows** | Lead attended the appointment | `COUNT(show events)` or `Showed? = Y` | Appointments col J |
| **No Shows** | Lead missed the appointment | `COUNT(no_show events)` or `Showed? = N` | Appointments col J |
| **LO bailed** | Partner LO missed the appointment with the lead (not a lead no-show) | `COUNT(lo_bailed events)` or `Showed? = X` | Appointments col J |
| **Show Rate** (of booked) | Shows vs all dispositioned bookings (excludes still-pending) | `Shows ÷ (Shows + No Shows + LO bailed + Cancelled) × 100` | Appointments |
| **Net Show Rate** | True lead-attendance rate; ignores cancellations, LO bails, and pending | `Shows ÷ (Shows + No Shows) × 100` | Appointments |
| **LO Bail Rate** | Share of bookings the partner LO missed | `LO bailed ÷ Appointments Booked × 100` | Appointments |
| **Cancellations** | Appointments cancelled | `COUNT(appointment_cancelled)` | GHL cancel trigger |
| **Cancel Rate** | Cancelled vs scheduled | `Cancellations ÷ (Appointments Booked + Cancellations) × 100` | Appointments |
| **Conversation Rate** | Client-side conversations per qualified lead | `(Claimed + Shows + Live Transfers) ÷ Qualified Leads × 100` | Leads + Appointments + Live Transfers |
| **Live Transfers** | Live transfer to client/agent | `COUNT(live_transfer events)` | Live Transfers tab |
| **Total Conversations** | Meaningful completed calls (2 min+) plus client-claimed conversations | `COUNT(dials WHERE is_conversation = true) + COUNT(claimed events)` | Conversations / Claimed tab |
| **Proposals Made** | Reached proposal stage **or beyond** | `COUNT(unique leads with proposal_made OR submission_made OR loan_funded)` | MLO / Pipeline |
| **Submissions** | Reached submission stage **or beyond** | `COUNT(unique leads with submission_made OR loan_funded)` | MLO `Submitted` |
| **Funded Loans** | Deal closed; client received funds | `COUNT(unique leads with loan_funded)` | MLO `Closed` |
| **Cost per Proposal** | Spend efficiency at proposal stage | `Ad Spend ÷ Proposals Made` | Spend + Pipeline |
| **Cost per Submission** | Spend efficiency at submission stage | `Ad Spend ÷ Submissions` | Spend + Pipeline |
| **Cost per Funded Loan** | Spend efficiency at funded stage | `Ad Spend ÷ Funded Loans` | Spend + Pipeline |

### Formula notes

- **Booking rate:** Qualified leads only (leads you dial). Use the same date window for qualified leads and appointments. Filter both sides by the same client.
- **Show rate (of booked):** `Shows ÷ (Shows + No Shows + LO bailed + Cancelled)`. Only **dispositioned** appointments count — anything still pending (no outcome recorded yet) is excluded from the denominator so the rate isn't dragged down by appointments that haven't happened. LO bails and cancellations still count against it.
- **Net show rate (true attendance):** `Shows ÷ (Shows + No Shows)`. Use this to judge lead quality / setter performance: it excludes cancellations, LO bails, and pending appointments, so it isn't dragged down by outcomes the lead is not responsible for. Display it alongside the gross show rate.
- **LO bail rate:** `LO bailed ÷ Appointments Booked`. Surfaces partner loan-officer no-shows (Showed? = X) as their own KPI rather than burying them in the show rate.
- **Conversation rate:** `(Claimed + Shows + Live Transfers) ÷ Qualified Leads`. The numerator is the same "client conversations" figure used for Cost per Conversation.
- **Cancel rate:** `Cancellations ÷ (Appointments Booked + Cancellations)`. Use the same GHL **appointment ID** (`external_id`) on book and cancel. Prefer `/api/webhooks/appointment-status` with `status: "cancelled"` so the original booking row is updated (see `ccm-appt-cancelled.blueprint.json`).
- **Appts to take place:** `Booked − Shows − No Shows − Cancellations − LO bailed` (pending / unresolved slots).
- **Conversion funnel rollup:** Reaching a later stage implies every earlier stage. A lead with only `loan_funded` still counts toward Submissions and Proposals; a lead with only `submission_made` still counts toward Proposals. Implied stages are derived at read time (in `src/lib/metrics.ts`) — we do **not** insert synthetic proposal/submission rows, and each lead is counted once per stage.
- **Qualified / Hot:** Manually tagged in GHL or the setter team — there is no automatic qualification rule.
- **Total conversations:** Do not count failed or zero-duration calls. Use **completed** status and **duration > 120 seconds** (2 minutes), matching the Daily Summary definition. `claimed` events also count because they represent the client manually speaking with or messaging a lead outside the setter workflow.

---

## Operational KPIs (call center performance)

Tracked on the internal dashboard and derived from call + funnel events (formerly in Daily Summary aggregates — **do not ingest Daily Summary as source of truth**; compute from row-level events).

| KPI | Definition | Formula |
|-----|------------|---------|
| **Outbound Dials** | All dial events | `COUNT(dial)` |
| **Pickups** | Calls at least 40 seconds | `COUNT(dial WHERE is_pickup = true)` — typically `duration ≥ 40s` |
| **Pick Up Rate** | Pickups per dial | `Pickups ÷ Outbound Dials × 100` |
| **Conversations (2 min+)** | Dial conversations only | `COUNT(dial WHERE is_conversation = true)` |
| **Claimed** | Client manually spoke with/messaged the lead outside our booking flow | `COUNT(claimed)` |
| **Conversation Rate** | Conversations per pickup | `Conversations ÷ Pickups × 100` |
| **Speed to Lead** | Minutes from lead to first dial | `AVG(first_dial.occurred_at − lead.occurred_at)` per contact |
| **Callback Requests** | Callback appointments booked | `COUNT(callback_booked)` |
| **Callback Rate** | Callbacks per lead | `Callbacks ÷ Total Leads × 100` |
| **Appts To Take Place** | Still scheduled (pending outcomes) | `Appointments Booked − Shows − No Shows − Cancellations − LO bailed` |
| **Dials Per Lead** | Dial effort per lead | `Outbound Dials ÷ Total Leads` |
| **Ad Spend** | Meta + Google + Local Services | `SUM(meta_ad_insights.spend)` + `SUM(ad_spend.amount)` where platform ≠ meta |
| **Meta spend** | Facebook / Meta only | `SUM(meta_ad_insights.spend)` (daily rollup via `daily_meta_spend` view) |
| **CPL** | Cost per lead | `Ad Spend ÷ Total Leads` |
| **CP Qualified Lead (CPQL)** | Cost per qualified lead | `Ad Spend ÷ Qualified Leads` |
| **CP Hot Lead (CPH)** | Cost per hot lead | `Ad Spend ÷ Hot Leads` |
| **CP Conversation** | Cost per client conversation | `Ad Spend ÷ (Live Transfers + Shows + Claimed)` |
| **CP Appointment** | Cost per booking | `Ad Spend ÷ Appointments Booked` |
| **CPS** | Cost per show | `Ad Spend ÷ Shows` |

### RM dashboard layout (login → Dashboard)

The main **Dashboard** view for RM clients shows these sections:

1. **Leads & Pipeline** — Total Leads, Qualified, Hot, Out of State, Claimed, Live Transfers  
2. **Appointments** — Booked, booking rate, appts to take place, shows, no-shows, LO bailed, cancellations  
3. **Show Quality & Conversion** — Net Show Rate, Show Rate (of booked), Cancel Rate, LO Bail Rate, Conversation Rate  
4. **Acquisition Costs** — Total Spend, CPL, CPQL, CPH, Cost per Appointment, Cost per Conversation  
5. **Conversions** — Proposals Made, Submissions, Funded Loans, and per-stage cost  
6. **Trends** — Line charts for CPL, CPQL, and Cost per Conversation over the selected date range  

Rate cards carry an info tooltip with their formula. Show Quality groups all appointment rates together so the true (net) show rate reads at a glance separate from the client-report rate.

HE clients keep a minimal dashboard (appointments + calling stats). Operational metrics (dials, show rate, booking rate, etc.) remain in other nav views.

---

## Sheet tabs → app mapping

### Ingest (row-level source of truth)

| Sheet tab | App `event_type` | Webhook |
|-----------|------------------|---------|
| **Leads** | `lead` | `POST /api/webhooks` |
| **Appointments** | `appointment_booked` | `POST /api/webhooks` |
| **Appointments** (outcome) | `show`, `no_show`, `lo_bailed`, `appointment_cancelled` | `POST /api/webhooks` or `POST /api/webhooks/appointment-status` |
| **Conversations** | `dial` | `POST /api/webhooks` |
| **Claimed** (client-handled) | `claimed` | `POST /api/webhooks` |
| **LO audit** | `lo_audit` | Internal cadence tracking — **not** a client KPI |
| **Live Transfers** | `live_transfer` *(planned)* | `POST /api/webhooks` |
| **Pipeline / MLO** | `proposal_made`, `submission_made`, `loan_funded` | `POST /api/webhooks` |
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
| GHL appointment ID | `external_id` or `ghl_appointment_id` | `external_id` |
| GHL calendar ID | `calendar_id` or `ghl_calendar_id` | `calendar_id` |
| Calendar Name | `calendar_name` | `calendar_name` |
| Stage Booked | `stage_booked` | `stage_booked` |
| Showed? Y/N/X | `show` / `no_show` / `lo_bailed` or status webhook | `event_type` |
| Agent | `agent_name` | `agent_name` |

**Lifecycle:** Send the **same** `external_id` (GHL appointment id) on `appointment_booked` and when calling **`POST /api/webhooks/appointment-status`** (show / no_show / cancelled). For separate outcome **inserts** (`show`, `no_show`, `lo_bailed`, `appointment_cancelled` via main webhook), include **`external_id`** on each row so joins and exports stay aligned. Include **`calendar_id`** on booking (and on any follow-up inserts if you want it denormalized).

### Call (`event_type: dial`)

| Sheet (Conversations) | Webhook field | DB column |
|-----------------------|---------------|-----------|
| Date & Time of Call | `occurred_at` | `occurred_at` |
| Sub-account | `client_name` | → `client_id` |
| Direction | `direction` | `direction` |
| Status | `call_status` | `call_status` |
| Durations (seconds) | `duration_seconds` | `duration_seconds` |
| Agent | `agent_name` | `agent_name` |
| Dialing software | `dial_source` or `software` | `dial_source` |
| Phone number used | `phone_number_used` | `phone_number_used` |
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

### Claimed (`event_type: claimed`)

Use when the client manually spoke with or messaged a lead outside the setter booking/live-transfer flow. This counts toward **Total Conversations** but does not count as an outbound dial or appointment.

| Field | Webhook field |
|-------|---------------|
| Date | `occurred_at` |
| Project Name | `client_name` |
| Lead identity | `ghl_contact_id`, `lead_name`, `lead_phone`, `lead_email` |
| Who handled it, if known | `agent_name` |
| Channel/source, optional | Stored in `raw` fields like `channel`, `claimed_source` |

### Meta ad insights (`meta_ad_insights` table) — Meta spend source

All Meta spend KPIs sum `spend` from this table (grouped by client and day). Make
posts ad-level rows daily; historical sheet totals may exist as synthetic daily rows
after migration from `ad_spend`.

For setup, see [`docs/META_ADS_SPEND_IMPORT.md`](META_ADS_SPEND_IMPORT.md).

### Ad spend (`ad_spend` table) — Google / Local Services only

| Field | Webhook (`POST /api/ad-spend`) |
|-------|----------------------------------|
| Date | `date` → `spend_date` |
| Client | `client_name` or `client_id` |
| Platform | `google` \| `local_services` only (`meta` rejected) |
| Amount | `amount` |

| Field | Webhook (`POST /api/meta-ad-insights`) |
|-------|----------------------------------------|
| Date | `date`, `insight_date`, or Meta `date_start` |
| Client | `client_name` or `client_id` |
| Campaign | `campaign_id`, `campaign_name` |
| Ad set | `adset_id`, `adset_name` |
| Ad | `ad_id`, `ad_name` |
| Delivery account | `account_id` |
| Cost metrics | `spend`, `impressions`, `clicks`, `ctr`, `cpc`, `cpm` |
| Meta actions | `actions`, `cost_per_action_type` |

---

## Show / no-show handling (choose one model)

Document your live Make scenario to match one approach:

| Model | Behavior | Best for |
|-------|----------|----------|
| **A — Outcome rows** | Keep `appointment_booked`; add separate `show` / `no_show` events | Sheet-style show rate (bookings stay in denominator) |
| **B — Status update** | `POST /api/webhooks/appointment-status` flips row `appointment_booked` → `show` / `no_show` | Single row per appointment in DB |

**Client show rate** uses **dispositioned appointments** (Shows + No Shows + LO bailed + Cancelled) in the denominator — still-pending bookings are excluded until they get an outcome. Prefer **Model A** or keep immutable booking counts so each outcome is recorded.

---

## Implementation status

| KPI | Dashboard today | Notes |
|-----|-----------------|-------|
| Total Leads | Yes | `lead` events |
| Appointments Booked | Yes | `appointment_booked` |
| Booking Rate | Yes | |
| Shows / No Shows | Yes | |
| Show Rate (of booked) | Yes | `shows ÷ (shows + no_shows + lo_bailed + cancelled)` — excludes still-pending |
| Net Show Rate | Yes | `shows ÷ (shows + no_shows)` — true attendance, excludes cancel/LO bail/pending |
| LO Bail Rate | Yes | `lo_bailed ÷ appointments booked` |
| Conversation Rate | Yes | `(claimed + shows + live_transfers) ÷ qualified_leads` |
| Cancellations / Cancel Rate | Yes | `appointment_cancelled`; rate = cancel ÷ (booked + cancel) |
| Outbound Dials, Pickups, CPL, etc. | Yes | See `src/lib/metrics.ts` |
| Total Conversations (2 min+) | Yes | Dial conversations plus `claimed` events |
| Qualified / Hot / Out of State | Yes | `is_qualified`, `is_hot`, `is_out_of_state` on lead webhooks |
| Live Transfers | Yes | `event_type: live_transfer` |
| Claimed | Yes | `event_type: claimed` |
| Conversions (Proposal / Submission / Funded) | Yes | Canonical `proposal_made`, `submission_made`, `loan_funded` (legacy aliases normalized) |
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

Use the same client + date range when comparing booking rate across qualified leads and appointments.
