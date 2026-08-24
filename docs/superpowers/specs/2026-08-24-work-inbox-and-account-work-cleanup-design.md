---
title: Work Inbox and Account Work Cleanup
status: draft
last_updated: 2026-08-24
artifact_type: design
related_docs:
  - docs/superpowers/specs/2026-08-18-client-work-log-design.md
  - docs/superpowers/specs/2026-08-18-change-submission-hierarchy-design.md
  - content/library/operations/people/kpi-review-meeting-sop.md
  - src/lib/account-week-plans.ts
  - src/lib/client-work-log.ts
  - src/lib/team-dashboards/cs.ts
  - src/components/team-dashboards/CsCommandDashboard.tsx
---

# Work Inbox and Account Work Cleanup

## Purpose

Keep **client account history** as a ledger of what shipped or was
observed, keep **week plans** as founder-gated assignments, and give
every seat a **Due today** plate on Team Command without a generic
task database.

Two sequential builds, one product. **Do not start Slice 2 until
Slice 1 is live** (LLM council, 2026-08-24).

1. Cleanup so plans, logs, and follow-ups are not the same object.
2. A read-time **work inbox** API that Team Command uses to list due
   work and complete *simple* items in place.

## Non-goals

- A `tasks` table (or any system-of-record) that follow-ups, bets,
  Closebot tickets, and plan tasks all write into.
- A top-level **My work** nav item in v1 (Team Command hosts the plate).
- Moving ClickUp onboarding tickets into Mr. Waiz.
- Putting credit/payroll queues, billing reminder cron, EOD, or CS
  calendar appointments on the inbox as todos.
- Finishing `client_calls.follow_up_due_at` into a real queue (Client
  File display only until a later migration into `cs_touchpoints`).
- Replacing Follow-ups, Account Work, Closebot, or work-log composers
  as create surfaces.
- Showing **unassigned** CS follow-ups on every CS seat (permission
  dump). Unowned work is not “mine.”
- A second complete implementation: inbox complete **must call the
  existing** plan-task and touchpoint writers (thin proxy at most).

## Problem

Operators now have overlapping “work” objects:

- Account Work **New plan** vs work-log **Bet** (same taxonomy on the
  plan form before anything shipped).
- `client_action_logs.status = planned` (ghost bets on charts) vs
  `account_plan_tasks` (real assignments).
- `meeting_commitments` still in Team Meetings after week plans
  replaced that KPI path.
- CS Follow-ups (`cs_touchpoints`), call follow-up datetimes, check-in
  free text, Closebot tickets, and Team Command lists that do not
  share a contract.

A universal task entity would hide that until complete-rules
(Slack snippet, Loom, founder approve, baseline freeze) collide.

A five-kind inbox before writes are honest, or a Due-today dump with
no owners, trains people to ignore the plate.

## Operating model

Three kinds of truth:

| Kind | Meaning | Write tables |
|------|---------|--------------|
| Assignment | Someone owes work | `account_plan_tasks`, `cs_touchpoints`, `closebot_tickets`, pending `account_week_plans` |
| Ledger | What happened | `client_action_logs` |
| Inbox | Due for a user today | **Read model only** — union API, not a new SoR |

**Plan** = week recovery package (why + tasks + founder approve).
**Task** = assignment (open / done / cancelled). Not a bet.
**Bet** = measured lever on the work log after it is **live**.
**Follow-up** = CS playbook touchpoint (snippet to complete).
**Inbox row** = pointer at one of the above.

The primitive is a **completion contract**, not a generic task. New
kinds later are extra **projectors** onto the same GET, not a new
ledger table.

Ad-hoc **Log work** from Client Workspace still writes the ledger
directly (no plan). Founder approval applies to **plans only**. That
matches the change-submission hierarchy spec.

### Supersedes (narrow)

This spec **replaces** these rules from earlier docs:

- Do not put finding / cadence / bet on the **create-plan** form.
  Classify at **complete** (or only on the work-log composer).
- Do not create **new** work-log rows with `status = planned` for
  bets. Intent-to-ship lives on an approved plan task until live.
  Existing ghost rows may remain until reviewed.
- KPI Monday/Thursday: **week plans only**. Freeze creating new
  `meeting_commitments` in that room (API may remain for old rows).

Unchanged: three work types, bet freeze/Loom rules, ad-hoc log door.

## Inbox contract

`GET /api/work-inbox?day=YYYY-MM-DD&scope=me|user&user_id=`

Default `day` = **call-center timezone** today (`America/Sao_Paulo`,
same as week plans). `scope=me` uses the session user. `scope=user`
requires Founder/CEO/owner and `user_id`.

Each item:

- `kind` — see v1 / v1.1 below
- `source_table`, `source_id`
- `client_id`, `client_name` (null if not client-scoped)
- `title`
- `label` — English source for UI (“Week-plan task”, “CS follow-up”,
  “Needs founder approve”)
- `due_at` (date or timestamptz, ISO)
- `assignee_user_id` (null only for unowned bucket, not personal plate)
- `complete_mode` — `inline` | `deep_link`
- `href` — dashboard query to the native screen
- `blocked_reason` — null, or why inline complete would fail

Built **at read time** in one lib (UNION of source queries). No
`tasks` table.

**Owners:** v1 personal plate only includes rows with
`assignee_user_id = session user` (plan tasks). CS follow-ups stay
off the personal plate until `work_inbox_owners` (or equivalent)
maps touchpoint or client → user. Until then, unowned open
touchpoints appear only on an **Unowned** list on the CS lead /
CS Command, not on every CS login.

