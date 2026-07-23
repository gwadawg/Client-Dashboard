# Weekly Focus: Dialer Assignments

Date: 2026-07-23  
Status: Approved for planning  
Hub: Call Center Hub (`agents`) → tab `weekly_focus`  
Supersedes (Focus target only): `2026-07-21-weekly-focus-design.md`

## Problem

Weekly Focus still plans around **client** priority blocks. Ops now
plan around **dialers** (named queues / power-dialer lists) that
control how leads are worked. Managers need to assign agents to
dialers as timed blocks, and they need the Watch calendar to show the
full week picture: watch shifts **and** dialer assignments together.

## Goals

1. Replace client focus with dialer assignments (day + time window +
   required agent + dialer + optional notes + status).
2. Maintain a stock dialer library (add / remove) from Weekly Focus.
3. Show watch shifts and dialer blocks on the Watch calendar in split
   lanes per day.
4. Allow create / edit / delete of dialer blocks from both the Dialers
   board and the Watch calendar.
5. Keep Setter Availability on the same surface.

## Non-goals

- Linking dialers to clients, GHL smart lists, or Hot Prospector IDs
  in v1 (name + schedule only)
- Soft-archive / deactivate dialers (hard delete with cascade)
- Blocking overlaps between watch and dialer for the same agent
- Migrating historical client focus rows (wipe on ship)
- Changing Setter Availability behavior

## Decisions locked

| Topic | Decision |
|-------|----------|
| Approach | Evolve Focus in place (Approach 1) |
| Table | Rename `focus_schedule` → `dialer_schedule` |
| Dialer identity | Stock catalog; managers add/remove names |
| Catalog UI | “Manage dialers” on Dialers tab |
| Assignment shape | Timed block: date + time_start/time_end |
| Agent | Required on every dialer block |
| Status | Keep `scheduled` \| `done` \| `skipped` |
| Notes | Optional free text |
| Watch overlay | Split lanes: Watch \| Dialers per day |
| CRUD surfaces | Both Dialers board and Watch |
| Watch create defaults | Slot hour → `HH:00`–`(HH+1):00`; editable |
| Remove dialer | Cascade delete its schedule blocks |
| Old focus data | One-time wipe of client focus rows |
| Permission | Same as Weekly Focus (`agents` \| `schedule`) |

## Data model

### New: `dialers`

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `name` | text, required, unique (case-insensitive) |
| `created_at` | timestamptz not null default now() |

### Evolve: `focus_schedule` → `dialer_schedule`

Rename in the same migration after wiping rows (clean break;
Approach 1 still reuses Focus board/validation patterns in code).

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `dialer_id` | uuid not null → `dialers(id)` ON DELETE CASCADE |
| `agent_id` | uuid not null → `agents(id)` |
| `scheduled_date` | date not null |
| `time_start` | text HH:MM (24h) |
| `time_end` | text HH:MM (24h); must be after start |
| `status` | `scheduled` \| `done` \| `skipped` |
| `notes` | optional text |
| `created_at` | timestamptz not null default now() |

Indexes: `(scheduled_date)`, `(dialer_id, scheduled_date)`,
`(agent_id, scheduled_date)`.

### Unchanged

- `watch_schedule`
- `setter_availability`

### Removed from this surface

- Client as focus target (`client_id` on schedule rows)

## APIs

| Route | Methods |
|-------|---------|
| `/api/dialers` | GET, POST |
| `/api/dialers/[id]` | DELETE |
| `/api/dialer-schedule` | GET (`week_start`), POST |
| `/api/dialer-schedule/[id]` | PATCH, DELETE |
| `/api/watch-schedule*` | unchanged |
| `/api/setter-availability*` | unchanged |

Removed: `/api/focus-schedule*`.

Validation: require `dialer_id`, `agent_id`, `scheduled_date`,
`time_start`, `time_end`; reject when `time_end <= time_start`;
status must be one of the three allowed values when set.

## UI

### Hub tabs (inner)

Dialers | Watch | Setter Availability  
Default tab: Dialers (same role as today’s Focus).

Update Weekly Focus subtitle: dialer planning + watch + availability
(no “client priority”).

### Dialers board (evolved Focus day-column board)

- Mon–Sun columns; cards sorted by `time_start`
- Card: dialer name, agent, time range, status tint
- **+ Add dialer block**: dialer (required), agent (required), date,
  start/end, notes optional, status
- Edit / change status / delete on each card
- **Manage dialers**: list + add name + remove, with confirm:
  “Removes this dialer and all its schedule blocks”

### Watch (combined calendar)

- Same week nav + hour grid (8–20)
- Each day column splits into **Watch** lane | **Dialers** lane
- Watch lane: existing drag/drop/resize agent shifts
- Dialers lane: timed blocks labeled `Agent · Dialer`; click to edit;
  **+** or drag-create opens the dialer-block form (date/time
  pre-filled from the slot)
- Legend: Watch vs Dialers colors

### Setter Availability

Unchanged.

## Error handling

- Inline / toast errors on API failure (same pattern as today)
- Create/edit dialer block: reject missing dialer or agent; field-level
  errors in the modal
- Delete dialer: confirm modal stating cascade, then toast
- Watch create/edit: same validation; if dialer list is empty, prompt
  to add one via Manage dialers before saving
- No watch ↔ dialer conflict blocking (overlaps allowed; lanes keep
  them readable)
- Empty states: Dialers board and Dialers lane show clear empty copy

## Testing

- **Catalog:** create dialer (unique name), list, delete and assert
  cascade removes schedule rows
- **Dialer schedule API:** create with required fields; reject missing
  agent/dialer and invalid times; list by week; patch; delete
- **UI:** Dialers tab CRUD + Manage dialers; Watch split lanes for
  shared week; create/edit dialer block from Watch; Availability
  unchanged; hub copy no longer says “client priority”
- **Migration:** apply schema change; confirm old client focus rows
  wiped and new columns enforce required `dialer_id` / `agent_id`

## Out of scope follow-ups

- Wire dialer names to GHL smart lists / Hot Prospector campaigns
- Soft-archive dialers instead of cascade delete
- Watch ↔ dialer conflict warnings
