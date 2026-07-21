# Agent Goals & Floor Board Design

Date: 2026-07-21  
Status: Implemented (v1)
Hub: Agents (Call Center)

## Problem

Agents and managers need a clearer shared view of whether
reps are hitting goals. Today, Goals only supports per-agent
daily targets (dials / appointments / pickups / shows) with
no monthly outcome goal, no live-transfer-aware Conversations
metric, no bulk month-start entry, and no full-team progress
board ranked by attainment.

## Goals (product)

1. Agents and managers see the same transparent floor board.
2. Monthly hero metric is Conversations progress toward a
   per-agent target.
3. Daily activity goal is dials only (independent of monthly).
4. Managers set targets in a spreadsheet-style grid at month
   start and save in bulk.

## Non-goals (v1)

- Team-default or tier-based goal templates
- Monthly dials goals; daily appointments / LT goals
- Copy-forward from prior month
- Separate Floor Board / TV-only surface
- Month “campaign” snapshot entities beyond `month`-keyed rows
- Live actuals columns inside the Goals editor

## Decisions locked

| Topic | Decision |
|-------|----------|
| Audience | Both agents and managers; thin vertical slice of both |
| Goal ownership | Per-agent only |
| Daily vs monthly | Independent targets |
| Monthly metric | Conversations = unique leads with show ∪ live_transfer |
| Credit | Booking / claim agent (same as scorecards) |
| Daily metric | Dials only |
| Visibility | Full team board for everyone |
| Goals entry | Spreadsheet grid; Save all |
| Performance layout | Rich cards; Monthly \| Daily toggle |
| Default mode | Monthly |
| Month keying | `month` (`YYYY-MM`) on monthly goal rows |

## Metric: Conversations (show / LT)

**Definition:** Count of unique leads for which the credited
agent has at least one `show` **or** `live_transfer` event in
the calendar month.

**Uniqueness:** Prefer `ghl_contact_id`; fall back to the same
lead identity keys used elsewhere in agent stats if contact id
is missing.

**Credit:** Booking / claim `agent_name` on the credited event
path (aligned with existing agent appointment / credit logic).

**UI label:** “Conversations (show / LT)” so it is not confused
with dial-analytics “conversations” (calls over duration
threshold).

**Attainment %:** `round(current / target * 100)`, capped at
100 for bar fill; still show raw `current / target`.

## Data model

Extend existing `goals` table (no new campaign entity).

| Column | Notes |
|--------|-------|
| `client_id` | Keep for upsert uniqueness; use roster sentinel as today |
| `agent_name` | Required for v1 agent goals |
| `metric` | `conversations` (monthly) or `dials` (daily) |
| `target` | Positive number |
| `period` | `monthly` or `daily` |
| `month` | `YYYY-MM` for monthly rows; null for daily |

**Uniqueness**

- Monthly: `(client_id, agent_name, metric, period, month)`
- Daily: `(client_id, agent_name, metric, period)` with
  `month` null (same daily target every day until edited)

Migration must adjust the existing unique constraint to
include `month` without breaking daily rows.

## APIs

- `GET /api/goals` — include `month`; filter by month when
  provided
- `POST /api/goals` — accept a single goal or a bulk array for
  Save all; upsert on the uniqueness key above
- `DELETE /api/goals/[id]` — unchanged

Progress for the board may be:

- computed in an extended agent-stats (or sibling) response for
  the selected calendar month, or
- a small dedicated progress helper used by Performance

Either way, Conversations must be unique-lead show∪LT, not
event-sum and not dial-duration conversations.

## UI

### Performance tab

- Toggle: **Monthly** | **Daily** (default Monthly)
- Grid of **rich cards**, one per active agent, sorted by
  attainment % descending
- Card contents:
  - Rank
  - Agent name
  - Large attainment %
  - Progress bar
  - `current / goal`
  - Remaining (“X to go”) when under goal
- Monthly mode: Conversations (show / LT) for the **calendar
  month of `endDate`** from the hub date controls (falls back
  to current month if unset). Goals editor month picker
  defaults the same way.
- Daily mode: same card chrome; metric = today dials vs daily
  dials goal
- Agents with no goal: shown muted with “No goal set” / CTA
  toward Goals tab; sort to bottom
- Aesthetic: dark navy hub, amber pace accents, green ≥100%,
  amber mid, red behind — industrial scoreboard, not soft SaaS

Existing comparison chart / dense table may remain below or
be deferred; the rich-card board is the primary surface.

### Goals tab

- Month picker (default current `YYYY-MM`)
- Spreadsheet: rows = active agents; columns =
  - Monthly Conversations target
  - Daily dials target
- **Save all** bulk upsert
- Empty cells: do not write zero goals
- No live actuals column in v1

## Permissions

Reuse existing Agents / Goals permissions:

- Read board: anyone who can view agent performance / goals
- Write goals: same permission gate as today’s Goals POST
  (`agents` manage path)

## Error handling

- Bulk save: all-or-nothing transaction if feasible; otherwise
  return per-row errors and keep successful upserts visible on
  reload
- Missing month on monthly metric → 400
- Invalid / unknown agent names → skip or 400 with clear message
- Progress query failure → empty board with error banner, not
  silent zeros that look like “0 conversations”

## Testing

- Unique-lead Conversations: show only, LT only, both (count 1),
  neither (count 0)
- Credit follows booking/claim agent
- Monthly goals for month A do not overwrite month B
- Daily dials goals ignore `month`
- Bulk upsert creates/updates both metrics per agent
- Board sort: with goals by %; no-goal agents last
- Label / metric key does not collide with dial-duration
  conversations in APIs used by the board

## Rollout

1. Migration + API bulk/month support
2. Conversations progress computation
3. Goals spreadsheet UI
4. Performance rich-card Monthly | Daily board
5. Remove or demote obsolete single-agent daily-only Goals UX
   and unused daily metrics from the v1 editor (appointments /
   pickups / shows stay out of the spreadsheet; historical
   rows may remain in DB)

## Open implementation notes

- Confirm exact booking/claim credit field path in
  `agent-appointment-stats` / credit queue when implementing
  (must match scorecard appointment credit, not dial agent
  alone)
