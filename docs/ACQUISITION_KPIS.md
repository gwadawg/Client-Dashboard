# WM Acquisition KPIs

Companion to [`KPIS.md`](KPIS.md). Defines the **Waiz sales funnel** (signing new LO clients), separate from **client fulfillment** KPIs in the main dashboard.

## Funnel stages

```
Ads → Lead → Intro Booked → Intro Showed → Demo Booked → Demo Showed → Offer → Close
```

| Stage | Table | Webhook field (booked) | DB column (booked) | Webhook / DB field (show) |
|-------|-------|------------------------|--------------------|---------------------------|
| Lead | `acquisition_leads` | `occurred_at` | `created_at` | — |
| Intro booked | `acquisition_appointments` | `occurred_at` | `booked_at` | — |
| Intro showed | `acquisition_appointments` | — | — | `scheduled_at` |
| Demo booked | `acquisition_appointments` | `occurred_at` | `booked_at` | — |
| Demo showed | `acquisition_appointments` | — | — | `scheduled_at` |
| Offer | `acquisition_offers` | — | `offered_at` | — |
| Close | `acquisition_closes` | — | `closed_at` | — |

**Appointment webhooks** use the same Make field names as client fulfillment (`docs/KPIS.md`):

| GHL / Make field | Client `events` | Acquisition webhook → DB |
|------------------|-----------------|---------------------------|
| Date appointment created | `occurred_at` | `occurred_at` → `booked_at` |
| Date of appointment | `scheduled_at` | `scheduled_at` → `scheduled_at` |
| GHL appointment id | `external_id` | `external_id` → `ghl_appointment_id` |
| Setter / agent | `agent_name` | `agent_name` → `setter_name` |
| Contact phone | `lead_phone` | `lead_phone` → `phone` |

Status updates send only `external_id` + `status` (dates preserved from booked row).

**Close definition:** New Client form submitted → `client_form_submissions` (`form_type: new_client`) linked to `clients`. Historical backfill uses `clients.date_signed`.

## Calendar mapping (GHL acquisition location)

| Calendar | Type | Meta funnel |
|----------|------|-------------|
| WaizMedia Reverse MLO | intro | yes |
| WM Reverse Strat Call | intro | yes |
| General Inquiry | intro | yes |
| Demo | demo | yes |
| BAMFAM, Follow Up | excluded | no |
| Organic (sheet) | organic | no |

## Conversion formulas

- **Intro booking rate** = unique leads with intro booked ÷ leads created
- **Intro show rate** = intros showed ÷ intros taken place (show + no-show + team no-show)
- **Demo booking rate** = demos booked ÷ intros showed
- **Demo show rate** = demos showed ÷ demos taken place
- **Offer rate** = offers ÷ demos showed
- **Close rate** = closes ÷ offers

## Acquisition cost (Meta only by default)

Spend from `acquisition_ad_insights` joined to lead `created_at` date.

- **CPL** = ad spend ÷ Meta leads
- **CAC** = ad spend ÷ closes (Core Offer default; toggle downsells)

## Setter credit

- Credit when setter books a **demo that shows** and lead is **qualified**
- Bonus credit on **close** (New Client form)
- Self-booked: in funnel totals, excluded from setter leaderboard

## Offer type toggles

KPI views support include/exclude for downsells: **Skool**, **Mid Offer**, **Bootcamp**.

## GHL field mapping

| Field | GHL custom field ID |
|-------|---------------------|
| Agent (setter) | `zBBKOu7IF0GyPKd92teI` |
| Lead source | `TbCY8dTtzXF0fSzyNB0R` |
| Booking Source | `YdG174ImpiTJQA45fecU` |
| Qualified | `bKwAbfivInRpYqD9jZzx` |
| Appointment ID | `wrkTN7hE0YHF5ZEUfTpy` |
| Date Appt Booked For | `gVy6ccjcRrRoYHi2ZNcy` |

## Mr. Waiz forms → GHL sync (demo booking credit)

| Form field | Supabase | GHL write-back |
|------------|----------|----------------|
| Setter name | `acquisition_appointments.setter_name`, `acquisition_form_submissions` | Agent `zBBKOu7IF0GyPKd92teI` |
| Booking source | `booking_source` | Booking Source `YdG174ImpiTJQA45fecU` |
| Demo booked / scheduled | `booked_at`, `scheduled_at` | Date Appt Booked For `gVy6ccjcRrRoYHi2ZNcy` |
| Qualified | `qualified` | Qualified `bKwAbfivInRpYqD9jZzx` |
| GHL appointment id | `ghl_appointment_id` | Appointment ID `wrkTN7hE0YHF5ZEUfTpy` |
| Notes | `responses.notes` | Contact note |
| — | pipeline via API | WM PIPE stage **Demo Booked** |

Magic link: `/forms/acquisition/demo-booked?contact_id=…&appointment_id=…&token=…`

See [`docs/ACQUISITION_FORMS_GHL.md`](ACQUISITION_FORMS_GHL.md) for GHL workflow setup.

## Code references

- `src/lib/acquisition-metrics.ts` — KPI engine
- `src/lib/acquisition-config.ts` — calendars, normalizers
- `GET /api/acquisition/metrics` — API
- `scripts/backfill-acquisition.mjs` — historical import
