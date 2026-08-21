# Mr. Waiz internal activity Slack feed

**Status:** approved for implementation  
**Date:** 2026-08-21  
**Channel:** Slack `C0BRRU9C4SH` (team slug `mrwaiz`)

## Purpose

`#MrWaiz` is an **internal team activity feed**: what the team logged or completed. It is not for client-submitted lifecycle forms (onboarding stays on `ops_alerts` only).

Messages are **immediate** (one Slack post per action), with a full detail breakdown and the **name of the person** who did the work.

## Architecture

After a successful DB write, call `notifyMrWaizActivity(...)` fire-and-forget. Slack failures never fail the user-facing API.

- Resolve actor display name
- Format event-specific mrkdwn
- `postToTeamChannel(service, 'mr_waiz', text)`

Channel wiring: Admin → Automations → Team channels, slug `mr_waiz`, channel id `C0BRRU9C4SH`. Invite the bot into the channel.

## Event catalog (V1)

| Event key | When |
|-----------|------|
| `team.meeting_logged` | Call Library / `team_calls` create |
| `team.meeting_completed` | Scheduled team meeting marked complete |
| `client.work_log_created` | New Finding / Cadence / Bet (create only, any type) |
| `team.eod_submitted` | EOD form submitted / upserted |
| `cs.touchpoint_done` | CS touchpoint marked done |
| `plan.task_done` | Account-plan task checked off |
| `closebot.ticket_created` | New Closebot ticket |
| `closebot.ticket_status_changed` | Any Closebot ticket status transition |
| `closebot.agent_log_created` | New Closebot agent prompt log |

**Out of scope:** onboarding, CPL alerts, client public forms, retry outbox.

## Message shape

1. Headline (what happened)  
2. **Who:** actor display name  
3. Event-specific detail lines  
4. Footer: `_Posted by Mr. Waiz_`

### Actor resolution

1. Profile full name / email for authenticated `userId`  
2. EOD: `submitted_by_label` or agent name  
3. Closebot public create: `reporter_name`  
4. Fallback: `Unknown user`

## Failure behavior

Log warnings; do not block saves. No retry queue in V1.

## Extension rule

New “team submitted / completed something” features add one event key, one template, and one post-save hook.
