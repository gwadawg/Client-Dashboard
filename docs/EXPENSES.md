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

- Add charge / add account  
- Import CSV (preview then write)  
- Uncategorized queue (filter)  
- Recategorize inline  
- Seed rules + **Roll up {month}** → writes `business_metrics`

**Admin → Agent Payroll**

- **Preview → Expenses** / **Post to Expenses (CAC)** posts each agent’s period total as `source=payroll`, default bucket `cac` (setters).

---

## CSV import format

Required columns (header names flexible):

- `date` (or `occurred_on`, `transaction date`)
- `amount`
- `merchant` (or `description`, `payee`)

Optional: `memo`, `category` / `ceo_bucket` / `label` (CAC, COGS, overhead, personal…), `subcategory`, `account`, `external_id`.

Template: [`data/import/expenses/labeled-charges.template.csv`](../data/import/expenses/labeled-charges.template.csv)

Drop your labeled year export into `data/import/expenses/` and run:

```bash
node scripts/import-expenses.mjs data/import/expenses/your-file.csv
node scripts/import-expenses.mjs data/import/expenses/your-file.csv --apply
```

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
