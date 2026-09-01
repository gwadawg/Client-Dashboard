# Client Log Conversion Rollup — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop clients from re-entering loan size and transaction label when logging later conversion stages. Submitted pre-fills from Proposal; Funded picks from open submitted files.

**Architecture:** New read-only `GET …/lead-context` returns `proposal_loan_size` + open `loan_deals`. Form fetches on lead pick and drives pre-fill / file picker. POST submit and promote logic unchanged.

**Tech Stack:** Next.js App Router, existing `loan-deals` + `loan-log-form` modules, node:test via `tsx`.

**Spec:** [`docs/superpowers/specs/2026-09-01-client-log-conversion-rollup-design.md`](../specs/2026-09-01-client-log-conversion-rollup-design.md)

## Global constraints

- Do **not** change `planLoanLogEvents`, `findPromotableDeal`, `findDuplicateDeal`, or POST body contract beyond what the form already sends.
- Do **not** add `deal_id` to POST in v1 — picker sends read-only `loan_size` + `transaction_label` from the selected deal.
- Token scoping only — never accept `client_id` from the browser.
- `/api/forms/loans` is already public in middleware; no middleware change expected.
- Tests: `npx --yes tsx --test <files>`. UI verified by manual QA checklist.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/loan-log-lead-context.ts` | Build `{ proposal_loan_size, open_deals }` from events + deals |
| `src/lib/loan-log-lead-context.test.ts` | Unit tests for context builder |
| `src/app/api/forms/loans/[token]/lead-context/route.ts` | GET handler |
| `src/components/loan-log/LoanLogForm.tsx` | Fetch context, picker, pre-fill, manual bypass |
| `package.json` | Register new test file |

---

### Task 1: Lead context builder

**Files:**

- Create: `src/lib/loan-log-lead-context.ts`
- Create: `src/lib/loan-log-lead-context.test.ts`
- Modify: `package.json` (add test file to `test` script)

**Interfaces:**

- Consumes: `LoanDealRecord[]`, event rows with `event_type`, `occurred_at`, `raw`
- Produces:
  - `LeadContextDeal = { id, loan_size, transaction_label, submitted_at }`
  - `LeadContext = { proposal_loan_size: number | null, open_deals: LeadContextDeal[] }`
  - `buildLeadContext(events, deals): LeadContext`
  - `formatDealPickerLabel(deal): string` (for UI: `$350,000 · cash-out · submitted Aug 12`)

**Logic:**

- `proposal_loan_size`: most recent `proposal_made` / `proposal_sent` by `occurred_at`; parse via `parseLoanSizeFromRaw`.
- `open_deals`: filter `deals` where `stage === 'submitted'` and `loan_size != null`; sort `submitted_at desc`.

- [ ] **Step 1: Write failing tests**

Cover: no events/deals → null + []; proposal size from raw; two open deals ordered desc; funded deals excluded.

- [ ] **Step 2: Run tests — expect FAIL**

```bash
npx --yes tsx --test src/lib/loan-log-lead-context.test.ts
```

- [ ] **Step 3: Implement `loan-log-lead-context.ts`**

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/lib/loan-log-lead-context.ts src/lib/loan-log-lead-context.test.ts package.json
git commit -m "$(cat <<'EOF'
Add lead context builder for client log conversion rollup.

EOF
)"
```

---

### Task 2: Lead context API route

**Files:**

- Create: `src/app/api/forms/loans/[token]/lead-context/route.ts`

**Interfaces:**

- Consumes: `resolveLoanLogToken`, `buildContactKey`, `normalizePhone`, `loadContactLoanDeals`, `buildLeadContext`
- Produces: `GET /api/forms/loans/[token]/lead-context?ghl_contact_id=&phone=`

**Query validation:**

- Require `ghl_contact_id` and/or `phone` (normalized).
- Resolve contact key same as POST route (`buildContactKey` when no GHL id).
- Load events: `proposal_made`, `proposal_sent` + any needed for contact match (reuse contact-scoped query pattern from `route.ts` `loadContactEvents`).
- Load deals via `loadContactLoanDeals`.
- Return `buildLeadContext(...)`.
- 404 invalid token; 400 missing contact params.

- [ ] **Step 1: Implement route**

- [ ] **Step 2: Smoke test locally** (optional curl with valid token)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/forms/loans/[token]/lead-context/route.ts
git commit -m "$(cat <<'EOF'
Add lead-context endpoint for client log form pre-fill and file picker.

