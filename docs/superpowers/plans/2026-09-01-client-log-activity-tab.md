---
title: Client Log Activity Tab — Implementation Plan
status: shipped
last_updated: 2026-09-01
artifact_type: plan
related_docs:
  - docs/superpowers/specs/2026-09-01-client-log-activity-tab-design.md
---

# Client Log Activity Tab — Plan

## Scope

Ship read-only **Activity** tab on `/forms/loans/<token>` alongside existing Log form.

## Tasks

1. **`src/lib/client-log-activity.ts`** — range windows, row builder, summary counts (form-only sources)
2. **`src/lib/client-log-activity.test.ts`** — unit tests
3. **`GET /api/forms/loans/[token]/activity`** — token auth, Supabase fetch, cap 500 rows
4. **`ClientLogShell`** — wordmark, title, Log | Activity tabs
5. **`ClientLogActivity`** — range picker, 4 summary cards, table
6. **`LoanLogForm` `embedded` prop** — shell owns chrome; `onLogged` refreshes activity
7. **`page.tsx`** — render shell

## Commit

Stage only Activity tab files; exclude unrelated workspace changes.
