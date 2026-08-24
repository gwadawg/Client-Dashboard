# Slice 1 — Account work cleanup (implementation plan)

Date: 2026-08-24  
Spec: `docs/superpowers/specs/2026-08-24-work-inbox-and-account-work-cleanup-design.md`  
**Do not start Slice 2 (work inbox API / Team Command Due today) in this pass.**

## New-chat starter (paste as the first user message)

```
Read and follow docs/superpowers/specs/2026-08-24-work-inbox-and-account-work-cleanup-design.md
and docs/superpowers/plans/2026-08-24-work-inbox-slice-1-cleanup.md

Implement Slice 1 only (cleanup). Do not build GET /api/work-inbox or a Due today Team Command block.

Goal: plans are assignments (person + day); work log is shipped/observed; bets are live-only; freeze new meeting_commitments on Mon/Thu KPI.

Verify in the browser (or closest substitute) after UI changes.
```

## Overview

Stop operators from logging a **bet** when they create a **week plan**. Completing a plan task defaults to **cadence** on `client_action_logs`. New bets cannot be `status = planned`. Hide new KPI meeting commitments; week plans stay.

## Task 1 — Plan form: no work type on create

Files:

- `src/components/AccountWeekPlanForm.tsx`
- `src/app/api/account-week-plans/route.ts` (POST tasks)
- `src/lib/account-week-plans.ts` if types require it

Remove from the create-task UI and POST payload: `work_type`, bet category (`tactic_tag` as bet category), `success_metric`. Keep title, assignee, day, notes.

Server: accept tasks without `work_type` (store null or omit). Do not require bet fields on create.

Tests: form/API tests if they exist; add a POST fixture that creates a plan with title-only tasks.

## Task 2 — Complete: default cadence; bet opt-in

Files:

- `src/components/AccountWeekPlansWeekList.tsx` (complete UI)
- `src/app/api/account-plan-tasks/[id]/route.ts`

Default `work_type` on complete = `cadence` (`parseWorkType(..., 'cadence')`, never `'bet'`).

Bet only if the user opts in and supplies category, hypothesis, success metric, Loom when live — same rules as today for bet complete.

Finding remains optional.

## Task 3 — Block new planned/ghost bets on write

Files:

- `src/lib/client-action-log-write.ts`
- `src/lib/client-work-log.ts` (`parseWorkType` call sites that default to `'bet'`)
- `src/components/WorkLogComposer.tsx`
- `src/app/api/client-actions/route.ts` and `[id]/route.ts` if they set planned bets
- `src/lib/client-work-log.test.ts`

`createClientActionLog`: if `work_type === 'bet'`, reject `status === 'planned'` and reject missing `change_date` (live only). Fallback for missing `work_type` must not be `bet` (use `cadence` or require explicit type).

Composer: live bet or finding/cadence only — no “planned bet” path.

Existing ghost rows stay; do not migrate.

Fix chart/history filters that use `parseWorkType(x, 'bet')` only where that hid missing types as bets; prefer `'cadence'` or treat null as unknown, not bet.

## Task 4 — Freeze meeting commitments on Mon/Thu KPI

Files:

- `src/components/TeamMeetings.tsx` (~1186 `MeetingCommitmentsPanel`)
- `src/app/api/meeting-commitments/route.ts` if POST should 400 for KPI templates

Hide or disable **new** commitments on `mon-kpi-week-plan` and `thu-kpi-commitment-check`. Keep `AccountWeekPlanForm` + week list. Old rows can remain read-only.

## Task 5 — SOP one-liner

File: `content/library/operations/people/kpi-review-meeting-sop.md`

Align with spec: complete files the log; default cadence; bet opt-in at complete; no new meeting commitments.

## Done when

- Creating a plan does not ask finding/cadence/bet.
- Completing without opt-in creates a cadence work-log row (or finding if chosen).
- POST bet with `planned` / no change_date fails.
- Mon/Thu KPI UI does not create new `meeting_commitments`.
- No work-inbox routes or Team Command Due-today block in this PR.

## Out of scope (Slice 2)

`GET /api/work-inbox`, thin complete proxy, Team Command Due today, `work_inbox_owners`, Closebot/bet_review on a plate.
