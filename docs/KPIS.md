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
| **Show Rate** (of booked) | Shows vs appointments that took place (excludes pending + cancelled) | `Shows ÷ (Shows + No Shows + LO bailed) × 100` | Appointments |
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
- **Show rate (of booked):** `Shows ÷ (Shows + No Shows + LO bailed)`. Only appointments that actually took place count — anything still **pending** (no outcome yet) or **cancelled** is excluded from the denominator, so the rate isn't dragged down by appointments that never happened. LO bails still count against it (the slot was wasted).
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
| **Speed to Lead** | **Median** minutes from lead to first dial, counting only leads that arrive inside a live setter-availability window | `MEDIAN(first_dial.occurred_at − lead.occurred_at)` per contact, excluding leads with no precise timestamp and leads that arrive off-hours |
| **Callback Requests** | Callback appointments booked | `COUNT(callback_booked)` |
| **Callback Rate** | Callbacks per lead | `Callbacks ÷ Total Leads × 100` |
| **Appts To Take Place** | Still scheduled (pending outcomes) | `Appointments Booked − Shows − No Shows − Cancellations − LO bailed` |
| **Dials Per Lead** | Dial effort per lead | `Outbound Dials ÷ Total Leads` |
| **Ad Spend** | Meta (Facebook) | `SUM(meta_ad_insights.spend)` via `daily_meta_spend` view |
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

The **Funnel Simulator** tab (`?view=kpi_simulator`) is a forward-looking calculator for RM prospects and clients: plug in spend, CPL, and stage conversion rates (or load from a selected RM client’s date range) to see projected funnel counts, cost metrics, KPI tier badges, and goal back-solve (“N funded loans → required spend”).

Rate cards carry an info tooltip with their formula. Show Quality groups all appointment rates together so the true (net) show rate reads at a glance separate from the client-report rate.

HE clients keep a minimal dashboard (leads, appointments + calling stats). **Booking Rate** on the HE overview uses **Total Leads** as the denominator (`Appointments Booked ÷ Total Leads`), not qualified leads. Other operational metrics (dials, show rate, etc.) remain in other nav views.

### Client Success tab (RM vs HE)

The **Client Success** view (`client_health`) splits clients by `reporting_type`:

| Segment | Clients | Graded KPIs | Overall tier |
|---------|---------|-------------|--------------|
| **Paid Ads (RM)** | `reporting_type = RM` | Lead-to-qualified, pickup, booking (÷ qualified), show, close, CPL, CPQL, CPConv | North star = CPConv |
| **Appointment Only (HE)** | `reporting_type = HE` | Lead booking rate (÷ total leads), net show rate, pickup rate | Worst of the three |

HE accounts have **no ad-cost grading** (CPL / CPQL / CPConv are omitted). **Outbound dials** are shown in the HE table for volume context but are not tiered. Per-client benchmark overrides in Admin → Client Roster respect the segment (3 KPIs for HE, 8 for RM).

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
| Ad Name | `ad_name` or `utm_content` | `ad_name` |
| Ad Set | `adset_name` / `ad_set_name` | `adset_name` |
| Campaign | `campaign_name` or `utm_campaign` | `campaign_name` |
| UTM source/campaign/content | `utm_source`, `utm_campaign`, `utm_content` | `utm_source`, `utm_campaign`, `utm_content` |
| LTV, Age, State, etc. | — | `raw` |

**Ad attribution (Media Buyer view):** `ad_name` is the universal join key — the same Facebook ad names are reused across every client, so the Media Buyer leaderboard groups by `ad_name` globally. On lead ingest the webhook resolves `ad_name` from `ad_name` → `adName` → `utm_content` (Facebook commonly maps `{{ad.name}}` into `utm_content`). Send the ad name on the **lead** webhook so downstream appointments/shows/closes for that contact can be attributed back to the ad. Imported leads already carry `raw.ad_name`/`raw.ad_set_name`; run `node scripts/backfill-ad-attribution.mjs` once to copy those into the new columns.

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
| AI booking flag | `contact_tags` includes `ai-booked`, or `is_ai_booked: true` | `is_ai_booked` (excludes from agent credit queue; still counts in KPIs) |

