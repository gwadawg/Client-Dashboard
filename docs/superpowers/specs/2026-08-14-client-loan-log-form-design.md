---
title: Client Loan Log Form — Design
status: implemented
last_updated: 2026-08-18
artifact_type: design
related_docs:
  - docs/KPIS.md
  - docs/CLIENT_ONBOARDING.md
  - docs/ACQUISITION_FORMS_GHL.md
  - src/components/LeadProfilesTable.tsx
  - src/components/client-workspace/ClientKpiPanel.tsx
---

# Client Loan Log Form — Design

## Purpose

Give each fulfillment client a **unique public URL** to log **Submitted**
and **Funded** loans against leads already in Mr. Waiz reporting.

The form is low-friction and Waiz-branded.
It writes the **same event types** the dashboard already uses so Client KPIs
(Cost per Submission, Cost per Funded, and optional ROAS) and lead history
fill in without a second pipeline or a GHL form.

## Non-goals (v1)

- GHL create/tag/stage sync (Waiz is source of truth)
- Login, PIN, or per-user auth on the form (token URL is enough)
- Slack or email on every submit
- Asking loan type, notes, credit, or team member
- Client-branded colors (Waiz colors + **their office name** in the headline)
- Showing Claimed / Proposal / backfill language on the form
- Using loan size as ROAS
- Separate internal vs client commission visibility
- HE / Call Center–only variants (one form; client comes from the token)

## Success criteria

- An LO (or VA with the link) can log a same-day submission in under a minute:
  stage → search → pick lead → loan size → submit.
- Submissions, Funded, Cost per Submission, and Cost per Funded move on that
  client's KPI range using the form date and existing ad spend.
- ROAS appears on Client KPIs only when at least one funded loan in range has
  “what you made.”
- Lead history shows the funnel chain, including system backfill.
- The client’s loan-log URL is stable: copy as often as needed; it does not change.

## Entry

| Item | Value |
|------|--------|
| URL | `/forms/loans/<token>` (one secret token per client) |
| Audience | Fulfillment clients (RM / DSCR); processor/VA if they have the URL |
| Auth | None. Anyone with a valid token submits for that client only. |
| How they get it | You copy the unique link from Client Roster / Client File and send it |
| Hub | Do not add a tokenless `/forms/loans` to the public forms list.
Copy lives on Client File only. |

Headline copy: `{Client name} — Log a loan` (use `clients.name`).
Visual: existing Waiz form chrome and company colors.

## Form (client-facing)

One screen. Client is implied by the token. Reverse and DSCR use the same
fields.

| Order | Field | Required | Visibility |
|-------|--------|----------|------------|
| 1 | What happened? Submitted / Funded | Yes | Always |
| 2 | Lead search (name → dropdown of **this client’s** leads: name + phone) | Yes, unless Can’t find | Always |
| 2b | Can’t find this lead: name + phone | Yes if create path | Always available |
| 3 | When (date) | Yes | Default **today**; calendar to change |
| 4 | Loan size (dollars) | Yes | Both stages |
| 5 | What you made (dollars) | No | **Funded only.** Hidden if Submitted. Helper: skip if they do not want ROAS. |
| 6 | Submit | — | Always |

After success: short confirmation (lead name + stage) and **Log another**
(same token, form resets, stage cleared).

The form never mentions Claimed, Proposal, backfill, or conversations.

## Matching and create

- Search is scoped to `client_id` from the token.
- Typeahead on lead name; show name + phone to disambiguate.
- Pick existing lead → attach events to that contact key
  (`ghl_contact_id` and/or phone, same as reporting).
- **Can’t find:** require name + phone; create the person on that client;
  then run the same backfill rules as an existing lead with empty history.

## Funnel backfill (server only)

Canonical order:

**New lead → Conversation → Proposal → Submitted → Funded**

The form only collects Submitted or Funded.
On submit, inspect that lead’s existing events.
Write **missing** earlier stages.
Backfill does not add `lead`, `claimed`, `proposal_made`, or
`submission_made` if that type already exists on the lead (any date).
The **clicked** stage may be logged again on a **different** calendar day;
the duplicate rule blocks only the same day.

Conversation filler is **Claimed** only when the lead has no conversation
yet: no `show`, no `live_transfer`, no `claimed`.
Do not invent show or live-transfer rows.

