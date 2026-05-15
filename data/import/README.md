# Supabase historical import

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
| `01_clients.csv` | **Import first** — `name`, `is_live`, `ghl_location_id` |
| `02_lead_registry.csv` | Lead ID lookup |
| `03_events_leads.csv` | Lead events only |
| `04_events_conversions_from_flags.csv` | Appt/spoken/offer/closed from sheet Y/N |
| `05_events_all_combined.csv` | **Import second** — all events |
| `06_import_warnings.txt` | Name mismatches, duplicate location IDs |

## Import order

```bash
# Run DB migration once (adds clients.ghl_location_id)
node scripts/migrate.mjs

node scripts/import-clients.mjs --dry-run
node scripts/import-clients.mjs

node scripts/import-historical-events.mjs --dry-run
node scripts/import-historical-events.mjs
```

Requires `.env.local` with `SUPABASE_SERVICE_ROLE_KEY`.

## Notes

- Client `name` matches Leads **Account** exactly (required for events).
- `is_live` comes from Project Info **Reporting Active**.
- Review `06_import_warnings.txt` before importing.
