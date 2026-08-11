---
title: DSCR Performance Onboarding Form — Design
status: draft
last_updated: 2026-08-11
artifact_type: design
related_docs:
  - docs/CLIENT_ONBOARDING.md
  - src/lib/onboarding-form.ts
  - src/lib/apply-onboarding.ts
  - src/components/onboarding/OnboardingWizard.tsx
---

# DSCR Performance Onboarding Form — Design

## Purpose

Ship a **universal public onboarding form** for clients on the **new DSCR
performance offer**. Same Mr. Waiz onboarding spine as `/onboard`; only
**copy/branding**, **two product questions** (with one branch), a clearer
**contact block**, and a stronger **thank-you** page differ.

## Non-goals

- Replacing RM / core `/onboard` or changing its URL
- A second form pipeline, `form_type`, Make webhook, or GHL tag
- Full CRM access / credential collection in the form
- Reworking `sales_package` catalog (`core_offer` / `mid_offer` / etc.) for PPR SKUs
- Parallel unmapped resolution tooling

## Entry

| Item | Value |
|------|--------|
| URL | `/onboard/dscr` (universal link in GHL / sales emails for DSCR performance clients) |
| Link registry | `src/lib/internal-forms.ts` (`slug: onboard-dscr`) → Resources + `/forms` hub next to core Client Onboarding |
| Existing `/onboard` | Unchanged (RM / other products) |
| Match | Email + phone → Mr. Waiz `clients` (same as today) |
| Audience | New DSCR performance offer clients (Leads pack or Conversations pack) |

## Product model (client-facing)

Same wizard as `/onboard` with these deltas.

### Contact block (early, after welcome)

| Field | Required | Notes |
|-------|----------|--------|
| First name | Yes | Thank-you: `Thank you, {First Name}` |
| Last name | Yes | Combined with first → `primary_contact_name` / `primary_contact` |
| Email | Yes | Match key (already on RM form) |
| Phone | Yes | Match key (already on RM form) |

### Full existing wizard remains

Account management, role (MLO / owner), company block by role, NMLS, licensed
states, location, timezone, review URL (optional), bio, headshot (optional),
additional team members — same validation and behavior as `/onboard`.

### New question 1 — billable unit (required)

**Buying Leads or Conversations?**

| Choice | Meaning |
|--------|---------|
| Leads | Media + handoff; client owns dial/close path |
| Conversations | Full Waiz setter path; LO-spoke unit |

### New question 2 — CRM (conditional)

Shown **only if unit = Leads**.

| Choice | Copy notes |
|--------|------------|
| **Ours** (Waiz CRM) | Fine print: only additional costs are the client’s own SMS / dials (~**$0.0083 per SMS**) |
| **Theirs** (client CRM) | No SMS pricing fine print |

If unit = **Conversations**: **skip CRM question** (Waiz path assumed). Do not
require CRM answer; store as not applicable.

### Step order (target)

1. Welcome (DSCR performance copy)
2. Contact: first, last, email, phone
3. Account management → role → company (role-branched)
4. Personal: NMLS, states, location, timezone
5. Leads vs Conversations
6. CRM (Leads only)
7. Creative: review URL, bio, headshot
8. Team members

## Architecture — same spine as `/onboard`

Intentional constraint: **same engine**, not a fork.

```text
/onboard/dscr (wizard UI + DSCR copy)
    → POST /api/onboard/submit   (same route; extended parse)
    → parseOnboardingFormFields  (shared schema + DSCR fields)
    → applyOnboardingSubmission  (same apply)
        → findClientsByContact(email, phone)
        → headshot → client-headshots
        → clients.update
        → lifecycle: new_account → onboarding
        → client_contacts (additional members)
        → client_form_submissions  form_type = 'onboarding'
        → matched: GHL "OB Form Filled" + ClickUp comment + ops Slack (if configured)
        → unmatched: unmapped queue; assign/create-client uses same apply path
```

### Form type and variant

| Layer | Value |
|-------|--------|
| `form_type` | **`onboarding`** (required for unmapped queue, pending resolve, Client File parity) |
| `responses.form_variant` | **`dscr_performance`** (display / filter label only) |

Do **not** introduce `form_type: onboarding_dscr` without updating every consumer
(`apply-onboarding`, pending API, Form Submissions tab, form-submissions helpers).

### Client patch

Extend existing `onboardingToClientPatch` — keep all current fields.

