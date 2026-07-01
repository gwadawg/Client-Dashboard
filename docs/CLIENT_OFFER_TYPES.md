# Client vertical, sales package & fulfillment

Two fields describe **what product line** a client is on and **what package** they bought. Fulfillment scope is derived automatically.

## Product (`reporting_type` / `offer`)

| Code | UI label | Meaning |
|------|----------|---------|
| `RM` | Reverse | Meta ads + funnel + call center for reverse mortgages |
| `DSCR` | DSCR | Same fulfillment stack for DSCR loan marketing |
| `CALL_CENTER` | Call Center Lead | Dial the LO's existing leads — no ad-gen motion |

`offer` mirrors `reporting_type` for CEO/MRR legacy slices.

**Legacy:** `HE` normalizes to `CALL_CENTER`.

## Sales package (`sales_package` / acquisition `offer_type`)

| Code | UI label | Auto fulfillment (`service_program`) |
|------|----------|--------------------------------------|
| `core_offer` | Core Offer | `core` — full service (ads + dial + book + qualify) |
| `mid_offer` | Mid Offer | `lead_gen` — lead gen only |
| `skool` | Skool | `null` — reverse downsell (not a full roster client) |
| `bootcamp` | Bootcamp | Legacy downsell — inactive for new closes |

Do not set `service_program` manually in forms — it is derived from product + sales package.

## Where it's stored

```sql
clients.reporting_type   -- RM | DSCR | CALL_CENTER
clients.offer            -- mirror of reporting_type (CEO/MRR)
clients.sales_package    -- core_offer | mid_offer | skool | …
clients.service_program  -- derived: core | lead_gen | null

acquisition_leads.offer_interest     -- product code (normalized from GHL)
acquisition_offers.offer_type        -- sales package code
acquisition_closes.offer_type        -- sales package code
acquisition_closes.reporting_type    -- product at close
```

Catalog definitions (labels, GHL aliases, active flag): **Admin → Offer Catalog** (`offer_catalog` table).

## UI

- **Client Roster:** Product badge + Sales package badge; filters for both
- **Client File:** Shared **Client profile** (contact, NMLS, licenses, location) plus **This offer** (GHL sub-account, vertical, lifecycle). Multiple offers for the same LO link via `identity_client_id`.
- **Kick-off form:** Skips the shared "Confirm Information" block when identity is already on file from a linked offer; still collects offer-specific setup (GHL sub-account, ad spend, PM/CC notes).
- **Closer form:** Product + Sales package (no separate service tier)
- **Acquisition KPIs:** offer scope uses catalog `is_downsell` (Skool/Bootcamp vs Core/Mid)

## KPI / dashboard impact

- **Call Center:** booking + show grading (no ad-spend KPIs)
- **RM / DSCR:** full marketing dashboard; `service_program` still drives kickoff form variants internally
