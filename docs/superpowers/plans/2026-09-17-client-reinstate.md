# Client Reinstate / Welcome-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let closers reinstate churned clients in Mr. Waiz (same file or new
offer), credit a winback close, and send a unique prefilled welcome-back OB
link — without Make/ClickUp/Slack automation and without breaking mapping,
launch, or CAC.

**Architecture:** Mirror the churn form pattern. Core logic lives in
`src/lib/reinstate-client.ts` + `src/lib/reinstate-form.ts`. Schema unlocks
multi-close-per-client, `close_kind`, form types, `reinstated_at`, and a
dedicated welcome-back token. Progress and launch gates key off the latest
`reinstate` submission so prior tenure does not block a clean re-cycle.

**Tech Stack:** Next.js App Router, Supabase (Postgres), existing
`client_form_submissions` / `acquisition_closes`, `tsx --test` unit tests.

**Spec:** `docs/superpowers/specs/2026-09-17-client-reinstate-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/add_client_reinstate.sql` | Schema: form types, close unique, `close_kind`, `reinstated_at`, welcome-back token |
| `src/lib/form-submissions.ts` | Add `reinstate` / `reinstate_onboarding`; cycle-aware progress |
| `src/lib/reinstate-form.ts` | Draft types, validation, responses shape, CS checklist keys |
| `src/lib/reinstate-client.ts` | Same-file + new-offer apply; close insert; token mint |
| `src/lib/reinstate-progress.ts` | Latest reinstate cutoff; map progress for strip / launch |
| `src/lib/reinstate-form.test.ts` | Validation + responses round-trip |
| `src/lib/reinstate-progress.test.ts` | Cycle cutoff + progress mapping |
| `src/lib/reinstate-client.test.ts` | Pure helpers (token URL, patch shape) |
| `src/app/api/clients/reinstate/route.ts` | Auth POST closer reinstate |
| `src/app/api/onboard/welcome-back/[token]/route.ts` | GET prefill + POST confirm |
| `src/app/forms/reinstate/*` | Closer UI (churn-form pattern) |
| `src/app/onboard/welcome-back/[token]/page.tsx` | Public welcome-back wizard |
| `src/components/ClientFormsSection.tsx` | Progress strip: reinstate→Sign, reinstate_onboarding→OB |
| `src/app/api/clients/[id]/launch/route.ts` | Ignore pre-reinstate launch submissions |
| `src/lib/business-metrics.ts` (+ callers as needed) | CAC new-logo closes exclude `close_kind=reinstate` |
| `src/lib/internal-forms.ts` | Register reinstate + welcome-back entries |
| `docs/CLIENT_ONBOARDING.md` | Short reinstate section + link to spec |
| `package.json` | Add new test files to `test` script |

---

### Task 1: Schema migration

**Files:**
- Create: `supabase/migrations/add_client_reinstate.sql`
- Modify: `supabase/schema.sql` (keep in sync with migration checks)

- [ ] **Step 1: Add migration**

```sql
-- Client reinstate / welcome-back (2026-09-17)

-- 1) Form types
alter table client_form_submissions
  drop constraint if exists client_form_submissions_form_type_check;

alter table client_form_submissions
  add constraint client_form_submissions_form_type_check check (
    form_type in (
      'new_client', 'onboarding', 'kickoff', 'launch', 'launch_kit', 'churn',
      'reinstate', 'reinstate_onboarding'
    )
  );

-- 2) Allow multiple closes per client (winbacks)
drop index if exists acquisition_closes_client_id_key;

-- Keep non-unique lookup index (already exists as acquisition_closes_client_id_idx)

-- 3) Winback marker
alter table acquisition_closes
  add column if not exists close_kind text not null default 'standard';

alter table acquisition_closes
  drop constraint if exists acquisition_closes_close_kind_check;

alter table acquisition_closes
  add constraint acquisition_closes_close_kind_check check (
    close_kind in ('standard', 'reinstate')
  );

create index if not exists acquisition_closes_close_kind_idx
  on acquisition_closes (close_kind);

-- 4) Tenure-safe reinstate stamp + dedicated OB token (not report share_token)
alter table clients
  add column if not exists reinstated_at timestamptz;

alter table clients
  add column if not exists welcome_back_token text;

alter table clients
  add column if not exists welcome_back_token_created_at timestamptz;

create unique index if not exists clients_welcome_back_token_key
  on clients (welcome_back_token)
  where welcome_back_token is not null;
```

