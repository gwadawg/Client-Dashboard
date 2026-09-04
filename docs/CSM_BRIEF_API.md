# CSM Brief API

**Purpose:** Let the CSM Cursor kit pull finance-safe client + team ops data from Mr. Waiz.  
**Status:** live  
**Related:** [DATA_CHAT.md](DATA_CHAT.md); Wm-os sibling `docs/operations/systems/csm-kit-sync.md`

---

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/csm/client-brief?clientId=&start_date=&end_date=&include=calls,dials,scorecards` | Session **or** Bearer `csm_…` |
| GET | `/api/csm/team-performance?start_date=&end_date=&clientId=&live_only=1` | Same |
| GET | `/api/csm/pay-structures?active=1` | Same |
| GET | `/api/csm/clients?search=` | Same |

**Gate:** `client_health` or `admin_clients`.

## What is included

- Client profile/contacts, health, notes, interventions
- Funnel **conversions** (leads → books → shows) + account dial KPIs
- Team dial performance + agent scorecards
- Account call search (when `include` has `calls`)
- Agent pay **structures** (rates / pay_type) — not posted payroll-run payout totals
- Optional `fulfillment_ad_kpis` (client ad CPL/spend for coaching only)

## Hard exclusions

MRR, invoices, Stripe, client billing totals, expenses/Amex, CAC/COGS ledgers, owner P&L, CEO finance, retainers, payroll **run** totals.

## Setup

1. Migration `add_csm_api_token_hash.sql` (already applied in prod)
2. CSM user: `client_health` + dial/call/agents views as needed; **do not** grant `ceo`, `admin_billing`, or `view_client_revenue`
3. Token: `npx tsx scripts/issue-csm-api-token.ts --email …`

## Code map

```
src/lib/csm-auth.ts
src/lib/csm-api.ts
src/app/api/csm/client-brief/route.ts
src/app/api/csm/team-performance/route.ts
src/app/api/csm/pay-structures/route.ts
src/app/api/csm/clients/route.ts
scripts/issue-csm-api-token.ts
```
