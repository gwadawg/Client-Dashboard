# Waiz Reporting Sheets → Supabase — Import guide

This document ties your **CallCenter-Waiz** Google Sheet tabs to the app’s **`events`** model, **`clients`** model, and **dashboard KPIs** (from `src/lib/metrics.ts`). Use it so imports are **ordered**, **non-duplicative**, and **aligned with how the dashboard counts**.

**Pipeline you should use:** GHL/sheets → **transform CSVs** (in repo) → **`import-clients.mjs` / `import-historical-events.mjs`** (or live Make webhooks). **Do not** use Supabase Table Editor for bulk `events` rows unless you manually add `client_id` UUIDs for every row.

---

## 1. Core rules (read first)

| Rule | Why |
|------|-----|
| **Every metric is per `client_id`** | Sheet **Account**, **Project Name**, and **Sub-account** must match **`clients.name`** exactly (spacing and spelling). |
| **One “person” in history** | Same **contact** for a client = same **`ghl_contact_id`** when GHL provides it. Legacy rows without GHL use **`ldr:{Project Name}:{10-digit phone}`** (see §3). Same phone on **two** clients = **two** keys (correct). |
| **One row in `events` = one fact** | Each row has **`event_type`**, **`occurred_at`**, and optional fields for that type. The dashboard **counts rows by type** in the selected date range. |
| **Do not double-count** | If **New Leads** has **Appt = Y** *and* **Appt1** has a real booking for the same person, you will **inflate** “Appointments Booked” unless you import **only one** source for bookings (recommended: **Appt1** as truth; see §5). |
| **Ignore aggregate tabs for KPIs** | **Ad Stats**, **Speed to Lead Tracker** (as totals), **Daily Summary**-style tabs — **do not** load them as the source of truth; the app **recalculates** from row-level events. |

---

## 2. How the dashboard calculates (accuracy)

All formulas below use events (and `ad_spend`) **in the dashboard’s selected date range** and **client filter**. Source: `calculateMetrics` in `src/lib/metrics.ts`.

| KPI | What gets counted |
|-----|-------------------|
| **Total Leads** | `COUNT` where `event_type = 'lead'` |
| **Qualified Leads** | `lead` rows with `is_qualified = true` |
| **Hot Leads** | `lead` rows with `is_hot = true` |
| **Out of State Leads** | `lead` with `is_out_of_state = true` **plus** `event_type = 'out_of_state_lead'` |
| **Appointments Booked** | `COUNT` where `event_type = 'appointment_booked'` |
| **Booking rate** | Booked ÷ Qualified leads × 100 |
| **Shows / No Shows** | `COUNT` `show` / `no_show` |
| **LO bailed** | `COUNT` `lo_bailed` (Showed? **X** — partner LO did not attend) |
| **Show rate** | Shows ÷ **Booked** × 100 (not ÷ shows+no-shows only) |
| **Cancellations / Cancel rate** | `appointment_cancelled`; rate = cancel ÷ (booked + cancel) |
| **Appts to take place** | Booked − Shows − No Shows − Cancels − **LO bailed** |
| **Outbound dials** | `COUNT` `dial` |
| **Pickups** | `dial` with `is_pickup = true` (sheet/import should align with **duration ≥ 40s**) |
| **Conversations (2 min+)** | `dial` with `is_conversation = true` (align with **duration ≥ 120s** + completed) |
| **Live transfers** | `COUNT` `live_transfer` |
| **Proposals / Closed** | `COUNT` `proposal_sent` / `closed` |
| **Speed to Lead (min)** | Average of `speed_to_lead_seconds` on **dial** rows (first-dial logic from webhooks); sparse on pure sheet backfill |
| **Ad spend / CPL / CP appt / CPS** | Sum of `ad_spend.amount`; CPL = spend÷leads, etc. |

**Date filtering:** KPIs use **`occurred_at`** on events (not always “appointment date” vs “created date” — keep the same convention when you export).

---

## 3. Legacy data without GHL IDs

| Situation | What to store in `ghl_contact_id` |
|-----------|-------------------------------------|
| **Link To Contact** present | Extract contact id from URL path after `/contacts/detail/` |
| **Phone + client known** | `ldr:{exact clients.name}:{10-digit phone}` (normalize: strip non-digits, drop leading `1` if 11 digits) |
| **No phone, no link** | Hash-based key from your transform (e.g. name + date) — **weaker** matching for dials/appts |

**Live GHL / Make:** send real **`ghl_contact_id`** on every event type so timelines and speed-to-lead line up.

---

## 4. Recommended sheet headers (exact names for CSV exports)

Use these **column titles** on each exported CSV so transforms/scripts match consistently. (If your sheet already uses slightly different labels, rename **only in the export** or map once in a script.)

### 4.1 `clients` (from **Project Info** — not `events`)