**Credit queue:** **Live transfers** plus appointments/callbacks on **`Call Center Booking Calendar`** always appear. **`AI Booking Calendar`** bookings also appear for historical rep credit (null/empty agent or already credited to a real name). Rows with agent `#N/A` on the AI calendar are Conversation AI and stay out of the queue. `#N/A` on the Call Center calendar counts as uncredited. Run `node scripts/backfill-legacy-calendar-agent-credit.mjs --apply` once to auto-credit bookings from the last roster dial before the appointment.

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

**GHL → Make → `recording_url`:** map the first non-empty URL from GHL custom data, in order:

1. `Attachment ` (note trailing space — GHL’s label)
2. `Message Attachments`
3. `Recording URL`

Example Make field: `{{ifempty(1.customData.`Attachment `; ifempty(1.customData.`Message Attachments`; 1.customData.`Recording URL`))}}`

Recordings appear in **Data Explorer → Dials** (▶ Listen) and **Agents → Recordings**.

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
from one-time migration scripts.

For setup, see [`docs/META_ADS_SPEND_IMPORT.md`](META_ADS_SPEND_IMPORT.md).

### Meta ad insights webhook (`POST /api/meta-ad-insights`)
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

**Client show rate** uses appointments that took place (Shows + No Shows + LO bailed) in the denominator — still-pending and cancelled bookings are excluded. Prefer **Model A** or keep immutable booking counts so each outcome is recorded.

---

## Implementation status

| KPI | Dashboard today | Notes |
|-----|-----------------|-------|
| Total Leads | Yes | `lead` events |
| Appointments Booked | Yes | `appointment_booked` |
| Booking Rate | Yes | RM: ÷ Qualified Leads; HE overview: ÷ Total Leads (`lead_booking_rate`) |
| Shows / No Shows | Yes | |
| Show Rate (of booked) | Yes | `shows ÷ (shows + no_shows + lo_bailed)` — excludes pending + cancelled |
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

### Speed-to-lead timestamps (critical)

Speed-to-lead is only as accurate as the **lead's creation timestamp**. It must be a full
date-time **with a timezone offset**, not a bare date.

- **Lead scenario (Make.com):** map `occurred_at` from the GHL contact `dateAdded` field,
  which is full ISO 8601 with offset (e.g. `2026-06-03T08:14:22-04:00`). Do **not** map a
  date-only field (e.g. `2026-06-03`) — the app cannot recover the time of day and the lead
  is excluded from speed-to-lead.
  - **Easiest bulletproof option:** `{{formatDate(dateAdded; "YYYY-MM-DDTHH:mm:ssZ"; "UTC")}}`
    → `2026-06-03T18:31:00+00:00`. UTC for every client, so per-subaccount zones don't matter.
  - **Per-contact-zone option:** GHL also sends the contact's own zone as `timezone`
    (e.g. `America/New_York`). If you map a naive ISO `occurred_at` (no offset) **and** pass
    that zone as `lead_timezone` (or `timezone`), the app anchors the lead to its own zone.
    Priority for offset-less lead times: payload `timezone` → `INGEST_SOURCE_TIMEZONE`.
- **Dial scenario (Make.com / dialer):** send `occurred_at` as ISO 8601 with an offset too.
  Both GHL and HP dials currently emit a naive `2026-06-03T20:18:12` in **US Eastern**, so the
  app anchors offset-less lead + dial times to `INGEST_SOURCE_TIMEZONE` (default
  `America/New_York`). This is independent of the agents' zone and the client's zone.
- **Source of speed-to-lead:** the metric pairs each lead's created time to its **earliest
  dial from any source** (GHL or HP). So the universal fix is to give every lead a precise
  created time (below); the HP `lead_created_date` capture is only a fallback for HP-first leads.
- A lead sent with only a date is stored with `events.occurred_at_has_time = false` and is
  skipped by the speed-to-lead metric (it never produces a `speed_to_lead_seconds`).
