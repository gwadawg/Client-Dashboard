# Historical import — Waiz New Leads

Generated from `Call Center - Waiz - New Leads.csv`.

## Files

| File | Purpose |
|------|---------|
| `01_clients.csv` | Unique client names — create in Admin → Client Roster first (or auto via script) |
| `02_lead_registry.csv` | One row per unique lead (`lead_id` lookup) |
| `03_events_leads.csv` | `lead` events only |
| `04_events_conversions_from_flags.csv` | `appointment_booked`, `dial`, `proposal_sent`, `closed` from sheet Y/N columns |
| `05_events_all_combined.csv` | **Use this for bulk import** (leads + conversions) |

## Lead ID rules

- GHL contact URL present → use GHL contact id
- Else phone + client → `ldr:{Client Name}:{10-digit phone}`
- Else no phone → `ldr:{Client Name}:nophone:{hash}` (per name + date)

Same phone on **different clients** = different `lead_id`.

## Regenerate

```bash
node scripts/transform-leads-csv.mjs "/Users/gwadawg/Downloads/Call Center - Waiz - New Leads.csv"
```

## Import into Supabase

**Option A — Script (recommended)**

```bash
node scripts/import-historical-events.mjs --dry-run
node scripts/import-historical-events.mjs
```

Requires `.env.local` with `SUPABASE_SERVICE_ROLE_KEY`.

**Option B — Table Editor**

1. Import `01_clients.csv` into `clients` (or create clients manually with matching names).
2. Import `05_events_all_combined.csv` is **not** compatible with Table Editor as-is (needs `client_id`). Use the script instead.

## After import

When you have **Appointments** / **Conversations** CSVs, run the same transform pattern with matching `lead_id` / phone + client so timelines fill in without double-counting flags.
