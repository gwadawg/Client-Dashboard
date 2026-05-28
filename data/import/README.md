# Supabase historical import

## Merged lead history (stale New Leads + Qualified + Hot tabs)

If **New Leads** is outdated but **Qualified** / **Hot** have newer rows, use a **single** merged `lead` per contact:

```bash
node scripts/transform-leads-merged.mjs \
  "/path/to/New Leads.csv" \
  "/path/to/Qualified Leads.csv" \
  "/path/to/Hot Leads.csv"
```

Then **delete** `12_events_qualified_leads.csv` and `14_events_hot_leads.csv` from `data/import/` if you generated them earlier, so `import-historical-events.mjs` does not double-count.

## Regenerate all files

```bash
node scripts/prepare-supabase-import.mjs
```

Source files (default paths):

- `~/Downloads/Call Center - Waiz - Project Info.csv`
- `~/Downloads/Call Center - Waiz - New Leads.csv`

## Output files

| File | Purpose |
|------|---------|
| `00_client_config.csv` | Reference: calendars, ad accounts (not imported to DB) |
| `meta-client-map.csv.example` | Template for Make Meta Ads client mapping |
| `01_clients.csv` | **Import first** — `name`, `is_live`, `ghl_location_id` |
| `02_lead_registry.csv` | Lead ID lookup |
| `03_events_leads.csv` | Lead events only |
| `04_events_conversions_from_flags.csv` | Appt/spoken/offer/closed from sheet Y/N |
| `05_events_all_combined.csv` | **Import second** — lead events (default); add Appt/Dials/MLO outputs below before import |
| `07_events_appts.csv` | Appt1 → booked + show / no_show / lo_bailed |
| `08_events_dials.csv` | All Dials |
| `09_events_mlo.csv` | MLO -> proposal_made, submission_made, loan_funded |
| `10_events_claimed.csv` | Claimed → dials w/ conversation |
| `11_events_lo_audit.csv` | LO Audit (internal) |
| `12_events_qualified_leads.csv` | Qualified Leads tab → `lead` rows (`is_qualified`) |
| `13_events_live_transfer.csv` | Live Transfer tab |
| `14_events_hot_leads.csv` | Hot Leads tab → `lead` rows (`is_hot`) |
| `15_ad_spend_meta.csv` | Legacy Facebook Data — migrate with **`migrate-ad-spend-to-meta-insights.mjs`**, not `import-ad-spend.mjs` |
| `meta_ad_insights` | **Meta spend source** — live/backfill via **`POST /api/meta-ad-insights`** (Make) |
| `06_import_warnings.txt` | Name mismatches, duplicate location IDs |

## Import order

```bash
# Run DB migration once (adds clients.ghl_location_id)
node scripts/migrate.mjs

node scripts/import-clients.mjs --dry-run
node scripts/import-clients.mjs

node scripts/import-historical-events.mjs --dry-run
node scripts/import-historical-events.mjs

# Google / local ad spend only (skip if you have no non-Meta spend CSVs)
node scripts/import-ad-spend.mjs --dry-run
node scripts/import-ad-spend.mjs
```

Requires `.env.local` with `SUPABASE_SERVICE_ROLE_KEY`.

## Meta Ads (insights only)

Meta spend is **not** written to `ad_spend`. Use Make → `/api/meta-ad-insights`, or
migrate legacy sheet rows once:

```bash
node scripts/migrate-ad-spend-to-meta-insights.mjs --dry-run
node scripts/migrate-ad-spend-to-meta-insights.mjs
node scripts/migrate-ad-spend-to-meta-insights.mjs --delete-meta-ad-spend
```

Client map and Make setup: `docs/META_ADS_SPEND_IMPORT.md`, blueprint
`make-blueprints/ccm-meta-ad-insights.blueprint.json`.

```bash
node scripts/validate-meta-client-map.mjs path/to/meta-client-map.csv
node scripts/generate-meta-backfill-days.mjs 2026-05-01 2026-05-16 > data/import/meta-backfill-dates.csv
```

## Community First National Bank (LO KPI refresh)

Dedicated transform + refresh import with **phone → email → first+last name** dedupe for this client only:

```bash
node scripts/transform-community-first-bank-csv.mjs "/path/to/community-first-export.csv"
node scripts/import-community-first-bank-refresh.mjs "/path/to/community-first-export.csv" --dry-run
node scripts/import-community-first-bank-refresh.mjs "/path/to/community-first-export.csv"
```

- `Status=Processing` -> `submission_made`; `Funded` -> `loan_funded`; `Proposed` -> `proposal_made`
- Also writes one `lead` event per row
- `occurred_at` = spreadsheet **Created Date**
- Safe to re-run: duplicates are skipped in Supabase

## Notes

- Client `name` matches Leads **Account** exactly (required for events).
- `is_live` comes from Project Info **Reporting Active**.
- Review `06_import_warnings.txt` before importing.