- [ ] **Step 2: Mirror the same constraints/columns in `supabase/schema.sql`**
  (search for `client_form_submissions_form_type_check`,
  `acquisition_closes_client_id_key`, and `clients` column list).

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/add_client_reinstate.sql supabase/schema.sql
git commit -m "Add schema for client reinstate and winback closes."
```

---

### Task 2: Form types + cycle-aware progress helpers

**Files:**
- Modify: `src/lib/form-submissions.ts`
- Create: `src/lib/reinstate-progress.ts`
- Create: `src/lib/reinstate-progress.test.ts`
- Modify: `package.json` (`test` script)

- [ ] **Step 1: Extend `FORM_TYPES` and labels**

In `src/lib/form-submissions.ts`:

```ts
export const FORM_TYPES = [
  'new_client',
  'onboarding',
  'kickoff',
  'launch',
  'launch_kit',
  'churn',
  'reinstate',
  'reinstate_onboarding',
] as const;

export const FORM_TYPE_LABELS: Record<FormType, string> = {
  new_client: 'New Client',
  onboarding: 'Onboarding',
  kickoff: 'Kickoff',
  launch: 'Launch',
  launch_kit: 'Launch Kit',
  churn: 'Churn',
  reinstate: 'Reinstate',
  reinstate_onboarding: 'Welcome-Back OB',
};
```

- [ ] **Step 2: Write failing progress tests**

Create `src/lib/reinstate-progress.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  latestReinstateCutoffIso,
  mapCycleProgress,
  isLaunchBlockingForCycle,
} from '@/lib/reinstate-progress';

describe('reinstate-progress', () => {
  it('uses reinstate as Sign and reinstate_onboarding as OB after cutoff', () => {
    const cutoff = '2026-09-01T00:00:00.000Z';
    const progress = mapCycleProgress(
      [
        { form_type: 'new_client', submitted_at: '2025-01-01T00:00:00.000Z', status: 'applied' },
        { form_type: 'onboarding', submitted_at: '2025-01-02T00:00:00.000Z', status: 'applied' },
        { form_type: 'kickoff', submitted_at: '2025-01-03T00:00:00.000Z', status: 'applied' },
        { form_type: 'launch', submitted_at: '2025-01-04T00:00:00.000Z', status: 'applied' },
        { form_type: 'reinstate', submitted_at: cutoff, status: 'applied' },
        { form_type: 'reinstate_onboarding', submitted_at: '2026-09-02T00:00:00.000Z', status: 'applied' },
      ],
      cutoff,
    );
    assert.equal(progress.new_client, true); // reinstate maps to Sign
    assert.equal(progress.onboarding, true); // welcome-back maps to OB
    assert.equal(progress.kickoff, false);
    assert.equal(progress.launch, false);
  });

  it('does not block launch on pre-reinstate launch rows', () => {
    const cutoff = '2026-09-01T00:00:00.000Z';
    assert.equal(
      isLaunchBlockingForCycle(
        [{ form_type: 'launch', submitted_at: '2025-01-04T00:00:00.000Z', status: 'applied' }],
        cutoff,
      ),
      false,
    );
    assert.equal(
      isLaunchBlockingForCycle(
        [
          { form_type: 'launch', submitted_at: '2025-01-04T00:00:00.000Z', status: 'applied' },
          { form_type: 'launch', submitted_at: '2026-09-03T00:00:00.000Z', status: 'applied' },
        ],
        cutoff,
      ),
      true,
    );
  });

  it('latestReinstateCutoffIso returns newest reinstate', () => {
    assert.equal(
      latestReinstateCutoffIso([
        { form_type: 'reinstate', submitted_at: '2026-08-01T00:00:00.000Z' },
        { form_type: 'reinstate', submitted_at: '2026-09-01T00:00:00.000Z' },
      ]),
      '2026-09-01T00:00:00.000Z',
    );
    assert.equal(latestReinstateCutoffIso([]), null);
  });
});
```

- [ ] **Step 3: Run test — expect FAIL (module missing)**

```bash
npx tsx --test src/lib/reinstate-progress.test.ts
```

- [ ] **Step 4: Implement `src/lib/reinstate-progress.ts`**

```ts
import type { FormType } from '@/lib/form-submissions';

