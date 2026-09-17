# Mr. Waiz internal activity Slack feed

**Status:** implemented (expanded catalog)  
**Date:** 2026-08-21 (expanded 2026-09-02)  
**Channel:** Slack `C0BRRU9C4SH` (team slug `mrwaiz`)

## Purpose

`#MrWaiz` is an **internal team activity feed**: what the team logged or completed in
Mr. Waiz. Prefer **human writes** (forms, roster edits, call uploads) over automated
webhook ingest.

Client-submitted public onboarding stays on `ops_alerts` only. Launch/churn still post
their existing ops/client Slack messages; the activity feed adds a who/what narrative
on `mrwaiz` as well.

Messages are **immediate** (one Slack post per action), with a full detail breakdown
and the **name of the person** who did the work.

## Architecture

After a successful DB write, call `notifyMrWaizActivity(...)` fire-and-forget. Slack
failures never fail the user-facing API.

- Resolve actor display name
- Format event-specific mrkdwn
- `postToTeamChannel(service, 'mrwaiz', text)`

Channel wiring: Admin → Automations → Team channels, slug `mrwaiz`, channel id
`C0BRRU9C4SH`. Invite the bot into the channel.

## Event catalog

| Event key | When |
|-----------|------|
| `team.meeting_logged` | Call Library / `team_calls` create |
| `team.meeting_completed` | Scheduled team meeting marked complete |
| `team.meeting_updated` | Call Library entry edited |
| `client.work_log_created` | New Finding / Cadence / Bet |
| `client.work_log_updated` | Work log status/fields updated |
| `team.eod_submitted` | EOD form submitted |
| `cs.touchpoint_done` | CS touchpoint marked done |
| `plan.task_done` | Account-plan task checked off |
| `plan.week_created` | Week plan created |
| `plan.week_status` | Week plan approved / rejected |
| `closebot.ticket_created` | New Closebot ticket |
| `closebot.ticket_status_changed` | Closebot ticket status transition |
| `closebot.agent_log_created` | Closebot agent prompt log |
| `client.created` | Client added on roster |
| `client.updated` | Client roster / file patch |
| `client.deleted` | Client removed |
| `client.call_logged` | Client call uploaded |
| `client.call_updated` | Client call edited |
| `client.kickoff_saved` | Kickoff progress/complete saved |
| `client.launched` | Launch checklist completed |
| `client.churned` | Churn / offboarding submitted |
| `client.note_created` | Client note added |
| `client.contact_changed` | Contact added / updated / removed |
| `client.offer_added` | Sub-account / offer added |
| `dial.example_saved` | Graded dial example saved |
| `acq.closer_form_submitted` | Closer form submitted |
| `acq.demo_booked_credit` | Demo booking credit claimed |
| `acq.intro_reflection` | Intro reflection submitted |
| `appt.dispositioned` | Manual appointment disposition |
| `credit.assigned` | Booking credit assigned / cleared |
| `commitment.logged` | Meeting commitment created |
| `commitment.updated` | Meeting commitment updated |
| `ops.logged` | Catch-all for ads, schedules, agents, goals, library, acquisition ops, CS overrides, loan forms, deletes, config, etc. |

**Out of scope:** finance/payroll/billing/expenses, pure GHL/Make webhook ingest, CPL digests, Slack channel config, public client onboarding form (ops channel).

## Message shape

1. Headline (what happened)
2. **Who:** actor display name
3. Event-specific detail lines
4. Footer: `_Posted by Mr. Waiz_`

### Actor resolution

1. Profile full name / email for authenticated `userId`
2. EOD: `submitted_by_label` or agent name
3. Closebot public create: `reporter_name`
4. Acquisition forms: closer / setter name on the form
5. Fallback: `Unknown user`

## Failure behavior

Log warnings; do not block saves. No retry queue in V1.

## Extension rule

New “team submitted / completed something” features add one event key, one template,
and one post-save hook.
