---
title: Client Call Log — Modular Sections
status: approved
last_updated: 2026-08-26
artifact_type: design
related_docs:
  - docs/CALL-INTELLIGENCE.md
  - src/components/ClientCallFormFields.tsx
  - src/components/CheckinCallFormFields.tsx
  - src/lib/checkin-form.ts
  - src/lib/client-call-draft.ts
---

# Client Call Log — Modular Sections

## Purpose

Make logging a client call on Mr. Waiz fast and low-noise while still
capturing history useful for training, follow-through, and compliance.

Today’s check-in form always shows every field (wins, concerns, dual
action textareas, health, etc.). Neutral discoveries have nowhere clean
to live, and empty sections feel mandatory.

## Goals

- Only **client** and **call / recording link** are required to save
- Optional writing areas appear only when the logger turns them on
- Call type sets sensible section defaults; logger can add or remove
- Structured data stays searchable and readable in Client Calls /
  Client file timelines
- Backward compatible with existing `checkin_form` rows

## Non-goals (v1)

- ClickUp / task sync for action items
- AI auto-fill from transcript
- Changes to Call Library (setter dial examples)
- New database table for call logs
- Wizard / multi-step flow

## Approach

**Section chips (“Add to this log”).** Single modal. Core fields always
visible. A chip row toggles optional sections. Unselected sections are
not rendered and are not stored as empty strings.

## Form shape

### Always shown

1. Client (required)
2. Call / recording URL (required)
3. Call type (optional; drives defaults)
4. Call date (optional; default now)
5. Notes (optional catch-all for misc one-liners)

### “Add to this log” chips

| Chip | Contents |
|------|----------|
| Key points | Freeform discoveries / what was discussed (not forced as wins) |
| Action items | Addable list: each row = text + owner (`us` \| `client`) + remove; `+` adds a row |
| Call analysis | Approach · Discussed · Expectations |
| Health | Sentiment · Results satisfaction · Topics · Escalation · Next check-in · Follow-up owner |
| Wins | Optional positives |
| Concerns | Issues / risks / friction |
| Transcript | Paste box (unchanged) |
| Attendees | Single line (unchanged) |

### Call type → default chips

| Call type | Default chips on |
|-----------|------------------|
| Other (coaching) | Key points |
| Check-in | Health + Key points |
| Onboarding / Launch | Call analysis + Key points |
| Churn | Call analysis + Concerns + Key points |

Changing call type re-applies defaults only for a new draft.
Edit mode restores chips from which sections have stored content
(plus any explicit `call_sections` list if present).

## Data model

Persist on existing `client_calls` row. Extend the JSON currently in
`checkin_form` into a broader call-log payload (same column; no new
table). Conceptual shape:

```text
client_id          required
recording_url      required
call_type          optional
called_at          optional (default now)
notes              optional
transcript         optional
attendees          optional
call_sections      string[] — chips that were on (edit UX)
key_points         text | null
call_analysis      { approach, discussed, expectations } | null
wins               text | null
concerns           text | null
action_items       [{ text, owner: "us"|"client" }]  // omit if empty
health             {
                     sentiment?, results_satisfaction?, topics_discussed?,
                     escalation_needed?, next_checkin_date?, follow_up_owner?
                   } | null
```

### Storage rules

- Unselected or empty sections → `null` / omitted
- Blank action-item rows are dropped on save
- Do not write empty `what_went_well` / action text blobs

### Legacy read mapping

| Old field | New |
|-----------|-----|
| `what_went_well` | `wins` |
| `concerns_raised` | `concerns` |
| `our_action_items` (string) | one action item, owner `us` |
| `client_action_items` (string) | one action item, owner `client` |
| sentiment / results / topics / escalation / next / owner | `health` |

Writers emit the new shape; readers accept both until old rows age out.

## Components

| Piece | Role |
|-------|------|
| `ClientCallFormFields` | Core + chips + conditional sections |
| `CallLogSectionChips` | Toggle which sections show |
| `ActionItemList` | `+` rows with Us/Client owner |
| `CallAnalysisFields` | Approach / discussed / expectations |
| `CheckinCallFormFields` | Slim to Health only |
| `CheckinCallSummary` (or rename) | Render only sections with content |

Entry points stay: Client Calls browser modal and Client file Calls tab.
Existing `POST`/`PATCH` `/api/clients/[id]/calls` paths remain.

## Validation & errors

- Hard require: client + recording URL
- Health sentiment is **not** a hard block (even if Health chip is on)
- Soft warn on clearly invalid URL; allow save if value is non-empty
- Inline highlight missing required fields; do not close modal on failure

## Summary / timeline display

Show chips/badges and text only for sections that have content.
Prefer key points and concerns in one-line list previews over empty
health boilerplate.

## Testing

- Draft ↔ stored round-trip including legacy mapping
- Default chips by call type on new drafts
- Save omits empty sections and blank action rows
- Edit restores visible sections from stored payload
- Required-field validation (client + link only)

## Out of scope reminders

Setter Call Library, task systems, and transcript AI remain separate.
This redesign is **account `client_calls` logging only**.
