# Expenses — Mr. Waiz ledger

**Purpose:** Transaction-level source of truth for every card/bank charge and logged payroll line, classified into CEO cost buckets, then rolled into existing Business KPIs.

**Owner:** CEO / founder  
**Status:** active (v1 infrastructure)  
**Related:** [KPIS.md](./KPIS.md) (unit economics), [CLIENT_BILLING.md](./CLIENT_BILLING.md) (revenue ledger pattern)

---

## Policy

| Concern | Owner |
|---------|--------|
| Daily expense ops (categorize, import, margins) | **Mr. Waiz** (`business_expenses`) |
| Tax / CPA books | **QuickBooks** (keep until accountant-ready exports exist) |
| Future bank automation | Bank feed (Plaid-class) → Mr. Waiz — **not** QB API for day-to-day |

Do **not** cancel QuickBooks until you can hand your CPA a trusted export from Mr. Waiz (or keep QB tax-only).

---

## Data model

### `finance_accounts`
Cards and bank accounts (multi-account, multi-entity tag).

### `business_expenses`
One row = one charge (or one agent payroll total for a period).

| Field | Notes |
|-------|--------|
| `occurred_on`, `amount` | Amount is always positive (money out) |
| `source` | `manual` \| `csv_import` \| `payroll` \| `bank_sync` (later) |
| `ceo_bucket` | See buckets below |
| `exclude_from_pnl` | Personal, owner draw, passthrough, card payments |
| `external_id` | Bank txn id or import hash (dedupe) |
| `payroll_run_id` | `{start}_to_{end}:{agent_id}` |

### `expense_category_rules`
Merchant/memo matchers → bucket. Seed via **Expenses → Seed rules** or `POST /api/expense-rules` `{ "seed": true }`.

---

## CEO buckets

| Bucket | Meaning | In P&L? | Rolls to |
|--------|---------|---------|----------|
| `cac` | Acquisition (ads, setters, lead gen) | Yes | `marketing_spend` |
| `fulfillment` | Delivery / COGS | Yes | `delivery_costs` |
| `overhead` | Company ops | Yes | (part of OpEx) |
| `passthrough` | Client-funded | No | — |
| `owner_draw` | Founder draw | No | — |
| `personal` | Personal on business card | No | — |
| `uncategorized` | Needs review | No | — |

**Operating expenses (locked):**  
`operating_expenses` = `cac` + `fulfillment` + `overhead` for the month (all non-excluded P&L rows).  
This keeps **Operating Profit = Total Cash − operating_expenses** coherent on the Business view.

---

## UI

Company expense ledger lives under **Finance → Expenses** (`business_expenses`).

- **Pending** tab — all `uncategorized` charges across months. **Map** opens Type + optional subcategory; check **Always treat this merchant this way** to create a `merchant_contains` rule and optionally apply it to other matching ledger rows.
- **Ledger** tab — month filter, bucket totals, roll up into Overview unit economics. Per row: **Exclude** toggles `exclude_from_pnl` (charge stays visible, drops out of OpEx KPIs). Or **Map** → check **Exclude completely from reports** (+ save rule to auto-exclude that merchant forever).
- Types that auto-exclude: `personal`, `owner_draw`, `passthrough`
- After excluding, hit **Roll up {month}** so Finance Overview KPIs refresh
- Add charge / add account / Import CSV
- Seed rules

**Admin → Agent Payroll**

- Live commission calculator + **Post to Expenses (CAC)** for the selected period (`source=payroll`)
- Shows **Expense ledger — payroll this period** (sheet backfill + posted runs)
- Historical labeled payroll from Total Costs: `npx tsx scripts/import-sheet-payroll.mjs --apply`
- HR Reporting payroll (salary / commissions / bonus): `npx tsx scripts/import-hr-payroll.mjs --apply`
  - Prefers HR for overlapping person-months (removes matching `sheet-payroll` rows first)
  - Seeds **Alumni** agents for former staff on the file who are not on the live roster
- Wise payout gap backfill: `npx tsx scripts/import-wise-payroll.mjs --apply`
  - COMPLETED OUT only; **excludes Gabriel**
  - Skips person+month already in `source=payroll`
  - Splits salary vs commissions from current bases (Christian flat; Laura $1k; Pedro $500; Luka/Bernardo $400)

**Former employees (alumni):** Keep the person on `agents` with `active=false` (+ optional `ended_on`). Do not delete them — historical `source=payroll` rows and pay history stay attributed. Team Roster defaults to Active with an Alumni filter; live Team Payroll and schedule only include active people. Expense ledger payroll reports still include everyone.

**Current active pay bases (roster):** Christian = flat salary; Laura Moço = $1,000 + commissions; Pedro Rio = $500 + commissions; Luka Faccini & Bernardo Fabris = $400 + commissions.

**Payroll vs Chase Wise:** Sheet/agent/Wise-history `source=payroll` rows are the labor OpEx. Chase `Wise Inc` ACH is tagged as a payroll *transfer* (`exclude_from_pnl`) so bank payouts do not double-count delivery costs.

---

## CSV import format

### WM Company Report (preferred labeled format)

