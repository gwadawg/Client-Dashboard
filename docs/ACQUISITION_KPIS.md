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
- **Demo → close rate** = closes ÷ demos showed (end-to-end efficiency)

## Date semantics (mixed canonical)

| Metric | Date field used |
|--------|----------------|
| Leads | `created_at` |
| Intros/Demos booked | `booked_at` |
| Intros/Demos showed / no-show | `scheduled_at` |
| Offers | `offered_at` |
| Closes | `closed_at` |
| Ad spend | `insight_date` |

## Acquisition cost

Two sources of truth, one reporting bridge:

| Source | Table | Role |
|--------|-------|------|
| Meta Graph media | `acquisition_meta_ad_insights` | Operational media (CPL, cost/stage, Meta Media CAC) |
| Non-media CAC | `business_expenses` (`ceo_bucket=cac`, channel ≠ `meta_media`) | Creative, labor, LinkedIn, referral fees |

Ledger Meta/FB/“Adspend” rows use `acquisition_cost_channel = meta_media` and are **reconcile-only** (`exclude_from_pnl`) so card charges do not double-count Graph spend.

- **CPL** = Meta ad spend ÷ Meta leads
- **Meta Media CAC** = Meta ad spend ÷ Meta closes
- **Meta All-in CAC** = (Meta ad spend + creative/labor/paid_other) ÷ Meta closes
- **Blended All-in CAC** (`cac`) = (Meta ad spend + all non-media CAC) ÷ all closes
- **Referral CAC** = referral_partner spend ÷ Referral closes
- **Company CAC** (CEO) = same Blended All-in numerator via `marketing_spend` rollup

`acquisition_cost_channel` values: `meta_media` · `creative_production` · `paid_other` · `referral_partner` · `acquisition_labor`

## Cash collected

Defined as `SUM(acquisition_closes.cash_collected)` for closes in the selected date range and offer scope. Does not include offers that haven't closed.

## Offer scope

The KPI dashboard allows filtering by offer type via the `offer_scope` parameter:

| Scope | Counts |
|-------|--------|
| `core` (default) | Core Offer + Mid Offer — excludes downsells (Skool, Bootcamp) |
| `skool` | Skool offers/closes only |
| `all_downsells` | Skool + Bootcamp (catalog `is_downsell`) |
| `all` | Every offer/close regardless of type |

## Setter credit

- Credit when setter books a **demo that shows** and lead is **qualified**
- Bonus credit on **close** (New Client form)
- Self-booked: in funnel totals, excluded from setter leaderboard

## KPI thresholds (color coding)

Color thresholds are defined in `src/lib/acquisition-kpi-thresholds.ts`. Default targets:

| Metric | Green (≥) | Amber (≥) | Red (<) |
|--------|-----------|-----------|---------|
| Intro show rate | 70% | 50% | 50% |
| Demo show rate | 70% | 50% | 50% |
| Intro booking rate | 50% | 30% | 30% |
| Demo booking rate | 60% | 40% | 40% |
| Offer rate | 70% | 50% | 50% |
| Close rate | 50% | 30% | 30% |
| Demo → close rate | 35% | 20% | 20% |

To adjust thresholds, edit `DEFAULT_THRESHOLDS` in `src/lib/acquisition-kpi-thresholds.ts`.

## Dashboard view map

| Dashboard view | URL | What it shows |
|----------------|-----|---------------|
| Acquisition KPIs → Overview | `?view=acquisition_kpis&tab=overview` | Hero numbers, funnel flow, rate cards, trends, no-shows, call quality |
| Acquisition KPIs → Setters | `?view=acquisition_kpis&tab=setters` | Per-setter funnel table + show rate chart |
| Acquisition KPIs → Closers | `?view=acquisition_kpis&tab=closers` | Per-closer demo/offer/close table + quality |
| Acquisition KPIs → Costs | `?view=acquisition_kpis&tab=costs` | Cost-per-stage grid, trend charts, no-show cost |
| Acquisition (ops) | `?view=acquisition` | Appointments, Sales Calls, Credit Queue, Log Close, Pending Closes |
| Acquisition Data | `?view=acquisition_data_explorer` | Raw table browser |

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

| File | Purpose |
|------|---------|
| `src/lib/acquisition-metrics.ts` | Core KPI engine (funnel rates, costs, no-show breakdown) |
| `src/lib/acquisition-team-metrics.ts` | Per-setter rollup |
| `src/lib/acquisition-closer-metrics.ts` | Per-closer rollup |
| `src/lib/acquisition-metrics-timeseries.ts` | Daily time-series for charts |
| `src/lib/acquisition-call-quality.ts` | Call rating + objection aggregation |
| `src/lib/acquisition-kpi-thresholds.ts` | Color threshold definitions |
| `src/lib/acquisition-config.ts` | Calendars, offer types, normalizers |
| `GET /api/acquisition/metrics` | Aggregate metrics API |
| `GET /api/acquisition/team-stats` | Setter performance API |
| `GET /api/acquisition/closer-stats` | Closer performance API |
| `GET /api/acquisition/metrics/timeseries` | Daily series API |
| `GET /api/acquisition/call-quality` | Quality aggregates API |
| `scripts/backfill-acquisition.mjs` | Historical import |