### v1 sources (first inbox ship)

| Kind | Include when | Mine | Complete |
|------|----------------|------|----------|
| `plan_task` | Plan `approved`, task `open`, `scheduled_for` ≤ day (overdue first) | `assignee_user_id` | Inline if cadence/finding or unset → cadence. Deep-link if bet. |
| `cs_followup` | `open` or `snoozed`, `due_at` ≤ end of day, **and assigned** | Owner map | Inline with same snippet rules as Follow-ups |
| `plan_approve` | Plan `pending` | Founder/CEO/owner | Deep-link Account Work → Approve |

### v1.1 (after the plate is used for a week)

| Kind | Include when | Mine | Complete |
|------|----------------|------|----------|
| `closebot_ticket` | Open statuses | Assigned user, else CCM lead Unowned — **not** the whole CCM plate | Deep-link only |
| `bet_review` | Bet with `review_date` ≤ day, no outcome, open statuses | Creator, else layer seat; show once | Deep-link work log |

**Not on the inbox:** ClickUp, credit queues, billing reminders, EOD,
`cs_appointments` (stay “calls today” context on CS Command),
onboarding derived rows on Media Command (keep that queue; do not
fake tasks), `meeting_commitments`.

**Fold-in:** CS Command’s existing follow-up list and any overlapping
“due” widgets **must** be replaced or nested in this block so there
are not two Due-today surfaces.

### Complete path

Prefer **calling existing** `PATCH` plan-task and touchpoint routes
from the Team Command UI. If a `POST /api/work-inbox/:kind/:id/complete`
exists, it is a **proxy only** — same body, same validation, same
work-log insert. No new complete rules.

- Inline kinds: cadence/finding plan tasks, assigned follow-ups with
  snippet.
- Deep-link kinds: never complete via inbox (400 if POST exists).
- Idempotent: source already done → 200, no second log.
- Failure: source error; row stays open.

Permissions: session user is assignee, **or** Founder/CEO/owner, **or**
already allowed to complete that source today. `GET` of another user’s
plate: Founder/CEO/owner only.

Partial source failure on GET: omit that kind, return the rest, include
`warnings: [{ kind, message }]`.

## UI

v1: **Due today** at the **top** of each Team Command seat (CS, Media,
CCM, CEO). English `label` on every row. CEO/Founder person switcher.

CS Command: fold existing follow-up list into this block. Keep “calls
today” and EOD beside it, not as inbox rows. **Unowned** follow-ups:
CS lead only.

Deep-links open existing views. No second composer.

## Data notes (Postgres)

- Keep specialized tables and their indexes (`due_at`,
  `assignee_user_id + scheduled_for`, open-status partial indexes).
- Inbox queries must filter in SQL — do not pull large
  `client_action_logs` lists and filter in app.
- Default new `client_action_logs.work_type` should not be `bet`.
  Plan-task complete default **cadence**.
- Optional unique: one non-rejected week plan per `(client_id,
  week_start)` — not required for inbox v1.
- `work_inbox_owners`: `touchpoint_id` or `client_id` + `user_id`.
  CS lead owns the map. Not a generic task row. Ship **before**
  follow-ups appear on personal plates.

## Slice 1 — Cleanup (ship first; no inbox)

- `AccountWeekPlanForm` tasks: title, assignee, day, notes. No
  work-type / bet category / KPI on create.
- Complete task: default `cadence`. Finding optional. Bet only if
  the completer opts in and supplies category, hypothesis, success
  metric, Loom when live.
- `createClientActionLog`: do not accept new bets with
  `status = planned` (or with null `change_date` intended as “we will
  ship”). Workspace composer: live bet or finding/cadence only.
- Team Meetings: hide or disable new `meeting_commitments` on Mon/Thu
  KPI templates; week plan form/list remains.
- SOP: completing a task files the log; bet is opt-in at complete.
  Cadence is the default diary row.

## Slice 2 — Inbox (only after Slice 1 is live)

- Lib + GET; UI complete via existing PATCH (or thin proxy).
- Due today on all four seats; CS follow-up fold-in; Unowned bucket
  for CS lead.
- v1 kinds only; v1.1 Closebot / bet review later.

## Tests

- Approved open plan task scheduled today appears for that assignee;
  pending-plan tasks do not.
- Complete cadence task from plate: one `client_action_logs` cadence
  row, task `done`, item gone from GET.
- Bet-classified task: no inline complete; `complete_mode = deep_link`.
- Non-CEO `scope=user` → 403.
- Follow-up complete without snippet still fails if Follow-ups
  requires snippet.
- Unassigned follow-up does **not** appear on a non-lead CS personal
  plate.
- GET still 200 if an optional kind query fails (`warnings` set).

## Success criteria

- After Slice 1: operators cannot create a plan that looks like a
  live bet; new ghost bets are blocked.
- After Slice 2: CS, Media, CCM, and Founder/CEO each see Due today
  for **their** assignments (Founder can switch person).
- Easy items complete on the plate; bets, plan approve, and Closebot
  complete only on native screens.
- Client file: plans ≠ ledger. Bets overlay KPIs only when live.
- No Create Task that writes a shared tasks table.
- Kill metric (ops): share of Due-today rows touched (complete or
  deep-link) within 7 days — if near zero, the plate is wallpaper.

## Rollout

Ship Slice 1. Confirm a week of Monday plans without work-type on
create. Then Slice 2 behind a flag if needed. Do not land the UNION
API as the first PR.
