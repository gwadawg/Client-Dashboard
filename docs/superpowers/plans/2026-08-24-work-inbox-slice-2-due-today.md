# Work Inbox Slice 2: Due today (read-time union)

**Spec:** `docs/superpowers/specs/2026-08-24-work-inbox-and-account-work-cleanup-design.md`  
**Date:** 2026-08-24

## Goal

`GET /api/work-inbox` unions open work onto one **Due today** plate at the top of CS, Media, and CCM Team Command. Complete uses existing PATCH routes. No `tasks` table.

## v1 kinds

- `plan_task` — approved plan, open task, `scheduled_for` ≤ day, assignee = plate person. Inline complete for cadence/finding; bet is deep_link.
- `plan_approve` — pending plans for Founder/CEO/owner only. Deep_link Account Work.
- `cs_followup` — unassigned open/snoozed due ≤ end of day. **CS lead only** (owner/admin/ceo or `agents.pay_type = client_success`). Not on every CS plate.

Personal assigned follow-ups wait for `work_inbox_owners` (v1.1). Closebot / bet_review not in v1.

## Complete

- Plan cadence: `PATCH /api/account-plan-tasks/:id` `{ status: 'done', work_type: 'cadence' }`
- Follow-up: existing PATCH still requires Slack snippet
- Bet / approve: deep_link only