export type SubmissionStamp = {
  form_type: string;
  submitted_at: string;
  status?: string;
};

export function latestReinstateCutoffIso(
  rows: Array<{ form_type: string; submitted_at: string }>,
): string | null {
  let latest: string | null = null;
  for (const row of rows) {
    if (row.form_type !== 'reinstate') continue;
    if (!latest || row.submitted_at > latest) latest = row.submitted_at;
  }
  return latest;
}

function inCycle(row: SubmissionStamp, cutoffIso: string | null): boolean {
  if (!cutoffIso) return true; // no reinstate → full history (legacy path)
  return row.submitted_at >= cutoffIso;
}

/** Map cycle submissions onto the Sign→OB→KO→Kit→Live strip keys. */
export function mapCycleProgress(
  rows: SubmissionStamp[],
  cutoffIso: string | null,
): Partial<Record<FormType, boolean>> {
  const out: Partial<Record<FormType, boolean>> = {};
  for (const row of rows) {
    if (row.status && row.status !== 'applied' && row.status !== 'submitted') continue;
    if (!inCycle(row, cutoffIso)) continue;
    if (row.form_type === 'reinstate') out.new_client = true;
    else if (row.form_type === 'reinstate_onboarding') out.onboarding = true;
    else if (
      row.form_type === 'new_client' ||
      row.form_type === 'onboarding' ||
      row.form_type === 'kickoff' ||
      row.form_type === 'launch_kit' ||
      row.form_type === 'launch'
    ) {
      out[row.form_type as FormType] = true;
    }
  }
  return out;
}

export function isLaunchBlockingForCycle(
  launchRows: SubmissionStamp[],
  cutoffIso: string | null,
): boolean {
  return launchRows.some(
    (row) =>
      row.form_type === 'launch' &&
      (!row.status || row.status === 'applied') &&
      inCycle(row, cutoffIso),
  );
}
```

- [ ] **Step 5: Update `getFormProgressForClients`** in
  `src/lib/form-submissions.ts` to:
  1. Load submissions including `submitted_at` and `reinstate`.
  2. Per client, compute cutoff via `latestReinstateCutoffIso`.
  3. Return `mapCycleProgress(...)` instead of raw any-history flags.

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx tsx --test src/lib/reinstate-progress.test.ts
```

- [ ] **Step 7: Add file to `package.json` `test` script list; commit**

```bash
git add src/lib/form-submissions.ts src/lib/reinstate-progress.ts \
  src/lib/reinstate-progress.test.ts package.json
git commit -m "Add reinstate form types and cycle-aware progress."
```

---

### Task 3: Reinstate form draft + validation

**Files:**
- Create: `src/lib/reinstate-form.ts`
- Create: `src/lib/reinstate-form.test.ts`

- [ ] **Step 1: Write failing tests** for required fields and checklist keys.

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  emptyReinstateDraft,
  reinstateValidationError,
  reinstateDraftToResponses,
} from '@/lib/reinstate-form';

