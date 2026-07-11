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

- **Pending** tab — all `uncategorized` charges across months. **Map** opens Type + optional subcategory; check **Always treat this merchant this way** to create a `merchant_contains` rule and optionally apply it to other pending matches.
- **Ledger** tab — month filter, bucket totals, roll up into Overview unit economics
- Add charge / add account / Import CSV
- Seed rules

**Admin → Agent Payroll**

- **Preview → Expenses** / **Post to Expenses (CAC)** posts each agent’s period total as `source=payroll`, default bucket `cac` (setters).

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

**Do not keep Total Costs monthly rows and Chase line items both in P&L for the same months** — that double-counts. Default Chase import **skips any YYYY-MM already present on WM Company Books** (the labeled Total Costs sheet). Use `--retire-sheet` only if Chase should replace the sheet; `--allow-overlap` only if you intentionally want both.

### Chase Activity CSV (checking …1519)

Export columns: `Details`, `Posting Date`, `Description`, `Amount`, `Type`, `Balance`.

- Imports **DEBIT only** (skips Stripe/income CREDITS)
- Merchant cleaned from ACH / POS noise (`ORIG CO NAME:…`, `POS DEBIT…`)
- Dedupe ids: `chase:trn:…` / `chase:txn:…` / `chase:ref:…` / salted `chase:h…`
- Known vendors auto-bucket via rules; Wise ACH + unknowns stay `uncategorized` for review
- Personal transfers → `owner_draw` (excluded); Amex payments excluded (card payoff, not a new expense)
- **Skips months already covered by Total Costs** unless `--allow-overlap`

```bash
# Dry-run (skips sheet months)
npx tsx scripts/import-chase-activity.mjs

# Write only non-overlapping months (keeps Total Costs as SoT)
npx tsx scripts/import-chase-activity.mjs --apply
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
