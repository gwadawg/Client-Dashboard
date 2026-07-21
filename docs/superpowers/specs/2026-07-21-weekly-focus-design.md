# Weekly Focus Redesign

Date: 2026-07-21  
Status: Implemented  
Hub: Call Center Hub (`agents`) → tab `weekly_focus`

## Problem

The Power Dialer Schedule was built around auto-generating dial
sessions from recurring client calling windows joined to watch
hours. The team no longer plans that way. Managers need a
start-of-week board for **which client accounts to prioritize**,
with timed focus blocks and assignees, while still seeing who is
on watch and maintaining setter availability for Speed-to-Lead.

## Goals

1. Plan weekly client focus as timed blocks (day + time window +
   optional assignee + notes).
2. Keep the Watch schedule so the team can see who is on watch.
3. Keep Setter Availability on the same surface (STL filter).
4. Remove PD auto-generate, Client Windows, and the standalone
   sidebar nav item.

## Non-goals

- Offer as a first-class focus target (notes only for context)
- Watch-gated assignment (assignee is free-pick)
- Migrating historical `pd_schedule` rows into focus
- Dropping `pd_schedule` / `client_calling_windows` tables in v1

## Decisions locked

| Topic | Decision |
|-------|----------|
| Placement | Call Center Hub tab `weekly_focus` |
| Inner tabs | Watch \| Focus \| Setter Availability |
| Focus target | Client only; optional free-text notes |
| Timing | Day + `time_start` / `time_end` |
| Assignment | Free assign any setter; nullable |
| Status | `scheduled` \| `done` \| `skipped` |
| Focus UI | Day-column week board |
| Week default | Next Monday; shared nav Watch ↔ Focus |
| Old PD / windows | Remove UI + APIs; leave tables unread |
| Permission | Hub access like other agents tabs; fold legacy `schedule` into agents children; APIs accept `agents` or `schedule` |

## Data model

### New: `focus_schedule`

| Column | Notes |
|--------|-------|
| `id` | uuid PK |
| `client_id` | required → `clients` |
| `agent_id` | nullable → `agents` |
| `scheduled_date` | date |
| `time_start` | text HH:MM (24h) |
| `time_end` | text HH:MM (24h); must be after start |
| `status` | `scheduled` \| `done` \| `skipped` |
| `notes` | optional text |
| `created_at` | timestamptz |

Indexes: `(scheduled_date)`, `(client_id, scheduled_date)`.

### Unchanged

- `watch_schedule`
- `setter_availability`

### Deprecated (no writes in v1)

- `pd_schedule`
- `client_calling_windows`

## APIs

| Route | Methods |
|-------|---------|
| `/api/focus-schedule` | GET (`week_start`), POST |
| `/api/focus-schedule/[id]` | PATCH, DELETE |
| `/api/watch-schedule*` | unchanged (permission: `agents` \| `schedule`) |
| `/api/setter-availability*` | unchanged (permission: `agents` \| `schedule`) |

Removed: `/api/pd-schedule*`, `/api/client-windows*`.

Validation: require `client_id`, `scheduled_date`, `time_start`,
`time_end`; reject when `time_end <= time_start`.

## UI

### Hub

- Add **Weekly Focus** to Call Center Hub tabs.
- Remove Team sidebar **Power Dialer Schedule**.
- Redirect `view=schedule` → `view=agents&tab=weekly_focus`.

### Focus board

- Mon–Sun columns; cards sorted by `time_start`.
- Status tint: amber scheduled, green done, muted skipped.
- **+ Add focus** modal: client, date, start/end, assignee
  (optional), notes (optional).
- Card: edit, status, reassign, delete.

### Watch

- Existing hour grid + drag setters; remove Generate PD.

### Setter Availability

- Existing recurring-window CRUD; unchanged behavior.

## Error handling

- Inline / toast errors on API failure.
- Unassigned assignee is valid.
- No watch-conflict blocking.

## Testing

- API create / list-by-week / patch status / delete + validation.
- Hub tab renders three sub-tabs; legacy schedule URL redirects.
