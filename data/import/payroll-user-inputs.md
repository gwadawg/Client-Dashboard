# May 2026 Payroll Backfill — Remaining User Inputs

Generated after automated backfill (credit + insert). Pay rates are still **$0** on the roster until you set them in **Admin → Agent Roster** or **Agent Payroll**.

## Pay rates needed

Set on **Bernardo Fabris** and **Luka Faccini**:

- Base salary (monthly)
- Pay per booking
- Pay per show
- Pay per live transfer

## Truncated GHL links — RESOLVED

Full links provided and credited to Luka Faccini (May 2026 shows):

| Name | Contact ID |
|------|------------|
| Patricia Rivera | pA2HWYXjRw7czgdj7Jgk |
| Sandra Fabbri | OPSiNyu9c9stsuLB86OQ |
| Jackie Witt | o4jC1HplluSmEhOnGUhD |
| Carol Gallego | eUTSOdjwH7Q1DW2w9h9G |

Overrides saved in `data/import/payroll-link-overrides.json`.

## Manual review (4 rows — blank status)

| Name | Sheet |
|------|-------|
| Edgar Loyola | Luka |
| Michael Scott | Luka |
| Timothy Roberson | Luka |
| Terry Ticey | Bernardo |

Confirm status (Showed / Booked / Live Transfer / exclude) before crediting.

## Rules applied

- **Chargeback YES** → excluded from all pay
- **Bailed** → no commission
- **No show** → no commission
- **Cancelled (no chargeback)** → booking credit only if `appointment_booked` exists in DB
- **All Luka rows** → credited to Luka Faccini (ignore LO “Agent” column)
- **All Bernardo rows** → credited to Bernardo Fabris
- **Live transfer blank date** → use existing DB `live_transfer.occurred_at`

## Scripts

```bash
# Reconcile (dry-run report)
node scripts/reconcile-payroll-csv.mjs

# Apply credits (dry-run by default)
node scripts/apply-payroll-credits.mjs
node scripts/apply-payroll-credits.mjs --apply
```

Reports: `data/import/payroll-reconcile-may2026.json`, `payroll-reconcile-may2026.txt`
