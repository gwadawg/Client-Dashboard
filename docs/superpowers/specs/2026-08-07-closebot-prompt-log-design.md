# Closebot Prompt Log + Agent Directory

Date: 2026-08-07  
Status: Implemented (ready for QA)  
Surfaces:

- Ops → **Closebot Log** (timeline of prompt changes)
- Resource Library → **Closebot Agents** (managed agent directory)

## Problem

When Closebot prompts change in response to tickets or bugs, there is no
in-app record of *what* shipped, *why*, *which agent*, or *whether it
worked*. Team memory and ticket threads scatter the history. When the
next related ticket lands, operators cannot quickly answer: “Did we
already try a fix for this? On which agent? Did it work?”

## Goals

1. Log every Closebot prompt update with date, full prompt text, reason,
   problem solved, and reference links (tickets/bugs).
2. Manage Closebot agents natively in the Resource Library; every log
   row **relates** to an agent via foreign key.
3. Track outcome with a simple status: open · watching · worked · did
   not work · reverted.
4. Present a filterable **timeline** so operators can review what worked
   and what did not.
5. Permission-gate create/edit to ops writers; viewer can read if they
   have the view permission.

## Non-goals (v1)

- Auto-sync from the Closebot product API
- Automatic prompt diffs / version graph (`supersedes_id`)
- General product/code/ops system changelog (Closebot only)
- Client Action Log–style review windows and KPI baselines
- Hard-delete of log rows
- Human call-center roster agents as “agents” in this feature

## Decisions locked

| Topic | Decision |
|-------|----------|
| Scope | Closebot AI prompt changes only |
| Approach | Flat log table + timeline UI (not version chain, not generic changelog) |
| Agents | Dedicated `closebot_agents` directory, managed in Resource Library |
| Log ↔ agent | `agent_id` FK; no free-text agent name on logs |
| Archive | Soft-archive agents (`is_active = false`); do not cascade-delete |
| Outcome | Immediate status on create/edit (not review-window workflow) |
| Statuses | `open` · `watching` · `worked` · `did_not_work` · `reverted` |
| Default status | `watching` |
| Placement | Ops sidebar entry for logs; Library section for agents |
| Permissions | Dedicated view key + write for ops writers (see Auth) |
| Prompt storage | Full pasted prompt on each log row |
| Reference links | `text[]` of `http(s)` URLs |
| Delete | No hard-delete v1; use status `reverted` for bad ships |

## Architecture

```text
Resource Library
  └── Closebot Agents (CRUD directory)
         ▲
         │ agent_id (FK)
         │
Ops → Closebot Log
  ├── Filters (agent, status, date range)
  ├── Timeline (newest first)
  └── Log update form (select agent → details → prompt → status)
```

### Data model

#### `closebot_agents`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK | `gen_random_uuid()` |
| `name` | `text` not null | Display name |
| `slug` | `text` not null unique | Stable key for APIs / deep links |
| `description` | `text` null | Optional purpose blurb |
| `is_active` | `boolean` not null default true | Archived when false |
| `sort_order` | `int` not null default 0 | List ordering |
| `created_at` | `timestamptz` not null | |
| `updated_at` | `timestamptz` not null | |

Indexes:

- unique on `slug`
- `(is_active, sort_order, name)` for directory lists
- optional count of logs can be computed at query time

#### `closebot_prompt_log`

| Column | Type | Notes |
|--------|------|--------|
| `id` | `uuid` PK | |
| `agent_id` | `uuid` not null | FK → `closebot_agents(id)` **ON DELETE RESTRICT** |
| `changed_at` | `timestamptz` not null | When the prompt went live |
| `prompt_body` | `text` not null | Full prompt paste |
| `problem_solved` | `text` not null | Short problem statement |
| `change_reason` | `text` not null | Why we made the change |
| `reference_urls` | `text[]` not null default `{}` | Ticket / bug / Slack / doc links |
| `status` | `text` not null | Check constraint on enum values |
| `outcome_notes` | `text` null | Optional when status advances |
| `created_by` | `uuid` null | Session user id (if FK to users exists; else text/uuid without FK) |
| `updated_by` | `uuid` null | |
| `created_at` | `timestamptz` not null | |
| `updated_at` | `timestamptz` not null | |

Constraints:

- `status in ('open','watching','worked','did_not_work','reverted')`
- non-empty trimmed checks enforced in app validation (DB can allow text)

Indexes (Postgres best practices):

- `(changed_at DESC)` — default timeline
- `(agent_id, changed_at DESC)` — agent history
- partial: `(status)` **where** `status in ('open','watching')` — open work

### Why not `library_documents` for agents?

Library playbooks are markdown content (`artifact_type` includes
`prompt` for SOPs/playbooks). Agents are **lookup options** that need
stable IDs for FKs, soft archive, and fast dropdowns. A small directory
table under the Library **UI** is the right home; content model stays
separate.

## UI

### Resource Library — Closebot Agents

New section alongside Playbooks / Forms / Links:

- List: name, description, active/archived, optional log count
- Add agent: name (required), description (optional); derive `slug` from name with uniqueness suffix if needed
- Edit name/description; archive / reactivate
- Writers with log write permission (or admin/owner) may manage agents

### Ops — Closebot Log

**Header:** title + one-line purpose + **Log update** CTA.

**Filters:** agent (any | id) · status · optional date range on `changed_at`.

**Timeline (newest first):** compact rows with:

- Date · agent name · status chip
- Problem solved (headline)
- Why (clamped; expand for full)
- Reference link chips (new tab)
- Meta: author · last update

Expand / detail:

- Full `prompt_body` (pre-wrap, copy button)
- Full reason + outcome notes
- Status control + outcome notes field

**Form (modal or drawer):**

1. Agent (active only; link “Manage agents → Library”)
2. Live date (`changed_at`)
3. Problem this solves
4. Why we changed it
5. Reference URLs (multi-add)
6. New prompt (large textarea)
7. Status (default `watching`)
8. Save

Empty states:

- No agents → prompt to create first agent in Library
- No logs → “Log your first prompt change”
- Archived agent on historical row → name + “Archived” badge

### Visual language

Match existing dark ops dashboard patterns (status chips similar to
Client Action Log). Dense, scannable timeline. Prompt body secondary
until expanded. Stay inside the app shell (not a marketing landing
layout).

## Auth & navigation

| Key | Purpose |
|-----|---------|
| View key | e.g. `closebot_log` — see nav item + GET APIs |
| Write | Same key or explicit write capability used for POST/PATCH agents + logs |

Wire:

- `src/lib/nav.ts` — new Ops `View` (e.g. `closebot_log`)
- `permissions` / UserManager — assignable like other views
- `DashboardView` — lazy-load the log surface
- Library section — agents CRUD behind write (or admin)

Session enforced via existing `api-auth` patterns (no direct browser
writes with public keys).

## API

Base under `/api/closebot/…`. All mutations require write; GETs require view.

### Agents

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/closebot/agents` | List; `?active=1` for log dropdown only |
| `POST` | `/api/closebot/agents` | Create |
| `PATCH` | `/api/closebot/agents/[id]` | Update name, description, sort, `is_active` |

### Logs

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/closebot/logs` | Filtered list; join agent name; default newest first; page size cap (e.g. 50) |
| `POST` | `/api/closebot/logs` | Create; agent must exist and be active |
| `PATCH` | `/api/closebot/logs/[id]` | Edit fields + status + outcome notes |
| `GET` | `/api/closebot/logs/[id]` | Optional full detail (if list omits large prompts) |

### Validation

- `agent_id` required; must exist
- New log: agent must be `is_active`
- `prompt_body`, `problem_solved`, `change_reason` required (trim non-empty)
- `changed_at` required as date/timestamptz; store `timestamptz` (date-only UI → start of that day UTC, documented in implementation)
- `reference_urls`: array; each entry valid `http:` or `https:` URL
- `status` restricted to enum
- Set `created_by` / `updated_by` from session

### Errors

| Case | HTTP |
|------|------|
| Unauthenticated | 401 |
| Forbidden | 403 |
| Invalid body | 400 + field messages |
| Missing id | 404 |
| Missing agent FK | 400 |
| Unexpected DB error | 500 (server log) |

### Performance notes

- List endpoint may omit or truncate `prompt_body` when too large; load full on expand/detail
- Use designed indexes; join agents for labels in list
- Cap page size + offset/cursor if volume grows

## Primary flows

1. **Add agent** — Library → Closebot Agents → name (+ description) → active.
2. **Log prompt change** — Ops → Log update → agent, date, problem, why, links, prompt → status `watching`.
3. **Ticket follow-up** — open entry → set status to worked / did_not_work / reverted + outcome notes (+ optional link).
4. **Review history** — filter by agent and/or status; expand prior prompts for comparison.

## Acceptance tests

1. Writer creates an agent in Library; it appears in the log form dropdown.
2. Writer creates a log; it appears at the top of the timeline with correct agent and status.
3. Inactive agent is hidden from new-log dropdown; historical rows still show agent name + archived badge.
4. Filters by agent, status, and date range return expected subsets.
5. PATCH status + outcome notes persists and shows on expand.
6. User without write permission cannot POST/PATCH (403); without view cannot see nav/GET (403).
7. Invalid URL or empty prompt returns 400.
8. Attempt to delete agent with existing logs is rejected (RESTRICT) or only archive is allowed in UI.

## Migration & rollout

1. Migration: create `closebot_agents` + `closebot_prompt_log` + indexes + status check.
2. Seed: zero or one example agent only if product wants a starter; otherwise empty + empty states.
3. Ship nav + permissions; grant ops writers.
4. No backfill from external systems in v1.

## Open implementation details (not product decisions)

These do not change the product shape; resolve during the implementation plan:

- Exact permission key string and whether write is a separate capability vs admin-bypass only
- Modal vs drawer for the form
- Whether agent slug is editable after create
- Exact page-size / cursor strategy
- `created_by` FK target (auth users table name in this repo)
