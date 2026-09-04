# CSM Brief API

**Purpose:** Let the CSM Cursor kit pull a finance-safe client history brief from Mr. Waiz.  
**Status:** live (code) — apply migration + issue token before use  
**Related:** [DATA_CHAT.md](DATA_CHAT.md); Wm-os sibling `docs/operations/systems/csm-kit-sync.md`

---

## Endpoints

| Method | Path | Auth |
|--------|------|------|
| GET | `/api/csm/client-brief?clientId=&start_date=&end_date=` | Session cookie **or** Bearer `csm_…` |
| GET | `/api/csm/clients?search=` | Same |

Permissions (any-of): `client_health` | `admin_clients` | `resources` — same as Data Chat `client_success`.

## Brief payload (includes)

- Profile + contacts (`SAFE_CLIENT_FIELDS` — no MRR/billing contracts)
- Health snapshot + open interventions
- Notes + interventions (capped)
- Fulfillment funnel + dials
- Ad-spend / CPL KPI `cost` block (fulfillment ops money)

## Hard exclusions

MRR, invoices, Stripe, payroll amounts, expense ledger, retainers, owner P&L.

## Setup

1. Apply migration: `supabase/migrations/add_csm_api_token_hash.sql`
2. Ensure CSM user has `client_health` (not CEO / expense / `view_client_revenue` unless intentional)
3. Issue token:

```bash
npx tsx scripts/issue-csm-api-token.ts --email csm@example.com
```

4. Put token in sibling `wm-csm-kit` `.env.local` as `CSM_API_TOKEN` + `MR_WAIZ_BASE_URL`
5. Revoke: `npx tsx scripts/issue-csm-api-token.ts --email csm@example.com --revoke`

## Code map

```
src/lib/csm-auth.ts
src/app/api/csm/client-brief/route.ts
src/app/api/csm/clients/route.ts
src/lib/ai/data-chat/tools.ts   # executeDataChatTool
scripts/issue-csm-api-token.ts
```