describe('reinstate-form', () => {
  it('requires client, engagement, offer, closer, signed date', () => {
    const err = reinstateValidationError(emptyReinstateDraft());
    assert.ok(err);
  });

  it('accepts a complete same_file draft', () => {
    const draft = emptyReinstateDraft();
    draft.client_id = '11111111-1111-1111-1111-111111111111';
    draft.engagement = 'same_file';
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.mrr = 5000;
    draft.closed_at = '2026-09-17';
    draft.closer_name = 'Alex Closer';
    draft.cash_collected = 5000;
    draft.ghl_reuse = 'yes';
    assert.equal(reinstateValidationError(draft), null);
    const responses = reinstateDraftToResponses(draft);
    assert.equal(responses.engagement, 'same_file');
    assert.equal(responses.ghl_reuse, 'yes');
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx tsx --test src/lib/reinstate-form.test.ts
```

- [ ] **Step 3: Implement `src/lib/reinstate-form.ts`**

```ts
export const REINSTATE_ENGAGEMENTS = ['same_file', 'new_offer'] as const;
export type ReinstateEngagement = (typeof REINSTATE_ENGAGEMENTS)[number];

export const GHL_REUSE_OPTIONS = ['yes', 'no', 'unsure'] as const;
export type GhlReuse = (typeof GHL_REUSE_OPTIONS)[number];

export const CS_REINSTATE_CHECKLIST = [
  { key: 'ghl_path_confirmed', label: 'Confirm GHL path (reuse vs new sub-account)' },
  { key: 'billing_live', label: 'Billing live / terms correct' },
  { key: 'welcome_back_ob_received', label: 'Welcome-back OB received' },
  { key: 'meta_map_checked', label: 'Meta client map updated if needed' },
  { key: 'ready_for_kickoff', label: 'Ready for kickoff / launch as needed' },
] as const;

export type ReinstateFormDraft = {
  client_id: string;
  engagement: ReinstateEngagement;
  offer: string;
  reporting_type: string;
  sales_package: string;
  mrr: number | null;
  closed_at: string;
  closer_name: string;
  cash_collected: number | null;
  contract_term_months: number | null;
  contract_end_date: string;
  ghl_reuse: GhlReuse;
  leave_billing_paused: boolean;
  leave_ads_paused: boolean;
  internal_notes: string;
};

export function emptyReinstateDraft(): ReinstateFormDraft {
  return {
    client_id: '',
    engagement: 'same_file',
    offer: '',
    reporting_type: '',
    sales_package: '',
    mrr: null,
    closed_at: new Date().toISOString().slice(0, 10),
    closer_name: '',
    cash_collected: null,
    contract_term_months: null,
    contract_end_date: '',
    ghl_reuse: 'unsure',
    leave_billing_paused: false,
    leave_ads_paused: false,
    internal_notes: '',
  };
}

export function reinstateValidationError(draft: ReinstateFormDraft): string | null {
  if (!draft.client_id.trim()) return 'Select a churned client.';
  if (!REINSTATE_ENGAGEMENTS.includes(draft.engagement)) return 'Pick same file or new offer.';
  if (!draft.offer.trim() && !draft.reporting_type.trim()) return 'Enter the offer / product.';
  if (!draft.closed_at.trim()) return 'Enter the reinstate (signed) date.';
  if (!draft.closer_name.trim()) return 'Enter the closer name.';
  if (draft.engagement === 'same_file' && draft.ghl_reuse === 'yes') {
    /* ok — reuse only valid for same_file; enforced in UI copy too */
  }
  if (draft.engagement === 'new_offer' && draft.ghl_reuse === 'yes') {
    return 'New offer cannot reuse the old GHL sub-account on the sibling row.';
  }
  return null;
}

export function reinstateDraftToResponses(draft: ReinstateFormDraft): Record<string, unknown> {
  return {
    engagement: draft.engagement,
    offer: draft.offer,
    reporting_type: draft.reporting_type,
    sales_package: draft.sales_package,
    mrr: draft.mrr,
    closed_at: draft.closed_at,
    closer_name: draft.closer_name,
    cash_collected: draft.cash_collected,
    contract_term_months: draft.contract_term_months,
    contract_end_date: draft.contract_end_date || null,
    ghl_reuse: draft.ghl_reuse,
    leave_billing_paused: draft.leave_billing_paused,
    leave_ads_paused: draft.leave_ads_paused,
    internal_notes: draft.internal_notes,
    cs_checklist: Object.fromEntries(
      CS_REINSTATE_CHECKLIST.map((i) => [i.key, false]),
    ),
  };
}
```

- [ ] **Step 4: Run tests — PASS; commit**

```bash
npx tsx --test src/lib/reinstate-form.test.ts
git add src/lib/reinstate-form.ts src/lib/reinstate-form.test.ts package.json
git commit -m "Add reinstate form draft validation."
```

---

### Task 4: Core `reinstateClient` apply logic

**Files:**
- Create: `src/lib/reinstate-client.ts`
- Create: `src/lib/reinstate-client.test.ts`

Pure helpers + documented apply function used by the API. Do **not** call
`finalizeClose` from `acquisition-ingest.ts` (that upserts by `client_id`).

- [ ] **Step 1: Tests for URL + client patch shape**

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildWelcomeBackUrl,
  buildSameFileClientPatch,
} from '@/lib/reinstate-client';
import { emptyReinstateDraft } from '@/lib/reinstate-form';

describe('reinstate-client helpers', () => {
  it('builds welcome-back URL', () => {
    assert.equal(
      buildWelcomeBackUrl('https://app.example.com', 'tok_abc'),
      'https://app.example.com/onboard/welcome-back/tok_abc',
    );
  });

  it('keeps date_signed, sets reinstated_at, clears pauses', () => {
    const draft = emptyReinstateDraft();
    draft.mrr = 6000;
    draft.offer = 'RM';
    draft.reporting_type = 'RM';
    draft.closed_at = '2026-09-17';
    draft.contract_end_date = '2027-09-17';
    const patch = buildSameFileClientPatch(draft, '2026-09-17T12:00:00.000Z');
    assert.equal(patch.date_signed, undefined); // must not rewrite tenure start
    assert.equal(patch.reinstated_at, '2026-09-17T12:00:00.000Z');
    assert.equal(patch.lifecycle_status, 'onboarding');
    assert.equal(patch.billing_paused, false);
    assert.equal(patch.ads_paused, false);
    assert.equal(patch.mrr, 6000);
  });
});
```

- [ ] **Step 2: Implement helpers + `reinstateClient`**

`reinstateClient(service, { draft, submittedBy, appOrigin })` must:

1. Load client; 409 if not `churned`.
2. Idempotency: if lifecycle is `onboarding` and a `reinstate` submission exists
   in the last 24h for this client, return 409 payload with existing
   `welcome_back_url`.
3. **same_file:** `buildSameFileClientPatch` + update; keep
   `ghl_location_id` / `ghl_contact_id`.
4. **new_offer:** call `createOfferForAccount` with **no**
   `ghl_location_id`; force `ghl_reuse` semantics to not copy contact id;
   leave origin `churned`.
5. `insertFormSubmission` `form_type: 'reinstate'`.
6. Insert `acquisition_closes` with `close_source: 'manual'`,
   `close_kind: 'reinstate'`, `closed_at` from draft, `client_id` = target,
   `cash_collected`, closer name in `raw` or setter/closer text fields if
   present — **plain insert**, never upsert-by-client.
7. Mint `crypto.randomUUID()` (or 32-byte hex) →
   `welcome_back_token` + `welcome_back_token_created_at` on target client.
8. Return `{ client_id, welcome_back_url, engagement }`.

```ts
export function buildWelcomeBackUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/onboard/welcome-back/${encodeURIComponent(token)}`;
}

export function buildSameFileClientPatch(
  draft: ReinstateFormDraft,
  reinstatedAtIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    lifecycle_status: 'onboarding',
    reinstated_at: reinstatedAtIso,
    offer: draft.offer || draft.reporting_type,
    reporting_type: draft.reporting_type || draft.offer,
    mrr: draft.mrr,
  };
  if (draft.sales_package) patch.sales_package = draft.sales_package;
  if (draft.contract_term_months != null) {
    patch.contract_term_months = draft.contract_term_months;
  }
  if (draft.contract_end_date) patch.contract_end_date = draft.contract_end_date;
  if (!draft.leave_billing_paused) {
    patch.billing_paused = false;
    patch.billing_paused_at = null;
    patch.billing_paused_note = null;
  }
  if (!draft.leave_ads_paused) {
    patch.ads_paused = false;
    patch.ads_paused_at = null;
    patch.ads_paused_note = null;
  }
  // date_signed intentionally omitted
  return patch;
}
```

Wire `syncIsLiveWithLifecycle('onboarding')` on update (false). Rely on
existing DB/trigger behavior to clear `churned_at` when leaving `churned`
(same as other lifecycle patches — verify in
`src/lib/lifecycle-sync.ts` / client PATCH; if churned_at is only cleared in
one code path, clear it explicitly: `churned_at: null`).

- [ ] **Step 3: Run helper tests — PASS; commit**

```bash
npx tsx --test src/lib/reinstate-client.test.ts
git add src/lib/reinstate-client.ts src/lib/reinstate-client.test.ts package.json
git commit -m "Add reinstateClient apply helpers."
```

---

### Task 5: Closer API + launch gate fix

**Files:**
- Create: `src/app/api/clients/reinstate/route.ts`
- Modify: `src/app/api/clients/[id]/launch/route.ts`
- Modify: (optional GET list) reuse `GET /api/clients` with
  `lifecycle_status=churned` filter if already supported; else add thin
  query in reinstate route GET.

- [ ] **Step 1: Implement `POST /api/clients/reinstate`**

Auth: same permission set as churn / clients admin (`admin_clients` or
whatever churn uses — copy from `src/app/api/clients/[id]/churn/route.ts`).

```ts
// Pseudocode structure — match churn auth helpers exactly
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  // permission check like churn
  const body = await req.json();
  const draft = parseReinstateDraft(body); // from reinstate-form
  const error = reinstateValidationError(draft);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const result = await reinstateClient(ctx.service, {
      draft,
      submittedBy: ctx.userId,
      appOrigin: process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin,
    });
    return NextResponse.json(result);
  } catch (e) {
    // map 409 churned / idempotent
  }
}
```

- [ ] **Step 2: Fix launch GET/POST already_launched**

In both GET and POST of `src/app/api/clients/[id]/launch/route.ts`:

1. Also fetch latest `reinstate` submission `submitted_at` for this client.
2. `cutoff = latestReinstateCutoffIso(...)`.
3. Replace `already_launched: !!operationalLaunch` with
   `isLaunchBlockingForCycle(launchRows, cutoff)`.
4. Same for the POST 409 guard.

Include `submitted_at` in the launch submission select.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/clients/reinstate/route.ts \
  src/app/api/clients/[id]/launch/route.ts
git commit -m "Add reinstate API and cycle-aware launch gate."
```