- The metric counts a lead only if it arrives inside a **live setter-availability window**,
  evaluated in `CALL_CENTER_TIMEZONE` (the agents' shift zone, e.g. `America/Sao_Paulo`);
  off-hours leads are excluded, not penalized. The lead's own zone and the client's zone do
  not affect the elapsed minutes — a duration between two absolute instants is the same
  everywhere; only the in-window check depends on the agents' zone.
- **Historical caveat:** leads ingested before this fix were stored date-only (no time of
  day), so their speed-to-lead is unrecoverable and excluded. The metric only becomes
  meaningful for leads received after the Make `dateAdded` mapping is in place.

### Speed-to-lead time filters & hour breakdown

All speed-to-lead views (Dial Analytics, Raw Data → Speed to Lead) use the same computed
metric in `src/lib/speed-to-lead.ts` — not the stored `events.speed_to_lead_seconds` column alone.

| Feature | Behavior |
|---------|----------|
| **Setter schedule filter** | On by default. Leads must arrive inside a live row in `setter_availability` (Admin → Schedule → Setter Availability). Toggle off to include all precise-timestamp leads. |
| **Lead arrived after / before** | Optional `HH:MM` cutoffs in call-center timezone. Excludes overnight backlog or other stale leads without affecting the dial timestamp. API params: `lead_after`, `lead_before`. |
| **Hour breakdown** | Dial Analytics shows median minutes by lead-arrival hour (0–23) in `CALL_CENTER_TIMEZONE`. |
| **Raw Data tab** | One row per lead→first-dial pair with **Lead Arrived**, **First Dial**, **Response (min)**, and **Counted** (yes/no with exclusion reason on hover). |

Exclusion reasons: off-hours (outside setter schedule), missing precise timestamp, before/after manual cutoff.

---

## Heat maps (lead-local time)

The lead-volume, pickup-rate, and show-rate heat maps bucket each event by the **lead's own
local time of day**, so "best hour to call" reflects the prospect's clock rather than UTC.

- Each event is placed using the contact's IANA zone in `events.lead_timezone`, captured from
  the GHL payload's **`timezone`** field at ingest (e.g. `America/New_York`).
- Dials and appointments that don't carry their own zone are resolved from the matching
  contact's lead, then fall back to `LEAD_DEFAULT_TIMEZONE` (default `America/New_York`).
- **Make mapping:** add a `timezone` field to the lead webhook, mapped to the GHL contact's
  timezone. (Client/sub-account `clients.timezone` is *not* used here — it's sparse and stored
  as abbreviations like `EST`, which aren't valid IANA zones.)
- Historical caveat: rows ingested before `lead_timezone` existed have no stored zone and use
  the default; lead-volume is also date-only until the speed-to-lead `occurred_at` fix lands.

---

## Media Buyer (global ad performance)

The **Media Buyer** view (Overview group) ranks Facebook ads **globally across all live clients**, grouped by `ad_name`. It joins two sources by ad name:

- **Spend / platform metrics** from `meta_ad_insights` (spend, impressions, clicks, CTR, CPC, CPM), summed across clients.
- **Funnel outcomes** attributed from `events`: the ad name on each `lead` builds a per-client contact → ad map (via `buildContactKey`), and that contact's later `appointment_booked` / `show` / `no_show` / `loan_funded` events inherit the lead's ad.

| Metric | Formula (per ad name, summed across clients) |
|--------|----------------------------------------------|
| **Spend** | `SUM(meta_ad_insights.spend)` |
| **Impressions** | `SUM(meta_ad_insights.impressions)` |
| **Clicks** | `SUM(meta_ad_insights.clicks)` |
| **CTR** | `Clicks ÷ Impressions × 100` |
| **CPC** | `Spend ÷ Clicks` |
| **CPM** | `Spend ÷ Impressions × 1000` |
| **Leads / Qualified / Closes** | `COUNT(attributed lead / qualified lead / loan_funded)` |
| **CPL** | `Spend ÷ Leads` |
| **Cost per Show** | `Spend ÷ Shows` |
| **Cost per Close** | `Spend ÷ Closes` |
| **Booking Rate** | `Appointments ÷ Qualified × 100` |
| **Show Rate** | `Shows ÷ (Shows + No Shows) × 100` (net attendance) |

Each ad can also have an **Ad Library** entry (`ad_library` table): a Google Drive link to the creative plus a summary and visual notes. This is curated manually and is the structured input a future "AI recreate this winning ad" feature will use.

**Attribution caveat:** the leaderboard scopes events to the selected date range, so an appointment is attributed only when its originating lead also falls in range. Widen the range to capture lead → close journeys that span months.

**Code references:** `src/lib/ad-performance.ts` (engine), `src/app/api/media-buyer/route.ts` (API), `src/app/api/ad-library/route.ts` (library CRUD), `src/components/MediaBuyer.tsx` (UI).

---

## Date filtering

| Data | Filter field |
|------|----------------|
| Events (leads, dials, bookings) | `occurred_at` |
| Show heat map | `scheduled_at` |
| Ad spend | `spend_date` |

Use the same client + date range when comparing booking rate across qualified leads and appointments.

---

## CEO / Business KPIs (Business view)

The **Business** view (Overview group) is the agency-owner cockpit: recurring revenue, cash
collected, churn/retention, and portfolio risk **across the whole client book** — not scoped to
one client. It is powered by `src/lib/business-metrics.ts` (`src/app/api/business/route.ts`),
which aggregates three tables:

- `clients` — current `mrr`, `lifecycle_status`, `date_signed`, `churned_at`, `offer`, contract terms.
- `client_status_history` — every lifecycle transition with `mrr_at_change` + `changed_at` (the churn / lost-MRR backbone).
- `client_billings` — the append-only cash ledger (`amount`, `amount_paid`, `paid_on`, `revenue_segment`, `revenue_type`, `processing_fee`, `passthrough_amount`, `lead_source`).

### Headline KPIs

| KPI | Definition | Formula |
|-----|------------|---------|
| **Active MRR** | Current recurring revenue from active clients | `SUM(clients.mrr WHERE lifecycle_status = 'active')` |
| **Net New MRR** (month) | Growth in recurring revenue this month | `New MRR − Lost MRR (± Expansion − Contraction)` |
| **Cash Collected** (month) | Cash actually received this month | `SUM(amount_paid WHERE paid_on in month)` (excludes passthrough) |
| **Gross Revenue Churn %** | Recurring revenue lost to churn | `Lost MRR ÷ MRR at month start × 100` |
| **Active Clients** | Live recurring accounts | `COUNT(clients WHERE lifecycle_status = 'active')` |
| **ARPA** | Average revenue per account | `Active MRR ÷ Active Clients` |

### Revenue & cash (cash-collected basis)

All cash KPIs use **cash actually collected** (`amount_paid`, dated by `paid_on`), not amounts billed,
so the numbers match the bank. Passthrough (ad-spend reimbursement) is always excluded from revenue.

| KPI | Definition |
|-----|------------|
| **New Cash Collected** | Cash collected this month on `revenue_segment = 'front_end'` billings — a new client's setup / PIF / first-contract payment. |
| **New-Logo Cash** (cross-check) | Cash collected this month on each client's **first-ever** paid billing (`MIN(paid_on)` per client). A tagging-free sanity check on New Cash. |
| **Recurring Cash Collected** | Cash collected on `revenue_segment = 'back_end'` billings. |
| **Total Cash Collected** | `SUM(amount_paid)` for the month (front + back), excluding passthrough. |
| **Net of Processing Fees** | `SUM(amount_paid − processing_fee)`. |
| **Revenue by Type** | Split of collected cash by `revenue_type` (`mrr` / `pif` / `performance`). |
| **Revenue by Lead Source** | Split of collected cash by `lead_source` (Meta / Referral / Cold Call / LinkedIn …) — where the agency's own clients come from. |
| **Outstanding AR / Overdue** | Unpaid balances from `balanceOf` + `recordedState` (see `src/lib/billing.ts`). |

### MRR movement (the MRR bridge)

| KPI | Definition |
|-----|------------|
| **New MRR** | `SUM(clients.mrr)` for clients whose `date_signed` falls in the month. |
| **Lost MRR** (churned) | `SUM(client_status_history.mrr_at_change WHERE new_status = 'churned')` in the month. |
| **Expansion / Contraction MRR** | Best-effort now; becomes exact once `client_monthly_snapshots` accrue (a month-over-month MRR delta on retained clients). |
| **Net New MRR** | `New + Expansion − Contraction − Lost`. |

### Churn & retention

| KPI | Definition |
|-----|------------|
| **Logo Churn Rate** | `Churned clients in month ÷ Active clients at month start × 100`. |
| **Gross Revenue Churn Rate** | `Lost MRR ÷ MRR at month start × 100`. |
| **Net Revenue Retention (NRR)** | `(Start MRR + Expansion − Contraction − Lost) ÷ Start MRR × 100` (partial until expansion is tracked). |
| **Avg Client Tenure** | Mean months from `date_signed` to `churned_at` (or today for active). |

### Clients & portfolio risk

| KPI | Definition |
|-----|------------|
| **Lifecycle Funnel** | Client counts by `lifecycle_status`: new_account → onboarding → active → paused → off_boarding → churned. |
| **New Clients Signed** | `COUNT(clients WHERE date_signed in month)`. |
| **MRR by Offer** | Active MRR + client count split by `offer` (RM vs HE). |
| **Revenue Concentration** | Top client's % of Active MRR, and top-5 % — single-client dependency risk. |
| **Contracts Ending Soon** | Clients with `contract_end_date` within 60/90 days and their at-risk MRR. |

### Unit economics & finance (input-driven)

These light up per metric as soon as the relevant input exists. Inputs are imported (or typed into
the **Edit inputs** modal) and stored in the `business_metrics` time-series table, keyed by month.
Each missing-input metric shows a dimmed "needs data" card until its inputs are present.

**Canonical input keys** (`BUSINESS_METRIC_KEYS` in `src/lib/business-metrics.ts`):

| `metric_key` | Meaning |
|--------------|---------|
| `marketing_spend` | Agency client-acquisition spend for the month |
| `operating_expenses` | Total company operating expenses for the month |
| `delivery_costs` | Cost to deliver client work (COGS) for the month |
| `cash_balance` | Cash on hand at month end |
| `headcount` | Team headcount |

**Derived metrics:**

| KPI | Formula | Needs |
|-----|---------|-------|
| **CAC** | `marketing_spend ÷ new clients signed` | `marketing_spend` |
| **ROAS** (new cash) | `New Cash Collected ÷ marketing_spend` | `marketing_spend` |
| **LTV** | `ARPA × avg tenure (× gross margin if known)` | portfolio (live) |
| **LTV : CAC** | `LTV ÷ CAC` | `marketing_spend` |
| **CAC Payback** | `CAC ÷ (ARPA × gross margin)` | `marketing_spend` |
| **Gross Margin** | `(Total Cash − delivery_costs) ÷ Total Cash` | `delivery_costs` |
| **Operating Profit** | `Total Cash − operating_expenses` | `operating_expenses` |
| **Profit Margin** | `Operating Profit ÷ Total Cash` | `operating_expenses` |
| **Net Burn / Runway** | `cash_balance ÷ (operating_expenses − Total Cash)` | `cash_balance` + `operating_expenses` |
| **Rule of 40** | `annualized MRR growth % + profit margin %` | `operating_expenses` |
| **Revenue / Head** | `(Active MRR × 12) ÷ headcount` | `headcount` |
| **Quick Ratio** | `(New + Expansion MRR) ÷ (Lost + Contraction MRR)` | live now (partial) |

Read/write the inputs via `GET|POST /api/business/metrics` (`ceo`-guarded). An import job can POST the
same body (`{ metric_key, month, value_numeric }`) to backfill history; the route upserts per
`(metric_key, period_date, dimension)`. The **Acquisition & Profit Trend** chart appears automatically
once any month carries `marketing_spend` or `operating_expenses`.

### Data hygiene (keeps these KPIs automatic)

The accuracy of the Business view depends on a small, consistent billing/lifecycle convention:

1. **Tag every billing's segment.** Set `revenue_segment` to `front_end` (new-client cash: setup, PIF, first contract) or `back_end` (ongoing retainer) on each `client_billings` row, and set `revenue_type` (`mrr` / `pif` / `performance` / `passthrough`). New Cash reads `front_end`; the New-Logo Cash cross-check works even if a row is mis-tagged.
2. **Record cash when it lands.** Fill `paid_on` and `amount_paid` so cash-collected KPIs match the bank. Mark `passthrough` so ad-spend reimbursements never inflate revenue.
3. **Churn through lifecycle.** Set a client's `lifecycle_status = 'churned'` — the `log_client_status_change` trigger auto-appends a `client_status_history` row stamped with `mrr_at_change`, which is the Lost MRR source. Keep `clients.mrr` current so the snapshot of Active MRR and the lost amount are both right.
4. **Snapshot monthly.** `GET /api/business/snapshot?run=1` or `POST /api/business/snapshot` (Bearer `ADMIN_WEBHOOK_SECRET` or Vercel `CRON_SECRET`) freezes one `client_monthly_snapshots` row per client each month. Vercel cron runs on the 1st via `vercel.json`. Check health with `GET /api/business/snapshot` (no `run` param).

**Code references:** `src/lib/business-metrics.ts` (engine), `src/app/api/business/route.ts` (API), `src/app/api/business/snapshot/route.ts` (monthly snapshot writer), `src/components/CeoDashboard.tsx` (UI).
