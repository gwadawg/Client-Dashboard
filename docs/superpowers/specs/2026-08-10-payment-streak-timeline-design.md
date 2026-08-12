# Payment Streak Timeline (Client Billing)

Date: 2026-08-10  
Status: Approved for implementation  
Surface: Admin → Client Billing → **Stickiness** tab  
Ledger: `client_billings` + sparse `client_month_disposition_overrides`

## Problem

Laura’s Phase 1 CS stickiness commissions are driven by **consecutive
full-freight paid months** (milestones at M3 / M6). The billing ledger
already dispositions each cycle, but CS has no visual month horizon per
logo: who is streaking, who got an extension, who missed, who is paused.

## Goals

1. Auto-derive a month-by-month disposition strip for each **active**
   client from `client_billings` (live “backfill” on read).
2. Show a color-coded heatmap in Client Billing with current consecutive
   paid streak and miss / extension counts.
3. Allow sparse manual overrides for founder retention exceptions and
   history gaps without re-keying Admin Billing.
4. Keep the disposition engine commission-ready (same cells will feed EOM
   math later) but **do not** compute commission dollars in V1.

## Non-goals (V1)

- Stickiness commission dollar lines, scorecard gate, mid-tier rates
- Multi-series line charts / book-wide retention spark
- Materialized month rows for every client
- Historical pause/churn interval ledger (only current flags + timestamps)

## Decisions locked

| Topic | Decision |
|-------|----------|
| Source | Hybrid: derive by default, sparse overrides |
| Scope | Timeline board only |
| Month key | Prefer `period_start` month; else `billed_on` month |
| Multi-row month | paid full > extension > short > unpaid; void ignored |
| Streak | Only `paid` advances; short/extension/unpaid/paused break |
| Colors | green paid / orange short / yellow extension / red unpaid / gray paused / dark red churned |
| Default roster | Active lifecycle; optional include paused |
| Tab | Client Billing: **Stickiness** |
| Write isolation | Board overlays write **only** to `client_month_disposition_overrides`. Never mutate `client_billings`, `billing_cycles`, or `clients`. |

## Disposition model

| State | Auto-derive |
|-------|-------------|
| `paid` | Not extension; balance ≤ 0; amount > 0 |
| `short` | Partial collection (amount_paid &gt; 0 and balance &gt; 0) or balance &gt; 0 with some paid signal |
| `extension` | `is_extension = true` |
| `unpaid` | pending / overdue / failed with no full pay for that month |
| `paused` | `billing_paused` and month ≥ pause month when `billing_paused_at` set |
| `churned` | Non-active lifecycle and month ≥ `churned_at` month |
| `empty` | No ledger row and not covered by pause/churn flags |

Scheduled future rows may appear as unpaid/empty depending on due month;
voided rows never contribute.

## Data model

```sql
client_month_disposition_overrides (
  id uuid PK,
  client_id uuid → clients,
  year_month text,  -- YYYY-MM
  disposition text, -- paid|short|extension|unpaid|paused|churned
  note text,
  created_by / updated_by,
  created_at / updated_at,
  unique (client_id, year_month)
)
```

## API

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/cs/payment-streaks` | `include_paused`, `from`, `to` year-months |
| PUT | `/api/cs/payment-streaks/override` | Upsert override |
| DELETE | `/api/cs/payment-streaks/override` | Clear override |

Permission: any of `client_health`, `admin_clients`, `admin_billing`.

## UI

- Sticky client name + current streak
- Horizontal month cells (heatmap)
- Legend, sort (streak / name / at-risk), filter paused
- Cell click → drawer: derived vs override, amounts, override set/clear
- M3 / M6 visual badges only (no $)

## Commission readiness

Later EOM calc plugs into the same disposition sequence: full-freight =
`paid` only. Product tier rates and scorecard gate stay outside this
board.

## Related

- Wm-os CS comp: `docs/plans/2026-07-14-laura-cs-comp-design.md`
- Billing extensions: `docs/superpowers/specs/2026-07-28-billing-extensions-design.md`
- Admin Billing: `BillingManager` / `client_billings`
