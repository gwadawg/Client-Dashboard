# Billing Extensions — Implementation Plan

Date: 2026-07-28  
Spec: `docs/superpowers/specs/2026-07-28-billing-extensions-design.md`

## Overview

Add `is_extension` on `client_billings`, enforce `$0` paid when
marked, and add a **Mark as extension** button in Admin Billing
Manage (plus Extension badges). No Finance changes in v1.

## Task 1 — Migration + schema

- `supabase/migrations/add_billing_extension.sql`
- `supabase/schema.sql` — add column alongside other alters

```sql
alter table client_billings
  add column if not exists is_extension boolean not null default false;
```

## Task 2 — Types + ledger fields + revenue defaults

- `src/lib/billing-revenue.ts` — add to `BILLING_LEDGER_FIELDS`;
  force `is_first_payment = false` when extension
- `src/components/billing/billing-types.ts` — `is_extension?`

## Task 3 — API

- `PATCH /api/billings/[id]` — when `is_extension: true`, zero
  amounts, `status: paid`, set `paid_on`, `is_extension: true`,
  `is_first_payment: false`
- `POST /api/billings` — same zeroing when `is_extension: true`

## Task 4 — UI

- `BillingManager.tsx` — **Mark as extension** on scheduled +
  issued Manage panels; badge in meta line
- `ClientFile.tsx` — Extension badge on billing history

## Task 5 — Docs

- `docs/CLIENT_BILLING.md` — short Extensions section

## Verify

Apply migration in Supabase. Mark a due billing as extension →
`$0` paid, badge, next date advances. Existing actions unchanged.