EOF
)"
```

---

### Task 3: Form — fetch context on lead pick

**Files:**

- Modify: `src/components/loan-log/LoanLogForm.tsx`

**State to add:**

```typescript
type LeadContext = {
  proposal_loan_size: number | null;
  open_deals: Array<{
    id: string;
    loan_size: number;
    transaction_label: string | null;
    submitted_at: string;
  }>;
};

// state
leadContext: LeadContext | null
contextLoading: boolean
contextError: boolean
selectedDealId: string | null
fundedManualMode: boolean  // true when bypassing picker
```

**Effects:**

- When `logType === 'conversion'` and lead is usable (picked or cant-find with name+phone), fetch lead-context.
- On lead change: reset `selectedDealId`, `fundedManualMode`, `loanSize`, `transactionLabel`; then apply stage rules.

**Stage rules after context loads:**

| Stage | Behavior |
|-------|----------|
| Proposal | Clear loan size (user enters fresh) |
| Submitted | Set `loanSize` from `proposal_loan_size` if present and field empty |
| Funded | If `open_deals.length === 1`, set `selectedDealId`; if `> 1`, null; if `0`, `fundedManualMode = true` |

- [ ] **Step 1: Add fetch + loading hint under lead block**

- [ ] **Step 2: Wire Submitted pre-fill + helper copy**

- [ ] **Step 3: Commit (partial UI — no picker yet)**

```bash
git add src/components/loan-log/LoanLogForm.tsx
git commit -m "$(cat <<'EOF'
Fetch lead context on client log form for conversion pre-fill.

EOF
)"
```

---

### Task 4: Form — Funded file picker + manual bypass

**Files:**

- Modify: `src/components/loan-log/LoanLogForm.tsx`

**UI (Funded + conversion):**

When `open_deals.length >= 1` and `!fundedManualMode`:

- Fieldset: *Which loan funded?*
- Chip/card per deal using `formatDealPickerLabel`
- Selected chip uses same `chipStyle(active)` as stage picker
- Read-only summary below selection: loan size + transaction
- Link button: *Fund a different loan* → `fundedManualMode = true`, clear `selectedDealId`, clear fields

When manual mode or no open deals:

- Show editable loan size + transaction (current fields)

**Submit validation (Funded):**

- Picker mode: require `selectedDealId`; block with *Pick which loan funded.*
- Manual mode: require loan size (current)

**Submit payload (Funded, picker mode):**

- Set `loan_size` and `transaction_label` from selected deal (not from editable inputs)

- [ ] **Step 1: Implement picker UI**

- [ ] **Step 2: Implement validation + payload from selected deal**

- [ ] **Step 3: Hide redundant editable loan size/transaction when picker active and deal selected**

- [ ] **Step 4: Commit**

```bash
git add src/components/loan-log/LoanLogForm.tsx
git commit -m "$(cat <<'EOF'
Add Funded file picker and manual bypass to client log form.

EOF
)"
```

---

### Task 5: Edge cases + QA

**Files:**

- Modify: `src/components/loan-log/LoanLogForm.tsx` (if needed for context fetch failure)

- [ ] **Step 1: On context fetch error, set `contextError` and use manual fields only**

- [ ] **Step 2: Re-apply pre-fill when switching Proposal → Submitted (don't wipe user edits mid-session unnecessarily — only on lead change)**

- [ ] **Step 3: Run unit tests**

```bash
npx --yes tsx --test src/lib/loan-log-lead-context.test.ts src/lib/loan-log-form.test.ts src/lib/dq-log-form.test.ts
```

- [ ] **Step 4: Manual QA checklist**

1. Proposal → Submitted: size pre-fills from proposal
2. Submitted → Funded (one open deal): auto-selected, submit promotes deal
3. Two open deals: must pick one before submit
4. Funded with no submission: manual entry works
5. "Fund a different loan" shows manual fields
6. Context fetch failure (simulate offline): form still submittable manually
7. Conversion regression: Proposal / Submitted / Funded without prior context still work

- [ ] **Step 5: Update spec status to `implemented` after ship**

- [ ] **Step 6: Commit any fixes**

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| GET lead-context endpoint | 2 |
| proposal_loan_size from events | 1, 2 |
| open_deals from submitted loan_deals | 1, 2 |
| Submitted pre-fill from proposal | 3 |
| Funded file picker, auto-select one | 4 |
| Manual fallback, no open deals | 4 |
| "Fund a different loan" bypass | 4 |
| POST/promote unchanged | Global constraint |
| Context fetch failure graceful | 5 |
| Multiple deals require selection | 4 |
