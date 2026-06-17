# WM Acquisition KPIs

Companion to [`KPIS.md`](KPIS.md). Defines the **Waiz sales funnel** (signing new LO clients), separate from **client fulfillment** KPIs in the main dashboard.

## Funnel stages

```
Ads → Lead → Intro Booked → Intro Showed → Demo Booked → Demo Showed → Offer → Close
```

| Stage | Table | Date field (booking metrics) | Date field (show metrics) |
|-------|-------|------------------------------|---------------------------|
| Lead | `acquisition_leads` | `created_at` | — |
| Intro booked | `acquisition_appointments` | `booked_at` | — |
| Intro showed | `acquisition_appointments` | — | `scheduled_at` |
| Demo booked | `acquisition_appointments` | `booked_at` | — |
| Demo showed | `acquisition_appointments` | — | `scheduled_at` |
| Offer | `acquisition_offers` | `offered_at` | — |
| Close | `acquisition_closes` | `closed_at` | — |

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

## Code references

- `src/lib/acquisition-metrics.ts` — KPI engine
- `src/lib/acquisition-config.ts` — calendars, normalizers
- `GET /api/acquisition/metrics` — API
- `scripts/backfill-acquisition.mjs` — historical import