| Form capture | Live write |
|--------------|------------|
| First + last | `primary_contact_name` (and `primary_contact` if already used in this flow) |
| Existing OB fields | Same as today |
| Leads / Conversations + CRM | Always in `responses`; also sparse live fields only if a non-colliding column already fits. **Do not map into `sales_package`** (catalog is unrelated codes). Prefer `responses` + ClickUp dump as source of truth for unit/CRM in v1 if no clean column exists after schema check. |

Optional: only set `reporting_type` if empty and product rule is agreed; default is
**do not overwrite** vertical (closer New Client form remains source for product).

### Side effects

Same fire-and-forget path as RM OB:

- GHL tag `OB Form Filled` (unchanged name so CS automations keep firing)
- ClickUp comment: existing fields **plus** full name, unit choice, CRM choice (or N/A)
- Unmapped Slack when match fails

### Public API response

Same shape as today (`success`, `matched`, `message`) so the wizard can branch
thank-you state. Client UI builds personalized thank-you from **submitted first
name** (does not require server to return name, but may).

## Thank-you page

Clean, branded, not a second app.

| Element | Content |
|---------|---------|
| Headline | `Thank you, {First Name}` |
| Support line | Form received; team is on it |
| Timeline (fixed) | See below |
| Match nuance | Matched: check email for next steps on OB call. Unmatched: team will match the file and follow up. |

### Timeline (default bands)

1. **Day 0** — Form received  
2. **Day 0–1** — File matched / team preps  
3. **Day 1–3** — Onboarding call booked or held  
4. **Day 2–7** — Build (funnel, CRM path as chosen, ads)  
5. **~Launch** — Soft QA → live  

Copy can be tightened at implement time without changing step structure.

## Brand / UI

- Reuse `src/components/onboarding/brand.tsx` (Waiz navy/accent/green, wordmark)
- DSCR signal via welcome + thank-you **copy** (“DSCR performance onboarding”), not a separate design system
- Same progress, choice cards, validation patterns as `OnboardingWizard`

## Implementation shape (for planning)

Prefer extension over fork:

1. Route `src/app/onboard/dscr/page.tsx` → wizard with `variant="dscr_performance"`
2. Extend `onboarding-steps` / draft / validation with name + unit + CRM steps
3. Extend `onboarding-form` parse / responses / patch / field labels
4. Extend ClickUp formatter in `onboarding-side-effects`
5. DSCR welcome strings + `OnboardingThankYou` (or variant prop) with name + timeline
6. Keep `applyOnboardingSubmission` single entry; unmapped re-parse must accept new fields

RM `/onboard` path remains default variant with no unit/CRM steps and no forced first/last **unless** we intentionally share contact fields (preferred: first/last only required on DSCR variant so RM form stays byte-identical in behavior).

**Decision locked:** first/last/email/phone identity block is required on **DSCR** form. RM form may keep its current identity surface (email/phone later in flow) to minimize RM risk.

## Error handling

| Case | Behavior |
|------|----------|
| Validation fail | 400; stay on form |
| Rate limit | 429; same as today |
| Match 0 or 2+ | Success + unmapped + thank-you with first name + timeline |
| Match 1 | Success + apply + side effects + thank-you |
| Side-effect fail | Log only; thank-you still shown |

## Test plan

1. Submit DSCR form with known email/phone → client patch + lifecycle advance + submission `form_type=onboarding` + `form_variant=dscr_performance`
2. Leads + Ours → responses include CRM + unit; ClickUp comment shows both; fine print present in UI only (not required in DB)
3. Leads + Theirs → CRM stored; no SMS fine print requirement on storage
4. Conversations → no CRM step; submit succeeds without CRM field
5. Unknown contact → unmapped row; assign from roster applies full payload including unit/CRM
6. RM `/onboard` still submits without DSCR fields
7. Thank-you shows `Thank you, {First Name}` and full timeline

## Risks and mitigations

| Risk | Mitigation |
|------|------------|
| New `form_type` breaks unmapped | Keep `onboarding` |
| Dual apply logic drifts | One `applyOnboardingSubmission` |
| Overwriting wrong vertical | Don’t stamp product unless empty/policy says so |
| Confusing sales_package | Never write PPR unit into package catalog codes |

## Success criteria

1. Universal `/onboard/dscr` link for DSCR performance closes  
2. Same roster connectivity as RM OB (match, patch, side effects, unmapped)  
3. Two product answers captured; CRM only when Leads  
4. Personalized thank-you + clear onboarding timeline  
5. RM `/onboard` behavior unchanged  

## Open implementation detail (resolve at code time)

Exact client column(s) for unit/CRM after schema inspection. If no clean column:
store only on submission `responses` + ClickUp (still meets “connected to
everything” for ops); roster live fields can follow in a later migration if
billing needs them.
