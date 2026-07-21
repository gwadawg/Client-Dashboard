# Agent Goals Floor Board — Implementation Plan

Date: 2026-07-21  
Spec: `docs/superpowers/specs/2026-07-21-agent-goals-floor-board-design.md`

## Overview

Ship Agents hub v1: month-keyed Conversations goals, daily
dials goals, bulk Goals spreadsheet, and a rich-card
Performance board (Monthly | Daily).

## Prerequisites / findings

- `goals` table is **not** in `schema.sql` or migrations;
  app already upserts against
  `(client_id, agent_name, metric, period)`. Migration must
  **create** the table (with `month`), not only alter it.
- Agent scorecard shows use **booking** `agent_name` via
  `summarizeOutcomesByAgent` / enriched bookings.
- Agent-stats `conversations` = dial duration — **do not**
  reuse. New field: `show_lt_conversations`.
- Reuse `leadIdentityKey` from `src/lib/metrics.ts`.

## Task 1 — Migration: create `goals` + `month`

**Files**

- `supabase/migrations/add_goals_month.sql` (new)
- `supabase/schema.sql` (add goals DDL if present elsewhere
  is missing — append goals section)

**SQL sketch**

```sql
create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  agent_name text,
  metric text not null,
  target numeric not null,
  period text not null check (period in ('daily', 'monthly')),
  month text, -- YYYY-MM; null for daily
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- PG15+: treat null month as distinct key value
create unique index if not exists goals_unique_key
  on goals (client_id, agent_name, metric, period, month)
  nulls not distinct;
```

If `NULL NOT DISTINCT` unavailable, use two partial unique
indexes and app-level upsert (select → update/insert).

**Verify:** apply migration via Supabase MCP or CLI; confirm
table exists.

## Task 2 — Goals API: month filter + bulk upsert

**File:** `src/app/api/goals/route.ts`

- GET: optional `?month=YYYY-MM`; return `month` on rows
- POST: accept one object **or** `{ goals: [...] }`
- Monthly rows require `month`; daily force `month: null`
- Upsert conflict target matches unique index
- Empty / non-positive targets skipped on bulk save

**File:** `src/app/api/goals/[id]/route.ts` — leave delete as-is

**Verify:** manual curl or unit-style script with dry payload
shape; CCM dashboard still reads daily dial goals.

## Task 3 — Show∪LT Conversations per agent

**New helper** (prefer `src/lib/agent-show-lt-conversations.ts`
or extend `agent-appointment-stats.ts`):

`countShowLtConversationsByAgent(service, start, end, resolveAgent)`

1. Enriched bookings in range with show status → credit
   booking agent + `leadIdentityKey`
2. `live_transfer` events in range → credit event agent +
   same key
3. Per agent: `Set` union → size

**Wire into** `src/app/api/agent-stats/route.ts`:

- Always compute for **calendar month of `endDate`**
  (fallback today)
- Add to each agent row:
  `show_lt_conversations: number`
- Keep dial `conversations` unchanged

**Types:** `src/lib/agent-performance-types.ts`

**Tests:** `src/lib/agent-show-lt-conversations.test.ts`

- show only / LT only / both → 1
- neither → 0
- different agents → separate counts

## Task 4 — Goals spreadsheet UI

**Rewrite** `src/components/GoalTracker.tsx`

- Month picker (default from hub `endDate` month)
- Rows = active agents from agent-stats / roster
- Columns: Monthly Conversations, Daily dials
- Local draft state; **Save all** → bulk POST
- Skip empty cells
- Permissions: same as today (manage via existing gate)

**Verify:** set two agents, reload, values persist for that
month; change month → different/empty targets.

## Task 5 — Performance rich-card board

**Files**

- `src/components/AgentPerformance.tsx` — primary board
- New: `src/components/agent-performance/AgentGoalCard.tsx`
- Optional: keep chart/table collapsed below

**Behavior**

- Toggle Monthly | Daily (default Monthly)
- Sort by attainment %; no-goal agents last
- Monthly: `show_lt_conversations` vs monthly
  `conversations` goal for that month
- Daily: `today.dials` vs daily `dials` goal
- Rich card: rank, name, %, bar, current/goal, “X to go”
- Aesthetic: navy / amber / green / red (existing hub tokens)

**Verify:** with goals set, board ranks correctly; toggle
swaps metric; no-goal agents muted at bottom.

## Task 6 — Cleanup / docs

- Update design spec status to Approved / Implemented
- `GOAL_METRICS` / scorecard rings: dials still useful on
  Daily board; demote old multi-metric GoalTracker UX
- Note naming: UI “Conversations (show / LT)” vs dial
  conversations

## Execution order

1 → 2 → 3 → 4 → 5 → 6

Each task is independently verifiable before the next.

## Out of scope (do not build)

Team defaults, copy-forward, live actuals in editor, TV
board, monthly dials, daily appt/LT goals.
