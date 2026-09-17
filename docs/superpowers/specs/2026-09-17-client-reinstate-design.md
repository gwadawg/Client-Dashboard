---
title: Client Reinstate / Welcome-Back — Design
status: draft
last_updated: 2026-09-17
compatibility_reviewed: 2026-09-17
artifact_type: design
related_docs:
  - docs/CLIENT_ONBOARDING.md
  - docs/CLIENT_OFFBOARDING.md
  - docs/CLIENT_OFFER_TYPES.md
  - docs/ACQUISITION_KPIS.md
  - src/lib/internal-forms.ts
  - src/lib/form-submissions.ts
  - src/lib/onboard-client.ts
  - src/lib/client-account-groups.ts
---

# Client Reinstate / Welcome-Back — Design

## Purpose

Support paid rejoins of previously churned clients without treating them as
brand-new logos or using Billing’s thin “Reactivate” shortcut.

Closers start the deal in Mr. Waiz. The system updates (or siblings) the client
file, counts a sales close, and sends the client a unique **welcome-back**
onboarding link with their prior info prefilled. CS finishes a short in-app
checklist. ClickUp and Slack stay manual outside this flow.

## Non-goals

- Automating ClickUp hub tasks or Slack channels (create, reopen, or unarchive)
- Reusing the GHL New Client → Make → `/api/admin/onboard` pipeline
- Erasing churn history from `client_status_history` or churn form submissions
- Replacing Billing “Reactivate” for emergency status flips (it remains; this
  form is the path for paid rejoins)
- Building a GHL-hosted reinstate form in v1

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Identity | Default: **same `clients` row**. Optional: **new offer** sibling under the same `account_group_id` |
| Who starts | Closer / sales after payment or new agreement |
| Client OB | Dedicated welcome-back form, **unique token link**, prefilled confirm/update |
| Ops integrations | Mr. Waiz only; ClickUp/Slack out of band |
| Sales credit | Yes — write an `acquisition_closes` row tagged as reinstate/winback |
| Churn history | Keep forever; clear only current `churned_at` when leaving `churned` |

## Flow

```text
Closer → /forms/reinstate
       → pick churned client
       → deal terms + Same file | New offer
       → POST reinstate API
            → lifecycle off churned (history kept)
            → form_type: reinstate
            → acquisition_closes (winback)
            → issue welcome-back token
Client → /onboard/welcome-back/[token]
       → prefilled confirm/update
       → form_type: reinstate_onboarding
CS     → short checklist on Client File / reinstate progress
```

## Closer form — `/forms/reinstate`

### Entry

| Item | Value |
|------|--------|
| URL | `/forms/reinstate` (optional `?clientId=` preselect) |
| Registry | `src/lib/internal-forms.ts` — Team Forms + Resources |
| Auth | Logged-in staff (same as churn) |
| Client picker | Churned clients only (`lifecycle_status = churned`) |

### Fields

| Field | Required | Notes |
|-------|----------|--------|
| Client | Yes | Search by name / email among churned |
| Engagement | Yes | `same_file` (default) or `new_offer` |
| Offer / package | Yes | New deal terms |
| MRR (or performance terms) | Yes* | Match existing billing field rules |
| Date signed | Yes | Reinstate close date |
| Closer | Yes | For acquisition close credit |
| Cash collected (if used elsewhere) | Per existing close patterns | Follow `acquisition_closes` conventions |
| Reuse existing GHL sub-account? | No | `yes` / `no` / `unsure` — stored for CS only |
| Internal notes | No | Handoff context |

Read-only summary when a client is selected: prior offer, `churned_at`, latest
churn reason (from churn form / status history).

### Submit behavior — same file

1. Reject if client is not `churned` (409).
2. Update deal fields on the existing row (offer, MRR, contract fields as
   collected). Keep original `date_signed` for tenure; set `reinstated_at` (or
   equivalent on the reinstate submission). Clear `billing_paused` /
   `ads_paused` (and related note timestamps) unless the closer explicitly
   leaves them paused. Set new `contract_end_date` / term from the form when
   provided.
3. Set `lifecycle_status` to `onboarding` (reuse existing status; no new
   `reinstating` enum in v1). Clear current `churned_at` via existing lifecycle
   sync rules when leaving `churned` / `off_boarding`.
4. Insert `client_form_submissions` with `form_type: reinstate`. This starts a
   new progress cycle (Sign).
5. Insert a **new** `acquisition_closes` row with `close_kind` (or equivalent)
   `reinstate` — must not overwrite the original close (see Compatibility).
6. Issue or refresh a welcome-back share token; return copyable URL
   `/onboard/welcome-back/[token]`.
7. Do **not** call Make, ClickUp, or Slack APIs.

Idempotency: a second submit within a short window for the same client while
already `onboarding` with a recent `reinstate` submission must not create a
second close. Prefer 409 with the existing welcome-back link.