---

### Task 6: Closer form UI `/forms/reinstate`

**Files:**
- Create: `src/app/forms/reinstate/page.tsx`
- Create: `src/app/forms/reinstate/ReinstateFormRouteClient.tsx`
- Create: `src/components/ReinstateForm.tsx` (or colocate)
- Modify: `src/lib/internal-forms.ts`

- [ ] **Step 1: Register form**

```ts
{
  slug: 'reinstate',
  title: 'Client Reinstate',
  description:
    'Closer form for paid rejoins: pick a churned client, log the winback close, and issue a welcome-back OB link.',
  href: '/forms/reinstate',
  audience: 'Closers / Client Success',
  tags: ['reinstate', 'winback', 'cs', 'sales'],
},
```

- [ ] **Step 2: Build UI mirroring churn**

- Prefill `?clientId=`
- Search/select **churned** clients only
- Show read-only: prior offer, `churned_at`, latest churn reason if available
- Fields from `ReinstateFormDraft`
- Toggle Same file / New offer
- On success: show copyable `welcome_back_url` prominently

- [ ] **Step 3: Manual smoke in browser** (logged-in): open `/forms/reinstate`,
  ensure churned list loads and validation blocks empty submit.

- [ ] **Step 4: Commit**

```bash
git add src/app/forms/reinstate src/components/ReinstateForm.tsx \
  src/lib/internal-forms.ts
git commit -m "Add closer reinstate form UI."
```