| They click | Write if missing |
|------------|------------------|
| Submitted | `lead` (create path only), `claimed` (if no conversation), `proposal_made`, `submission_made` |
| Funded | Same as Submitted, plus `loan_funded`. Always ensure submission exists (write `submission_made` if missing). |

All backfilled events use the **form date** (`occurred_at` for that calendar
day). We do not guess historical conversation dates.

**New lead (`lead` event):** only when creating via Can’t find.
Picking an existing lead never writes a second lead event.

## Duplicate rule

**Person grain:** at most one `proposal_made` / `submission_made` /
`loan_funded` per contact (existing unique index). A second transaction does
**not** write another conversion event.

**Transaction grain:** same contact + same loan size + same transaction
label + same calendar day → reject with “Already logged for this day.”
Add a name (or a different size) to log another file. Two loans on the
same house are two transactions.

If earlier person-level stages are still missing, **still backfill** those
gaps in the same request.

## Storage

Person conversion stays on `events`. Each loan transaction is a row in
`loan_deals`.

| Event type | When |
|------------|------|
| `lead` | Can’t find create only |
| `claimed` | Backfill when no conversation exists |
| `proposal_made` | Backfill when no proposal exists |
| `submission_made` | First Submitted (or backfill from first Funded) |
| `loan_funded` | First Funded for that borrower |

`loan_deals` columns: `stage` (`submitted`/`funded`), `submitted_at`,
`funded_at`, `loan_size`, `commission_amount`, `transaction_label`,
`ghl_contact_id`. A later Funded for the same size/label **promotes** the
open submitted row instead of inserting a second file.

### Token

Store a unique `loan_log_token` on `clients`.
Generate when an admin first copies the link if the column is null.
The token never changes after that.

## Reporting

Existing metric engine in `docs/KPIS.md` and `src/lib/metrics.ts`.
No second counter.

| Surface | Behavior |
|---------|----------|
| Lead history / lead profile | Timeline includes backfilled + first conversion events. |
| Client KPIs | Unique borrowers (funnel) + **Funded Transactions**, **Loan Volume**, cost per transaction vs cost per borrower. |
| ROAS | `SUM(loan_deals.commission_amount)` for funded files in range ÷ ad spend. Hidden until someone logs earnings. |
| Loan size | Summed as Loan Volume on funded deals. |

Ad spend remains Meta spend already stored for that client and date range.
KPI month follows the form date, not the submit timestamp.

## Errors (user-visible)

| Situation | Behavior |
|-----------|----------|
| Bad token | “This link isn’t valid. Ask your Waiz contact for a new one.” No search/submit. |
| Search, no matches | Empty list + Can’t find this lead. |
| Can’t find without phone | Block submit. |
| Missing loan size | Block submit (both stages). |
| What you made blank on Funded | Allowed. |
| Duplicate clicked stage + day | “Already logged for this day.” Backfill gaps still allowed. |
| Server failure | “Couldn’t save. Try again.” No partial event set. |

No notify-on-submit in v1.

## Architecture

```
Client unique URL
  → GET search (token → client_id → that client’s leads)
  → POST submit (token → client_id)
      → find or create contact
      → backfill missing funnel events
      → write clicked stage + money payload
  → Dashboard / lead history / Client KPIs (existing reads)
```

Public routes are token-scoped.
They must not accept a `client_id` from the browser.

GHL is unchanged in v1.

## Tests

- Token scopes search and submit to one client; other clients’ leads never
  appear.
- Empty history + Can’t find + Funded writes `lead`, `claimed`,
  `proposal_made`, `submission_made`, `loan_funded` (same date).
- Empty history + existing lead + Submitted writes `claimed` (if no
  conversation), `proposal_made`, `submission_made`; no extra `lead`.
- Lead with `show` (or claimed / live transfer) does not get another
  `claimed`.
- Lead with `proposal_made` does not get another proposal.
- Funded without prior submission writes `submission_made`.
- `commission_amount` stored only on `loan_funded` when provided; never on
  Submitted.
- ROAS hidden when no commission in range; computed when at least one exists.
- Same lead + Funded + same day twice: second call rejected; no duplicate
  funded row.
- Can’t find without phone rejected.
- Failed write leaves zero new events (transaction).

## Open follow-ups (explicitly out of v1)

- Sync Submitted / Funded / Claimed to the client’s GHL sub-account.
- Private commission (client-only) vs internal rollup.
- Loan size as a reported KPI or modeled ROAS from size × bps.
- Notify CS/Slack on submit.
- Login-gated form.