| Export column | Maps to DB | Notes |
|---------------|------------|--------|
| `name` | `clients.name` | Must match **New Leads → Account** and **Appt1 → Project Name** (exact). Prefer **Project Name** as canonical. |
| `is_live` | `clients.is_live` | `true` / `false` from **Reporting Active** (Yes→true). |
| `ghl_location_id` | optional | From **Location ID**; helps Make, not required for KPI math. |

*Other Project Info columns (calendars, ad account IDs) are **operational reference** — keep in a spreadsheet or future config table; they are not required for dashboard KPI queries.*

### 4.2 **New Leads** → `lead` events (+ optional flag rows — see §5)

| Export column | Required | Maps to |
|---------------|----------|--------|
| `date_created` | Yes | `occurred_at` (ISO 8601) |
| `account` | Yes | Resolves `client_id` via `clients.name` |
| `lead_name` | Best | `lead_name` |
| `phone_number` | Best | `lead_phone` + legacy key |
| `email` | Optional | `lead_email` |
| `qualified` | Optional | `is_qualified` (Y/N) |
| `hot` | Optional | `is_hot` |
| `out_of_state` | Optional | `is_out_of_state` |
| `appt`, `spoken`, `offer`, `closed` | See §5 | **Do not** also import Appt1 for same bookings if you keep these as events |
| `times_called` | Optional | Put in `raw` JSON only |
| `ad_name`, `ad_set_name` | Optional | `raw` or future fields |
| `ltv`, `age`, `state`, `loan_balance`, `property_value` | Optional | `raw` |
| `link_to_contact` | Optional | GHL URL → `ghl_contact_id` |

### 4.3 **Appt1** → booking + outcome events

| Export column | Required | Maps to |
|---------------|----------|--------|
| `date_appointment_created` | Yes | `occurred_at` on `appointment_booked` |
| `date_of_appointment` | Best | Part of `scheduled_at` if time missing |
| `project_name` | Yes | `clients.name` |
| `lead_name`, `lead_email`, `lead_phone_number` | Best | Identity + matching |
| `calendar_name` | Yes | `calendar_name` |
| `requested_time` | Best | `scheduled_at` (full datetime) |
| `stage_booked` | Optional | `stage_booked` |
| `showed` | Yes for outcomes | **Y** → `show`; **N** → `no_show` (**lead** no-show); **X** → `lo_bailed` (partner LO did not show — accountability, not `no_show`) |
| `agent` | Optional | `agent_name` |
| `link_to_contact` | Optional | `ghl_contact_id` |
| `ad_set_name`, `ad_name` | Optional | `raw` |

### 4.4 **All Dials** → `dial` events

| Export column | Required | Maps to |
|---------------|----------|--------|
| `date` | Context | Often redundant with call time |
| `sub_account` | Yes | `clients.name` |
| `lead_name` | Best | `lead_name` |
| `lead_phone_number` | Yes | Match key + `lead_phone` |
| `date_time_of_call` | Yes | `occurred_at` |
| `direction` | Optional | `direction` |
| `status` | Best | `call_status` |
| `durations_seconds` | Yes | `duration_seconds` → set **`is_pickup`** (≥40), **`is_conversation`** (≥120 + completed) |
| `agent` | Optional | `agent_name` |
| `recording_url` | Optional | `recording_url` |
| `call_summary` | Optional | `call_summary` |
| `dialed_from` | Optional | `phone_number_used` or `raw` |

### 4.5 **Live Transfer**

| Export column | Maps to |
|---------------|--------|
| `date` | `occurred_at` |
| `project_name` | `clients.name` |
| `lead_name`, `phone_number` | identity |
| `agent` | `agent_name` |
| `link_to_contact` | `ghl_contact_id` |

_event_type_: **`live_transfer`**.

### 4.6 **MLO Conversions** (pipeline)

| Export column | Maps to |
|---------------|--------|
| `date` | `occurred_at` for each positive flag |
| `account` | `clients.name` |
| `lead_name`, `number`, `email` | identity |
| `proposal_sent` | If Y → `proposal_sent` (offer made) |
| `submitted` | If Y → `loan_processing` (in processing, not yet funded) |
| `closed` | If Y → `closed` (**funded** — money out to client) |

### 4.7 **Out of State Leads** (tab)

Either:

- **`out_of_state_lead`** event per row, **or**
- Set **`is_out_of_state`** on the existing **`lead`** row (counts toward OOS KPI both ways per metrics).

Avoid **both** for the same person if it would double-count OOS.

### 4.8 **Facebook Data** → `ad_spend` (not `events`)

| Field | Notes |
|-------|--------|
| `date` | `spend_date` |
| `project_name` | → `client_name` / `client_id` |
| `amount_spent` | `amount` |
| `platform` | Must be **`meta`**, **`google`**, or **`local_services`** |

Use **`POST /api/ad-spend`** shape or a small import script into **`ad_spend`** table.

### 4.9 **Claimed** (LO-handled leads)

Row = LO working the lead without call center → import as **`dial`** with **`is_conversation: true`** (and pickup), so it counts toward **Total Conversations**.