---

### Task 7: Welcome-back public OB

**Files:**
- Create: `src/app/onboard/welcome-back/[token]/page.tsx`
- Create: `src/app/api/onboard/welcome-back/[token]/route.ts`
- Modify: `src/lib/internal-forms.ts` (docs entry only / optional public link note)
- Reuse: onboarding field components from `src/components/onboarding/*`

- [ ] **Step 1: GET API** — resolve `welcome_back_token` → client fields for
  prefill. 404 if missing. Do not return other clients.

- [ ] **Step 2: POST API** — if `reinstate_onboarding` already applied for
  this client after the latest reinstate cutoff → 409
  `{ error: 'already_submitted' }`. Else patch client contact/business fields
  (same allowlist as core OB apply where possible) and
  `insertFormSubmission({ form_type: 'reinstate_onboarding' })`. Clear or keep
  token (prefer keep until CS checklist; optional null-out after submit).

- [ ] **Step 3: Page** — welcome-back copy; prefilled wizard; thank-you on
  success; friendly invalid-token state.

- [ ] **Step 4: Commit**

```bash
git add src/app/onboard/welcome-back src/app/api/onboard/welcome-back \
  src/lib/internal-forms.ts
git commit -m "Add welcome-back onboarding token flow."
```

---

### Task 8: CS surfaces + CAC exclusion