### Submit behavior — new offer

1. Ensure `account_group_id` on the churned client (create group and attach if
   missing — same pattern as upsell helpers).
2. Insert a **sibling** `clients` row under that group with the new deal terms,
   `engagement_kind` appropriate for same vs different product
   (`upsell` / `cross_sell` per existing account-group rules).
3. Leave the original row `churned` (historical).
4. Run steps 4–7 above against the **new** row only.

## Welcome-back OB — `/onboard/welcome-back/[token]`

### Entry

| Item | Value |
|------|--------|
| URL | `/onboard/welcome-back/[token]` — unique per reinstate target client |
| Audience | Reinstated clients only |
| Prefill | Contact, business, licensed states, and other OB fields already on the row |
| Relation to `/onboard` | Separate route and copy; reuse shared field components / apply helpers where safe |

### Behavior

1. Resolve token → target `clients` row. Invalid/expired → friendly error; no
   data leak.
2. Show welcome-back framing (“confirm or update your info”).
3. On submit: patch client fields; write
   `client_form_submissions` with `form_type: reinstate_onboarding`.
4. Second submit: show “already submitted”; do not blindly overwrite (v1).
5. No required Slack/ClickUp notify in v1. Optionally reuse the existing core OB
   ops alert helper only if it is a one-line call with no new infra.

### Token

Prefer a dedicated reinstate/welcome-back token stored on the client or in a
small token table, distinct from public report `share_token` if that token is
already used for client dashboards. Implementation may mint a signed token or
a random opaque token with expiry; exact storage is an implementation detail
as long as the URL is unique and unguessable.

## CS follow-up

On the Client File / forms history:

- Show **Reinstate** badge or equivalent when latest lifecycle entry came from
  reinstate.
- Surface closer answers: GHL reuse intent, notes, welcome-back OB status
  (pending / submitted).
- Light checklist (stored on the reinstate submission or a tiny responses
  object — not new `clients` columns unless unavoidable):

  - Confirm GHL path (reuse vs new sub-account)
  - Billing live / terms correct
  - Welcome-back OB received
  - Ready for kickoff / launch as needed

Kickoff and Launch wizards remain available afterward; reinstate does not
auto-jump to `active`.

## Sales credit

Reinstate must count toward closer/sales reporting via `acquisition_closes`.

Requirements:

- Create an `acquisition_closes` row linked to the target client (and lead if
  resolvable; otherwise client-only close is acceptable if the codebase already
  supports it).
- Mark the close as **reinstate / winback** so future CAC or “new logo”
  reports can exclude or segment these without deleting credit.
- Also store the closer reinstate answers on `client_form_submissions`
  (`form_type: reinstate`). Do **not** reuse `form_type: new_client` so
  onboarding progress and “new client” audits stay distinct.

Exact column for the winback marker: prefer an existing close metadata /
`revenue_type` / responses field if one fits; otherwise add a clear
`close_kind` (or equivalent) with value `reinstate`. Implementation plan picks
the minimal schema change.

## Data model summary

| Artifact | Role |
|----------|------|
| `clients` | Same row updated, or sibling created |
| `client_status_history` | Churn rows kept; reinstate appears as status transition |
| `client_form_submissions` | `reinstate` + `reinstate_onboarding` (extend `FORM_TYPES`) |
| `acquisition_closes` | Closer credit, marked winback |
| Welcome-back token | Unlocks public confirm form |

### Form types to add

Extend `FORM_TYPES` in `src/lib/form-submissions.ts` (and DB check constraint if
present):

- `reinstate` — closer form
- `reinstate_onboarding` — client welcome-back OB

## Explicitly unchanged

| System | Behavior |
|--------|----------|
| ClickUp | No API calls from reinstate |
| Slack client channels | No create/unarchive from reinstate |
| GHL New Client Make scenario | Unused |
| Churn form / history | Untouched as historical record |
| Core `/onboard` and `/onboard/dscr` | Unchanged URLs and match logic |

## Error handling

| Case | Response |
|------|----------|
| Client not churned | 409 with clear message |
| Missing required deal fields | Client-side + API validation |
| Duplicate reinstate submit | 409 + existing welcome-back link |
| Invalid/expired token | Public friendly error page |
| Close saved, outbound email failed | Still success; show copyable link |

## Testing (manual)

1. Churned client → same-file reinstate → `onboarding`, history intact, **new**
   winback close (original close unchanged), token URL works; pauses cleared.
2. Welcome-back link → prefilled → submit → fields patched,
   `reinstate_onboarding` row present; progress shows Sign + OB only for the
   new cycle.
3. Complete kickoff + launch again on same file (must not 409 on old launch).
4. New-offer path → sibling row without copying GHL ids; original stays
   `churned`; duplicate-check exclusions work.