Columns from `WM _ Company Report - Total Costs.csv`:

| Sheet column | Maps to |
|--------------|---------|
| `Start Date` | `occurred_on` |
| `Vendor` | `merchant_raw` |
| `Cost` | `amount` |
| `Type` | `ceo_bucket` (`CAC`→cac, `COGS`→fulfillment, `Overhead`→overhead, `Passthrough`→passthrough) |
| `Category` | `subcategory` (Software, Payroll, Ad Spend, …) |
| `Description` | `memo` |

Canonical copy in-repo: [`data/import/expenses/wm-company-total-costs-labeled.csv`](../data/import/expenses/wm-company-total-costs-labeled.csv)

```bash
# Dry-run
node scripts/import-labeled-total-costs.mjs

# Write ledger + roll up business_metrics
npx tsx scripts/import-labeled-total-costs.mjs --apply

# Also replace category rules with learned seed set
npx tsx scripts/import-labeled-total-costs.mjs --apply --replace-rules
```

**Do not keep Total Costs monthly rows and Chase line items both in the ledger for the same months** — that double-counts.

**Hybrid SoT (current):**
- **Sheet** (`wm-company-total-costs-labeled.csv`) = Jan 2025 → Jan 2026 (inclusive)
- **Chase** Activity = Oct–Dec 2024, then **Feb 2026 onward**
- Feb–Jul 2026 sheet stubs are ignored (thin / repeating software set)

```bash
# Reconcile after new Chase export or sheet update
npx tsx scripts/reconcile-sheet-then-chase.mjs           # dry-run
npx tsx scripts/reconcile-sheet-then-chase.mjs --apply
# Optional cutoff override:
npx tsx scripts/reconcile-sheet-then-chase.mjs --apply --sheet-end=2026-01-31
```

### Chase Activity CSV (checking …1519)

Export columns: `Details`, `Posting Date`, `Description`, `Amount`, `Type`, `Balance`.

- Imports **DEBIT only** (skips Stripe/income CREDITS)
- Merchant cleaned from ACH / POS noise (`ORIG CO NAME:…`, `POS DEBIT…`)
- Dedupe ids: `chase:trn:…` / `chase:txn:…` / `chase:ref:…` / salted `chase:h…`
- Known vendors auto-bucket via rules; unknowns stay `uncategorized` for review
- Personal transfers → `owner_draw` (excluded); Amex payments excluded (card payoff, not a new expense)

```bash
# Full Chase import only (no sheet) — prefer reconcile-sheet-then-chase for hybrid SoT
npx tsx scripts/import-chase-activity.mjs --apply --retire-sheet
```

Canonical copy: [`data/import/expenses/chase1519-activity-20260710.csv`](../data/import/expenses/chase1519-activity-20260710.csv)



### Generic bank CSV

Required columns (header names flexible):

- `date` (or `occurred_on`, `transaction date`, `posting date`)
- `amount`
- `merchant` (or `vendor`, `payee`) — or `description` for Chase-style exports

Optional: `memo` / `description`, `type` (CEO bucket), `category` (subcategory), `account`, `external_id`.

Template: [`data/import/expenses/labeled-charges.template.csv`](../data/import/expenses/labeled-charges.template.csv)

## Learned taxonomy (from Total Costs sheet)

| Type (sheet) | CEO bucket | Typical vendors |
|--------------|------------|-----------------|
| **CAC** | `cac` | FB ad spend, PK Media, LinkedIn, Ben Edit (acquisition creatives), monthly “Adspend” rows |
| **COGS** | `fulfillment` | High Level, Make, Twilio, Closebot, Perspective, Hot Prospector, call-rep payroll/commissions |
| **Overhead** | `overhead` | Notion, ClickUp, Slack, Google Workspace, Miro, Loom, Hubstaff, Canva, QuickBooks, recruiting ads |
| **Passthrough** | `passthrough` (excl. from P&L) | Sendblue, client-paid contractors |

**Watch-outs encoded as rules:** `FB - Recruit` / recruiting memos → overhead (not CAC). `Sendblue` → passthrough.
---

## APIs (CEO / Expenses + revenue capability)

| Method | Path | Role |
|--------|------|------|
| GET/POST | `/api/finance-accounts` | List / create accounts |
| GET/POST | `/api/expenses` | List / manual create |
| PATCH/DELETE | `/api/expenses/[id]` | Recategorize / delete |
| POST | `/api/expenses/import` | CSV (`dryRun` default true) |
| POST | `/api/expenses/rollup` | `{ month }` or `{ months }` → `business_metrics` |
| GET/POST | `/api/expense-rules` | List / create / `{ seed: true }` |
| POST | `/api/expenses/payroll` | Post agent payroll period → expenses |

Migration: [`supabase/migrations/add_business_expenses.sql`](../supabase/migrations/add_business_expenses.sql)

---

## Phase 2 (not in v1)

1. Bank API (Plaid) sync into `business_expenses` (`source=bank_sync`)
2. Learn rules from founder-labeled history (replace/extend seed rules)
3. Optional one-way export Mr. Waiz → QuickBooks / CPA CSV for tax
