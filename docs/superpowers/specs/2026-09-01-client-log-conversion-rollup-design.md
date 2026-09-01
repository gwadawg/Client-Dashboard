---
title: Client Log Conversion Rollup — Design
status: implemented
last_updated: 2026-09-01
artifact_type: design
related_docs:
  - docs/superpowers/specs/2026-08-14-client-loan-log-form-design.md
  - src/lib/loan-log-form.ts
  - src/lib/loan-deals.ts
  - src/components/loan-log/LoanLogForm.tsx
---

# Client Log Conversion Rollup — Design

## Purpose

Reduce duplicate data entry on the client intake form (`/forms/loans/<token>`)
when logging conversion stages for the same loan file. Loan size and
transaction label should roll up across stages instead of being re-entered
on every click.

## Problem

Today the form asks for **loan size on every stage** (Proposal, Submitted,
Funded) and **transaction** on Submitted and Funded. When a client logs
Submitted and later Funded for the same file, they re-type values the system
already has.

Backend behavior is mostly correct:

- **Person grain** (`events`): at most one row per conversion stage per contact.
- **Transaction grain** (`loan_deals`): one row per loan file; Funded **promotes**
  a matching open Submitted row by `loan_size` + `transaction_label`.

The friction is UX — the form does not surface prior values or open files.

## Success criteria

- Submitted pre-fills loan size from an earlier Proposal on the same lead.
- Funded shows a picker of open submitted files (size + label + date); auto-selects when only one.
- Funded with no open submissions falls back to manual loan size + transaction (current behavior).
- Picked file sends read-only size/label so promote matching stays reliable.
- No change to KPI formulas, duplicate rules, or promote logic on POST.

## Non-goals

- Restructuring the form into a "pick file first, then stage" wizard.
- GHL sync.
- Changing how proposal-only rows store `raw.loan_size`.
- DQ log type (already shipped separately).

## Decisions (from brainstorming)

| Question | Choice |
|----------|--------|
| Multiple open submissions on Funded | **Picker** — user selects which file funded |
| Funded with no open submission | **Manual fallback** — same fields as today |
| Submitted after Proposal | **Pre-fill loan size** from proposal (editable) |

## Architecture

```
Lead picked
  → GET lead-context (token → client_id → contact)
      → proposal_loan_size from events
      → open_deals from loan_deals (stage = submitted)
  → Form applies stage-specific UI
  → POST submit (unchanged promote/insert logic)
```

### New endpoint

`GET /api/forms/loans/[token]/lead-context`

Query params (at least one required):

- `ghl_contact_id` — preferred when lead picked from search
- `phone` — normalized fallback (can't-find path)

Response:

```typescript
{
  proposal_loan_size: number | null,
  open_deals: Array<{
    id: string,
    loan_size: number,
    transaction_label: string | null,
    submitted_at: string,
  }>
}
```

Implementation notes:

- Token → `client_id` via `resolveLoanLogToken` (same as lead search).
- `proposal_loan_size`: most recent `proposal_made` / `proposal_sent` for contact,
  parse `raw.loan_size` via existing `parseLoanSizeFromRaw`.
- `open_deals`: `loadContactLoanDeals` filtered to `stage === 'submitted'`,
  ordered by `submitted_at desc`.
- Public route — no `client_id` from browser; contact scoping only.

## Form UX

### Shared

After lead pick (or can't-find with phone), fetch lead context. Show brief
loading hint under lead block. On lead change, re-fetch and reset stage-specific state.

### Proposal

| Field | Behavior |
|-------|----------|
| Loan size | Required, blank |
| Transaction | Hidden |

### Submitted

| Field | Behavior |
|-------|----------|
| Loan size | Required; pre-fill from `proposal_loan_size` if present (editable). Helper: *From your earlier proposal — change if this file is different.* |
| Transaction | Optional, unchanged |

### Funded

**File picker mode** when `open_deals.length >= 1`:

- Prompt: *Which loan funded?*
- Each option: `$350,000 · cash-out · submitted Aug 12`
- One open deal → auto-selected
- Two or more → none selected until user picks
- Selected deal → loan size + transaction **read-only** on submit
- Link: **Fund a different loan** → manual mode (blank editable fields)

**Manual mode** when `open_deals.length === 0` or user chose bypass:

- Loan size required, transaction optional (current behavior)
- Commission optional, unchanged

### Field order (conversion)

1. Log type → Conversion
2. Lead
3. Stage (Proposal / Submitted / Funded)
4. Funded: file picker or manual fields
5. Loan size (+ transaction where shown)
6. When
7. Commission (Funded only)

Stage before file picker so the form knows whether to show the picker.

### Switching

- New lead → re-fetch context, clear picker selection and manual overrides
- Stage change → re-apply pre-fill rules; do not clear lead

## Edge cases

| Situation | Behavior |
|-----------|----------|
| Funded, multiple open deals, none selected | Block submit: *Pick which loan funded.* |
| Context fetch fails | Manual fields only; do not block form |
| Picked deal funded elsewhere before submit | POST error; *That loan was already logged. Pick another or enter manually.* |
| Manual Funded while open deals exist | Allowed via bypass link; promote if size/label match an open file |
| Submitted with edited pre-fill size | New deal at entered size; proposal event unchanged |

## POST / submit

**No changes** to `planLoanLogEvents`, `findPromotableDeal`, `findDuplicateDeal`,
or unique indexes. Picker mode ensures submitted values match an open deal row.

Optional future enhancement (out of scope): pass `deal_id` on POST for explicit
promote target — not required for v1 if read-only picker values are enforced.

## Testing

### Unit

- Lead context builder: proposal size from events, open deals filter/order
- Form helpers: picker selection → submit payload

### Manual QA

1. Proposal → Submitted: size pre-fills
2. Submitted → Funded (one open deal): auto-selected, promotes on submit
3. Two open deals: must pick before submit
4. Funded, no submission history: manual entry works
5. "Fund a different loan" shows manual fields
6. Context fetch failure: form still submittable

## Files (implementation preview)

| File | Change |
|------|--------|
| `src/app/api/forms/loans/[token]/lead-context/route.ts` | New GET handler |
| `src/lib/loan-log-lead-context.ts` | Build context from events + deals |
| `src/lib/loan-log-lead-context.test.ts` | Unit tests |
| `src/components/loan-log/LoanLogForm.tsx` | Picker, pre-fill, manual bypass |
| `src/middleware.ts` | Whitelist lead-context route if needed |