### 4.10 **LO Audit** (internal)

Import as **`lo_audit`** for timeline / ops review. **Not** included in client KPI math in `calculateMetrics` (internal cadence tracking only).

---

## 5. Double-counting — choose one source per KPI

| KPI | Risk if you import twice |
|-----|---------------------------|
| **Appointments booked** | **New Leads `Appt=Y`** synthetic **`appointment_booked`** **and** **Appt1** real rows for the same clients |
| **Proposals / Closed** | **New Leads `Offer`/`Closed`** **and** **MLO Conversions** |
| **Dials / Conversations** | **New Leads `Spoken=Y`** synthetic **`dial`** **and** **All Dials** real rows |

**Recommended clean strategy for historical load:**

1. Import **`lead`** rows from **New Leads** with **`Qualified` / `Hot` / `Out of State`** and UTM/custom in **`raw`** — **omit** generating events from **Appt / Spoken / Offer / Closed** columns if you will import **Appt1**, **All Dials**, and **MLO Conversions**.
2. Import **Appt1** → **`appointment_booked`** + **`show` / `no_show` / `lo_bailed`** (and **`appointment_cancelled`** when applicable).
3. Import **All Dials** → **`dial`** (with duration → flags).
4. Import **MLO Conversions** → **`proposal_sent`**, **`loan_processing`**, **`closed`** (funded).
5. Import **Live Transfer** → **`live_transfer`**.
6. Import **Out of State** tab **only if** not already on **`lead`** flags.
7. **Facebook Data** (or equivalent) → **`ad_spend`**.

If you **cannot** import Appt1/All Dials yet, you may **temporarily** use flag-derived rows from **New Leads** only — then **do not** re-import the same facts when real tabs arrive unless you **dedupe** (harder).

---

## 6. Import order (checklist)

| Step | What | Table / method |
|------|------|----------------|
| 1 | **Clients** | `clients` — `name` + `is_live` (+ optional `ghl_location_id`) |
| 2 | **New Leads** | `events` — primarily **`lead`**; decide on flag-derived rows per §5 |
| 3 | **Appt1** | `events` — **`appointment_booked`** + outcomes |
| 4 | **All Dials** | `events` — **`dial`** |
| 5 | **MLO Conversions** | `events` — **`proposal_sent`**, **`loan_processing`**, **`closed`** |
| 6 | **Live Transfer** | `events` — **`live_transfer`** |
| 7 | **Claimed** (optional) | `events` — **`dial`** + conversation |
| 8 | **LO Audit** (optional) | `events` — **`lo_audit`** |
| 9 | **Out of State** (if needed) | `events` — **`out_of_state_lead`** or flags on **`lead`** |
| 10 | **Facebook / ad spend** | `ad_spend` — by date + client + platform |
| 11 | *(Optional)* **Hot Leads / Qualified Leads** lists | Usually **redundant** if **New Leads** has flags; use for QA only |

**Do not import as KPI facts:** **Ad Stats** (aggregates), **Speed to Lead Tracker** as a metric table (speed comes from dials + leads in app).

**Claimed** counts in **Conversations** (as `dial`). **LO Audit** is internal timeline data only.

---

## 7. Scripts in this repo (today)

| Script | Purpose |
|--------|---------|
| `prepare-supabase-import.mjs` | Runs **`transform-clients`** + **`transform-leads-csv`** + optional tab transforms when CSVs exist in Downloads |
| `transform-leads-csv.mjs` | New Leads → `03` / `04` / `05` — default **`05`** is **lead rows only**; add `--with-flag-events` for Appt/Spoken/Offer/Closed synthetic events |
| `transform-appts-csv.mjs` | Appt1 → `07_events_appts.csv` |
| `transform-dials-csv.mjs` | All Dials → `08_events_dials.csv` |
| `transform-mlo-csv.mjs` | MLO Conversions → `09_events_mlo.csv` |
| `transform-claimed-csv.mjs` | Claimed → `10_events_claimed.csv` |
| `transform-lo-audit-csv.mjs` | LO Audit → `11_events_lo_audit.csv` |
| `import-clients.mjs` | Upserts **`clients`** |
| `import-historical-events.mjs` | Inserts **`events`** — merges **`05`** + `07`–`11` when those files exist (or pass explicit CSV paths) |

After historical load, **Make** should send **`ghl_contact_id`** on all webhooks going forward.

---

## 8. Locked definitions (Waiz)

- **Showed? = X** → **`lo_bailed`** (partner LO did not attend with the lead), not **`no_show`**.
- **Claimed** → **`dial`** with conversation (LO spoke with the lead without call center).
- **LO Audit** → **`lo_audit`** only (internal).
- **MLO:** **`proposal_sent`** = offer made; **`loan_processing`** = submitted / in processing; **`closed`** = funded.

---

## 9. Related docs

- Full KPI formulas & GHL mapping: [`docs/KPIS.md`](KPIS.md)
- Import folder notes: [`data/import/README.md`](../data/import/README.md)
