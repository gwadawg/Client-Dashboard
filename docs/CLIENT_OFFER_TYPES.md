# Client vertical & service program

Two fields on `clients` describe **what** we do for a client and **how much** of the funnel we own.

## Client vertical (`reporting_type` / `offer`)

| Value | UI label | Meaning |
|-------|----------|---------|
| `RM` | RM | We market **reverse mortgages** (ads + pipeline). |
| `DSCR` | DSCR | We market **DSCR loans** (ads + pipeline). |
| `CALL_CENTER` | Call Center (CC) | We **dial the LO's existing leads** — not running their ad-gen motion. |

`offer` mirrors `reporting_type` for reporting slices and legacy imports.

**Legacy:** `HE` in old sheets/DB rows normalizes to `CALL_CENTER`.

## Service program (`service_program`)

Applies to **RM and DSCR only**. Call Center clients leave this `null`.

| Value | UI label | We own |
|-------|----------|--------|
| `core` | Core | Generate leads **and** dial, book, qualify |
| `lead_gen` | Lead Gen | Generate leads **only** — client dials/books/qualifies |

Unset (`null`) = not recorded yet (common on legacy backfill rows).

## Where it's stored

```sql
clients.reporting_type   -- RM | DSCR | CALL_CENTER (HE accepted, migrated to CALL_CENTER)
clients.offer            -- mirror of reporting_type for CEO/MRR breakdowns
clients.service_program  -- core | lead_gen | null
clients.client_stage     -- unrelated: tenure bucket from ClickUp ("3+ month"), not service tier
```

## UI

- **Client Roster:** vertical badge (RM / DSCR / CC) + program badge when set; filters for both
- **Client File:** editable vertical + program (program hidden for Call Center)
- **Kickoff / onboarding forms:** wire `service_program` when those wizards collect it (field reserved in DB)

## KPI / dashboard impact

- **Call Center:** booking + show grading (no ad-spend KPIs) — same as former `HE` path
- **RM / DSCR:** full RM-style dashboard; future report variants may branch on `service_program`
