---
title: Client Loan Log Form — Design
status: draft
last_updated: 2026-08-14
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
- A `loan_outcomes` table or loan CRM
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
- A leaked link can be rotated without a deploy.

## Entry

| Item | Value |
|------|--------|
| URL | `/forms/loans/<token>` (one secret token per client) |
| Audience | Fulfillment clients (RM / DSCR); processor/VA if they have the URL |
| Auth | None. Anyone with a valid token submits for that client only. |
| How they get it | You copy the unique link from Client Roster / Client File and send it |
| Hub | Do not add a tokenless `/forms/loans` to the public forms list.
Copy/rotate lives on Client Roster / Client File only. |

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

Same lead + **same clicked stage** + same calendar day → reject with
“Already logged for this day.”
Do not write a second Submitted or Funded for that day.

If earlier stages are still missing, **still backfill** those gaps in the
same request (clicked stage is not duplicated).

A different calendar day is allowed.

## Storage

Reuse `events` (no new loan table).

| Event type | When |
|------------|------|
| `lead` | Can’t find create only |
| `claimed` | Backfill when no conversation exists |
| `proposal_made` | Backfill when no proposal exists |
| `submission_made` | Clicked Submitted, or backfill from Funded |
| `loan_funded` | Clicked Funded |

Payload on stage events (not on `lead` / `claimed` / `proposal_made`):

- `loan_size` (number) on `submission_made` and `loan_funded`
- `commission_amount` (number) on `loan_funded` only, and only if they filled
  “what you made”

Identity fields on every written event: `client_id`, `lead_name`,
`lead_phone`, `ghl_contact_id` when known, `occurred_at` from the form date.

Writes are **one transaction**: all backfill events persist or none do.

### Token

Store a unique `loan_log_token` on `clients`.
Generate when an admin first copies the link if the column is null;
a one-time migration may backfill tokens for the active roster.
**Rotate** replaces the token; the old URL returns the invalid-link page.

## Reporting

Existing metric engine in `docs/KPIS.md` and `src/lib/metrics.ts`.
No second counter.

| Surface | Behavior |
|---------|----------|
| Lead history / lead profile | Timeline includes backfilled + clicked events. Loan size on submitted/funded. Commission on funded when present. Submission / Funded flags already on lead profiles turn on. |
| Client KPIs | Submissions, Funded, Cost per Submission (`ad_spend ÷ submissions`), Cost per Funded (`ad_spend ÷ funded`). Conversations include system Claimed. |
| ROAS | **New card:** `ad_spend ÷ SUM(commission_amount)` for funded events in range that have commission. If none have commission, **omit the card** (do not show $0). |
| Loan size | Not a KPI in v1. Visible on the lead event only. |
| Your team | Same client KPI view and lead history. Commission is visible if they entered it. |

Ad spend remains Meta spend already stored for that client and date range.
KPI month follows the form date, not the submit timestamp.

## Errors (user-visible)

| Situation | Behavior |
|-----------|----------|
| Bad or rotated token | “This link isn’t valid. Ask your Waiz contact for a new one.” No search/submit. |
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
- Rotated token cannot search or submit.
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
