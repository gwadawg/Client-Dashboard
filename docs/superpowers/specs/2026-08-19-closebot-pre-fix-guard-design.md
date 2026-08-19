---
title: Closebot pre-fix ticket guard
status: approved
last_updated: 2026-08-19
artifact_type: design
related_docs:
  - docs/superpowers/specs/2026-08-07-closebot-prompt-log-design.md
  - src/lib/closebot.ts
  - src/lib/closebot-store.ts
  - src/components/ClosebotTicketForm.tsx
  - src/components/ClosebotTicketsSection.tsx
  - src/components/ClosebotPromptLog.tsx
---

# Closebot pre-fix ticket guard

Date: 2026-08-19
Status: Implemented
Surfaces:

- Public report form `/forms/closebot-tickets`
- Team → Closebot → Tickets
- Team → Closebot → Updates (prompt log)

## Problem

Setters file incidents by date and error type. Ops ships an agent
update that fixes **one** of those types. Later reports of that same
type, from **before** the update, land in the open queue and look like
the bug is still live.

A date-only cutoff is the wrong safeguard. If every ticket with
`occurred_at` before the last agent update is rejected, real bugs that
were never fixed also disappear.

## Operating rule

Two axes, not one:

1. **When it happened** — already stored as `occurred_at` and pinned to
   the version live at that time (`pickVersionAt`).
2. **Whether this problem was later claimed as fixed** — structured
   link from a prompt log to one or more bug types.

Worked examples:

- Fix for `booking_fail` shipped Aug 12. Report of `booking_fail` from
  Aug 8 → **pre-fix**. Evidence of the old bug, not a new work item.
- Same update. Report of `wrong_reply` from Aug 8 → **actionable**.
  That problem was not in the update.
- Report of `booking_fail` from Aug 15 → **actionable**. Possible
  regression; this pass does not auto-label regressions.

Fail-open: a prompt update that tags no bug types must not suppress
any tickets.

## Goals

1. Always persist the ticket. Never drop evidence.
2. Label same-type reports that occurred before a later covering
   update as `pre_fix`.
3. Keep unrelated older reports in the open queue.
4. Exclude `pre_fix` from the default open queue. Show them in an
   Already shipped drawer.
5. Let ops tag which error types a prompt update addresses.
6. When a covering update ships, reclassify matching open tickets.

## Non-goals (v1)

- Auto-labeling regressions (occurred after a claimed fix)
- Hard-blocking the public form (no 400 for pre-fix)
- Inferring coverage from free-text `problem_solved`
- Changing ticket status automatically (`resolved_no_change` still
  means a human closed it)

## Decisions locked

| Topic | Decision |
|-------|----------|
| Always save | Yes. Coverage is a classifier, not a reject. |
| Status vs coverage | Orthogonal. Status stays the human workflow. |
| Covering source | Prompt log + `closebot_log_bug_types`, not version timestamps alone |
| Covering statuses | `watching` and `worked` only (`did_not_work` / `reverted` / `open` do not cover) |
| Pick | Earliest covering log (`changed_at` ascending) |
| Untyped ticket | Always `actionable` |
| Untyped log | Claims nothing; fail-open |
| Same calendar day | Treat as pre-fix. Date-only fields are UTC midnight. Ops can override. |
| Default open queue | Open statuses **and** `coverage = actionable` |
| Override | Writers may set coverage; `coverage_manual` prevents auto-reclassify |
| Link on resolve | Closing `resolved_updated_agent` with a log + bug type upserts that type onto the log |

## Classification

```text
ticket submitted
  → resolve agent from client
  → pin version at occurred_at
  → no bug_type? → actionable
  → later watching/worked log claims this bug_type
       and (changed_at > occurred_at OR same UTC date)?
         yes → pre_fix + covered_by_log_id
         no  → actionable
```

Same-day stamps are conservative, not gospel. A report dated the same
UTC day as the covering log is labeled pre-fix even if the incident
might have happened after the ship. Ops flips coverage back to
actionable when that happens.

## Data model

### `closebot_log_bug_types`

| Column | Type | Notes |
|--------|------|--------|
| `log_id` | uuid | PK part; FK → `closebot_prompt_log(id)` ON DELETE CASCADE |
| `bug_type` | text | PK part; FK → `closebot_bug_types(slug)` ON DELETE CASCADE |
| `created_at` | timestamptz | |

Empty set on a log = this update does not auto-cover any tickets.

### `closebot_tickets` additions

| Column | Type | Notes |
|--------|------|--------|
| `coverage` | text | `actionable` (default) or `pre_fix` |
| `covered_by_log_id` | uuid null | FK → `closebot_prompt_log(id)` ON DELETE SET NULL |
| `coverage_manual` | boolean | default false; true after a writer overrides coverage |

## Surfaces

**Public form.** Preview coverage after client + date + type are
chosen. Submit still succeeds. Pre-fix gets a historical success
state, not an error.

**Tickets ledger.** Live type stacks are actionable only. Pre-fix
rows sit in a faded Already shipped drawer with the covering log
date and `problem_solved`. Writers can treat as live bug / mark
already shipped.

**Prompt log form.** Optional multi-select: “Error types this change
addresses.” Saving claimed types reclassifies open, non-manual
tickets for that agent.

## Auth

Unchanged. Public create stays unauthenticated (honeypot + rate
limit). Coverage preview is client-scoped through the same agent
resolution as submit. Ops mutations stay on closebot log write.