5. Confirm no ClickUp/Slack side effects from the app.
6. Closer stats include the reinstate close; CAC new-logo rollup excludes it
   (once filter lands).
7. Non-churned client cannot be reinstated.

## Compatibility risks (spot-check) and required mitigations

These are current-system constraints that would cause **runtime errors** or
**silent metric/mapping damage** if ignored. They are in scope for v1.

### Hard blockers (must fix in implementation)

| Risk | Why | Mitigation |
|------|-----|------------|
| `acquisition_closes` unique on `client_id` (`acquisition_closes_client_id_key`) | Same-file reinstate cannot insert a second close; ingest upsert would overwrite the original close | Relax unique constraint to allow multiple closes per client **or** soft-dismiss/archive the prior close and insert a new one. Never use `finalizeClose` upsert-by-client for winbacks. |
| `FORM_TYPES` DB check | `reinstate` / `reinstate_onboarding` inserts fail until constraint expanded | Migration + TS `FORM_TYPES` / labels together (same pattern as `launch_kit`) |
| Launch 409 after prior launch | `POST .../launch` rejects when an operational launch submission already exists | After reinstate, allow a new launch cycle (gate on post-reinstate submissions or clear the “already launched” block when lifecycle returned via reinstate) |
| Progress strip stale | `getFormProgressForClients` treats any historical `onboarding`/`kickoff`/`launch` as done | After reinstate, progress must use **post-reinstate** submissions; treat `reinstate` as Sign; `reinstate_onboarding` as OB |
| Sibling + copied GHL IDs | Unique indexes on `ghl_location_id` / `ghl_contact_id` | Same-file: keep IDs. New offer: **never copy** location/contact (null until kickoff / new sub-account). “Reuse GHL” is only valid for same-file |

### Mapping / attribution

| Risk | Severity | Mitigation |
|------|----------|------------|
| New GHL location on same row | Med | Webhooks follow new `ghl_location_id`; old events stay on history — OK. Document CS must update Make/client map if location changes |
| Sibling sharing contact/location | High | Forbidden by unique indexes; use `createOfferForAccount` helpers; distinct or null GHL ids |
| Meta spend map (Make by roster name) | Med | CS checklist: update Meta client map when sibling/rename; same-file with unchanged name usually OK |
| Core `/onboard` email match with sibling | Med | Welcome-back is token-only (no email match). Sibling should not share primary email if they might use public `/onboard` later, or identity-aware match must be used |

### Metrics / billing leftovers

| Risk | Severity | Mitigation |
|------|----------|------------|
| Winback close counts as new-logo CAC/payroll | High | Durable `close_kind = reinstate` (or equivalent). Document: closer credit **includes** winbacks; CAC “new logo” / new-logo cash **excludes** them unless product later opts in |
| Rewriting `date_signed` | Med | Set `reinstated_at` (or store on reinstate submission). Keep original `date_signed` for tenure; use reinstate date for the close’s `closed_at` |
| `billing_paused` / `ads_paused` / stale `contract_end_date` | Med | Reinstate patch clears pauses (or prompts) and sets new contract term/end from the form |
| Lost MRR drops when status returns to `onboarding` | Med | Existing reactivate behavior — document; do not erase history rows |

### Safe / largely unaffected

- ClickUp / Slack / GHL New Client Make pipeline (intentionally unused)
- Churn form + `client_status_history` rows (kept)
- Core `/onboard` and `/onboard/dscr` if welcome-back stays token-bound
- `is_live` (stays false until launch → `active`)
- Billing emergency Reactivate (orthogonal)
- `would_rejoin` on churn (display-only; optional context on closer form)

## Open implementation notes (not open product questions)

- Schema: relax `acquisition_closes` one-close-per-client unique; add winback
  marker; extend form_type check; optional `reinstated_at` / welcome-back token
  column
- Token storage vs signed URL (must not reuse report `share_token`)
- Welcome-back wizard: shared components, separate route/copy
- Progress + launch gate: compute “cycle” after latest `reinstate` submission
- New-offer path: call existing `createOfferForAccount` / add-offer duplicate
  exclusions — do not hand-roll sibling insert

## Success criteria

- Closer can reinstate a churned client in Mr. Waiz in one form without Make.
- Client confirms info on a unique prefilled welcome-back link.
- Churn history remains; current status and roster reflect the rejoin.
- Sales gets close credit tagged as reinstate without breaking unique-close
  constraints or overwriting the original close.
- Same-file re-launch and progress strip work for the new cycle (not stuck on
  old launch / green strip).
- Same file by default; new offer creates a clean sibling when selected
  without colliding on GHL unique indexes.
- Pauses / contract end are cleared or reset so billing and ads state match
  the rejoin.
- ClickUp/Slack remain operator-owned.
- Mapping: same-file keeps GHL ids; sibling never copies them; Meta map called
  out on CS checklist when needed.
