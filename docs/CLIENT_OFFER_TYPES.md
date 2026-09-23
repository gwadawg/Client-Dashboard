# Client vertical, sales package & fulfillment

Two fields describe **what product line** a client is on and **what offer** they bought. Fulfillment scope is derived automatically.

## Product / Offer Type (`reporting_type` / `offer`)

| Form option | Stored code | Meaning |
|-------------|-------------|---------|
| `RM` | `RM` | Reverse mortgage ads + pipeline |
| `DSCR` | `DSCR` | DSCR loan ads + pipeline |
| `HE` | `CALL_CENTER` | Dial the LO's existing leads — no ad-gen |

`clients.offer` mirrors `reporting_type` for CEO/MRR legacy slices.

## Offer / sales package (`sales_package`)

| Form option | Stored code | Auto fulfillment (`service_program`) |
|-------------|-------------|--------------------------------------|
| **Call Center** | `core_offer` | `core` — Waiz dials, books, and qualifies |
| **Leads Only** | `mid_offer` | `lead_gen` — we generate leads; client dials |
| Skool | `skool` | `null` — reverse downsell |
| Bootcamp | `bootcamp` | Legacy — inactive for new closes |

**New Client Form:** Offer Type = RM/DSCR/HE · Offer = Call Center/Leads Only.  
Make maps: `reporting_type` ← Offer Type · `sales_package` ← Offer.

Do not set `service_program` manually — it is derived from product + package.

## Where it's stored

```sql
clients.reporting_type   -- RM | DSCR | CALL_CENTER
clients.offer            -- mirror of reporting_type
clients.sales_package    -- core_offer | mid_offer | skool | …
clients.service_program  -- derived: core | lead_gen | null
```

## UI

- **Client Roster:** Product badge + Offer badge (Call Center / Leads Only)
- **Kick-off:** fulfillment picker = Call Center / Leads Only (`service_program`)
- **Closer form:** Offer Type (product) + Offer (package)
