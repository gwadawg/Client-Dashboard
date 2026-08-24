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

Two sequential builds, one product:

1. Cleanup so plans, logs, and follow-ups are not the same object.
2. A read-time **work inbox** API that Team Command (all seats,
   including Founder/CEO) uses to list due work and complete *simple*
   items in place.

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

Default `day` = call-center today. `scope=me` uses the session user.
`scope=user` requires Founder/CEO/owner and `user_id`.

Each item:

- `kind` — `plan_task` | `cs_followup` | `closebot_ticket` | `plan_approve` | `bet_review`
- `source_table`, `source_id`
- `client_id`, `client_name` (null if not client-scoped)
- `title`
- `due_at` (date or timestamptz, ISO)
- `assignee_user_id` (null allowed)
- `complete_mode` — `inline` | `deep_link`
- `href` — dashboard query to the native screen
- `blocked_reason` — null, or why inline complete would fail

Built **at read time** in one lib (UNION of source queries). No
`tasks` table. Optional later: `work_inbox_owners` mapping
touchpoints (or clients) to a user when the source has no assignee.

### v1 sources

| Kind | Include when | Mine | Complete |
|------|----------------|------|----------|
| `plan_task` | Plan `approved`, task `open`, `scheduled_for` ≤ day (overdue first) | `assignee_user_id` | Inline if work type is cadence or finding (or unset → cadence). Deep-link if bet (Loom + category + KPI). |
| `cs_followup` | `open` or `snoozed`, `due_at` ≤ end of day | v1: all users with CS Follow-ups permission if no owner map; else mapped user | Inline with same snippet rules as Follow-ups, or deep-link |
| `closebot_ticket` | Open statuses (`new`, `investigating`, `ticket_open`) | CCM permission plate in v1 (not per-agent until assigned) | Deep-link only |
| `plan_approve` | Plan `pending` | Founder/CEO/owner | Deep-link Account Work → Approve |
| `bet_review` | Bet with `review_date` ≤ day, no outcome yet, open statuses | Creator, or Media/CS plate by layer (L1/L2 → Media; else CS). If both match, show once. | Deep-link work log / Client Health |

**Not on the inbox:** ClickUp, credit queues, billing reminders, EOD,
`cs_appointments` (stay “calls today” context on CS Command),
onboarding derived rows on Media Command (keep that queue; do not
fake tasks), `meeting_commitments`.

### Complete router

`POST /api/work-inbox/:kind/:id/complete` with the body the source
already expects (e.g. `completion_report`, `work_type`, snippet).

- Inline kinds call existing writers (`PATCH` plan task, touchpoint
  done). Same validation. Same work-log insert on plan-task done.
- Deep-link kinds return **400** with “complete on the source screen”
  — inbox never marks a bet live, never approves a plan, never
  resolves Closebot.
- Idempotent: source already done → 200, no second log.
- Failure: return the source error; row stays open.

Permissions: session user is assignee, **or** Founder/CEO/owner, **or**
already allowed to complete that source today. `GET` of another user’s
plate: Founder/CEO/owner only.

Partial source failure on GET: omit that kind, return the rest, include
`warnings: [{ kind, message }]`.

## UI

v1: **Due today** block at the top of each Team Command seat
(CS, Media, CCM, CEO). Same API; CEO/Founder person switcher on the
block.

CS Command: fold the existing follow-up list into this block so there
are not two due lists. Keep “calls today” and EOD beside it, not as
inbox rows.

Deep-links open existing views (Account Work, Follow-ups, Closebot,
Client Workspace / Client Health work log). No second composer.

Later (not v1): Team Command can keep embedding the same API; a
dedicated tab is optional if the block is too dense.

## Data notes (Postgres)

- Keep specialized tables and their indexes (`due_at`,
  `assignee_user_id + scheduled_for`, open-status partial indexes).
- Inbox queries must filter in SQL (client, day, status, assignee) —
  do not pull large `client_action_logs` lists and filter in app
  (today’s ad-hoc plan attach pattern is not the inbox pattern).
- Default new `client_action_logs.work_type` should not be `bet`
  (schema/parser fallback today). New inserts: explicit type;
  plan-task complete default **cadence**.
- Optional unique: one non-rejected week plan per `(client_id,
  week_start)` — separate small migration if we take it; not required
  for inbox v1.
- `work_inbox_owners` (later): `touchpoint_id` or `client_id` +
  `user_id`, not a generic task row.

## Slice 1 — Cleanup

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
- SOP: completing a task files the log; bet is opt-in at complete,
  not “always bet.” Cadence is the default diary row.

## Slice 2 — Inbox

- Lib + GET/POST routes + tests listed below.
- Team Command Due today on all four seats; CS follow-up fold-in.
- Hybrid complete as specified.

## Tests

- Approved open plan task scheduled today appears for that assignee;
  pending-plan tasks do not.
- Complete cadence task from inbox: one `client_action_logs` cadence
  row, task `done`, item gone from GET.
- Bet-classified task: inbox POST complete → 400; GET
  `complete_mode = deep_link`.
- Non-CEO `scope=user` → 403.
- Follow-up complete without snippet still fails if Follow-ups
  requires snippet.
- GET still 200 if Closebot query fails (`warnings` set).

## Success criteria

- CS, Media, CCM, and Founder/CEO each see Due today on Team Command
  for their login (Founder can switch person).
- Easy items complete on the plate; bets, plan approve, and Closebot
  complete only on native screens.
- Client file: plans ≠ ledger. Bets overlay KPIs only when live.
- No Create Task that writes a shared tasks table.

## Rollout

Ship Slice 1 before Slice 2 so the union is not lying. Feature-flag
the Due today block if needed; API can land first behind the flag.