**Files:**
- Modify: `src/components/ClientFormsSection.tsx` (badge / history labels —
  already covered if FORM_TYPE_LABELS updated; ensure strip uses cycle progress)
- Modify: `src/components/ClientFile.tsx` — small Reinstate badge when
  `reinstated_at` set and lifecycle in onboarding/new_account, plus link to
  latest reinstate responses / CS checklist toggles (PATCH submission
  responses is enough for v1)
- Modify: `src/lib/business-metrics.ts` — when counting CAC `signed_closes` /
  `cac_closes`, exclude rows with `close_kind = 'reinstate'`
- Modify: closer stats paths that should **include** reinstate (default
  include all non-dismissed closes — verify they do not filter
  `close_kind`)
- Modify: `docs/CLIENT_ONBOARDING.md` — add “Reinstate / welcome-back” section
  pointing at the spec and `/forms/reinstate`

- [ ] **Step 1: CAC filter**

Wherever acquisition closes are counted for CAC denominator, add:

```ts
// include only standard closes for new-logo CAC
.close_kind !== 'reinstate'
```

or SQL `.neq('close_kind', 'reinstate')` / `.eq('close_kind', 'standard')`.

Closer credit / payroll B2B: **keep** reinstate closes unless product later
splits — document in `docs/ACQUISITION_KPIS.md` one line:
“`close_kind=reinstate` counts for closer credit; excluded from CAC new-logo
denominator.”

- [ ] **Step 2: Update `business-metrics` tests** if they assert close counts —
  add a reinstate close fixture that must not inflate `cac_closes`.

- [ ] **Step 3: Commit**

```bash
git add src/components/ClientFormsSection.tsx src/components/ClientFile.tsx \
  src/lib/business-metrics.ts src/lib/business-metrics.test.ts \
  docs/CLIENT_ONBOARDING.md docs/ACQUISITION_KPIS.md
git commit -m "Surface reinstate in CS UI and exclude winbacks from CAC."
```

---

### Task 9: End-to-end verification checklist

- [ ] **Step 1: Unit tests**

```bash
npx tsx --test src/lib/reinstate-progress.test.ts \
  src/lib/reinstate-form.test.ts \
  src/lib/reinstate-client.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Manual same-file path**

1. Pick a churned client in staging.
2. Submit `/forms/reinstate` (same file).
3. Confirm: `lifecycle_status=onboarding`, `churned_at` null, history intact,
   new `acquisition_closes` with `close_kind=reinstate`, original close row
   unchanged, pauses cleared, `welcome_back_token` set.
4. Open welcome-back URL → confirm prefill → submit.
5. Progress strip: Sign+OB only for new cycle.
6. Complete kickoff + launch without 409.

- [ ] **Step 3: Manual new-offer path**

1. Reinstate with New offer.
2. Sibling row has null GHL ids; origin still churned.
3. Close attached to sibling only.

- [ ] **Step 4: Mapping sanity**

1. Same-file: existing `ghl_location_id` unchanged → webhooks still resolve.
2. New offer: no unique-index error; CS checklist shows Meta map item.

- [ ] **Step 5: Final commit** only if docs/tests tweaked during QA.

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| Closer form `/forms/reinstate` | 6 |
| Same file default / new offer sibling | 4 |
| Keep churn history; clear current churn | 4 |
| Count winback close without overwrite | 1, 4 |
| Welcome-back unique token OB | 7 |
| Prefill confirm/update | 7 |
| No ClickUp/Slack/Make | 4 (explicit non-calls) |
| Progress strip new cycle | 2, 8 |
| Re-launch after prior launch | 5 |
| FORM_TYPES migration | 1, 2 |
| GHL: same-file keep; sibling never copy | 3, 4 |
| Clear pauses / contract fields | 4 |
| Keep original `date_signed` + `reinstated_at` | 4 |
| CAC excludes reinstate; closer credit includes | 8 |
| CS checklist incl. Meta map | 3, 8 |
| Docs | 8 |

## Placeholder / consistency check

- No TBD steps.
- `close_kind` values: `standard` | `reinstate` throughout.
- Progress maps `reinstate`→`new_client` (Sign) and
  `reinstate_onboarding`→`onboarding` (OB) consistently in Task 2 and Task 8.
- Launch gate uses the same cutoff helper as progress.
