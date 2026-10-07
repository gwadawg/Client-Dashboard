# DSCR client landing builder — Implementation Plan

> **For agentic workers:** Implement task-by-task. Do not start the next
> task until the current one is checked. Steps use checkbox (`- [ ]`)
> syntax for tracking.

**Goal:** A DSCR client in Client File can save a landing draft and
publish it as a pull request to `gwadawg/dscr-experts`. After a human
merges and the live URL responds, Mr. Waiz stores the landing and
thank-you URLs.

**Architecture:** One library folder, one lazy form, two routes.
Mr. Waiz writes YAML and a headshot file. The template repo builds HTML.
No second app. No Client Roster action. No reverse-mortgage path.

**Tech Stack:** Next.js App Router, Supabase `client_form_submissions`,
GitHub contents + pulls API, `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-10-06-client-landing-builder-design.md`

**Already done (do not redo):**

- Factory repo `gwadawg/dscr-experts` deploys to `https://dscrexperts.com/`
- `LANDING_GITHUB_TOKEN` is on Railway
- GitHub webhook `693836837` posts `pull_request` events to
  `https://os.waizmedia.net/api/webhooks/github/landing-page`
- `LANDING_GITHUB_WEBHOOK_SECRET` is in local `.env.local`
- Design spec rewritten for the factory (2026-10-07)

**Before the first publish against production:** copy
`LANDING_GITHUB_WEBHOOK_SECRET` to Railway and set
`LANDING_DSCR_GITHUB_REPO=gwadawg/dscr-experts`.

---

## File map

| File | Responsibility |
|------|----------------|
| `supabase/migrations/add_landing_page_form_type.sql` | Allow `form_type = landing_page` |
| `supabase/schema.sql` | Same check constraint, kept in sync |
| `src/lib/form-submissions.ts` | `FORM_TYPES` + label |
| `src/lib/landing-page/products.ts` | Repo, site URL, themes, allowed commit paths |
| `src/lib/landing-page/types.ts` | Draft and publish payload |
| `src/lib/landing-page/intake.ts` | Empty draft, prefill, parse, validate |
| `src/lib/landing-page/yaml.ts` | Payload to `clients/{slug}.yaml` text |
| `src/lib/landing-page/headshot.ts` | URL to `{ path, bytes }` |
| `src/lib/landing-page/github.ts` | Branch, commit, pull request, file exists |
| `src/lib/landing-page/storage.ts` | Latest draft / submitted / applied, slug taken |
| `src/lib/landing-page/landing-page.test.ts` | Prefill, validation, YAML, slug rules |
| `src/app/api/clients/[id]/landing-page/route.ts` | GET, save, publish, check |
| `src/app/api/webhooks/github/landing-page/route.ts` | Signature, merge, close, liveness |
| `src/components/landing-page/LandingPageForm.tsx` | The form |
| `src/components/ClientFile.tsx` | One DSCR-only control, lazy mount |

---

### Task 1: Form type

**Files:**

- Create: `supabase/migrations/add_landing_page_form_type.sql`
- Modify: `supabase/schema.sql`, `src/lib/form-submissions.ts`

- [ ] **Step 1:** Copy the current `client_form_submissions_form_type_check`
  list from `supabase/schema.sql`. Add `landing_page`. Do not drop
  `tech_qa`, `marketing_qa`, or `virtual_card`.
- [ ] **Step 2:** Add `landing_page` to `FORM_TYPES` and
  `FORM_TYPE_LABELS` (`Landing page`).
- [ ] **Step 3:** Apply the migration to the linked Supabase project
  before any save is tested.

**Done when:** an insert with `form_type = landing_page` is accepted,
and existing form types still are.

---

### Task 2: Library and tests, no GitHub yet

**Files:**

- Create: `src/lib/landing-page/products.ts`
- Create: `src/lib/landing-page/types.ts`
- Create: `src/lib/landing-page/intake.ts`
- Create: `src/lib/landing-page/yaml.ts`
- Create: `src/lib/landing-page/headshot.ts`
- Create: `src/lib/landing-page/landing-page.test.ts`
- Modify: `package.json` test script if it lists files explicitly

- [ ] **Step 1:** `products.ts` exports the DSCR repo
  `gwadawg/dscr-experts`, site `https://dscrexperts.com`, themes
  `theme-1`, `theme-light`, `theme-custom`, and the two commit paths.
- [ ] **Step 2:** `intake.ts` builds an empty draft, prefills in the
  spec order, and validates the page contract. Slug checks cover the
  pattern, reserved folders, and the three demo slugs. Cross-client
  and repo-file collisions are inputs to the validator (the route
  supplies them). `theme-1` rejects `brand.accent`. `theme-custom`
  requires a hex accent.
- [ ] **Step 3:** `yaml.ts` emits `draft: false` and the keys in
  `clients/_example.yaml`. It leaves `assets.headshot` blank.
  Phone E.164 is derived. Default products are DSCR refinance only.
- [ ] **Step 4:** `headshot.ts` maps a content type or URL extension to
  `headshot.png`, `.jpg`, `.jpeg`, or `.webp`. GIF bytes are labeled
  as PNG output (convert before the commit in the route, or reject
  with a clear error if conversion is not available). No network in
  the unit test. The function accepts bytes plus a source name.
- [ ] **Step 5:** Tests. A filled draft round-trips to YAML and back
  without dropping company NMLS, SMS status, state notices, or
  `applyUrl`. First publish forces `preview: true` when there is no
  applied row. A second publish can set `preview: false`.

**Done when:** `npm test` for this file passes, and the YAML for a
sample client would pass the factory's required-field checks.

---

### Task 3: Storage

**Files:**

- Create: `src/lib/landing-page/storage.ts`

- [ ] **Step 1:** Load the open draft, else the latest applied row,
  for `form_type = landing_page` and this client.
- [ ] **Step 2:** `slugTaken(slug, clientId)` is true when another
  client's draft, submitted, or applied row uses that slug.
- [ ] **Step 3:** Save updates the open draft in place. Publish inserts
  a new `submitted` row and leaves the draft. Copy the virtual-card
  storage style. Use `insertFormSubmission` for the insert.

**Done when:** a unit or route-level check shows a second save does
not create a second draft, and a publish does not delete the applied
history.

---

### Task 4: GET and save

**Files:**

- Create: `src/app/api/clients/[id]/landing-page/route.ts`

- [ ] **Step 1:** Auth matches the virtual-card route (`admin_clients`).
  Refuse when `reporting_type` is not `DSCR`.
- [ ] **Step 2:** GET returns the prefilled draft, whether a submitted
  row locks the form, and the last applied publish.
- [ ] **Step 3:** POST `{ action: "save" }` validates enough to store
  (slug can be incomplete on a draft) and returns the saved draft.

**Done when:** save, then GET, returns the same fields. A non-DSCR
client receives a 400. No pull request is opened.

---

### Task 5: Publish

**Files:**

- Create: `src/lib/landing-page/github.ts`
- Modify: `src/app/api/clients/[id]/landing-page/route.ts`

- [ ] **Step 1:** `github.ts` uses `LANDING_GITHUB_TOKEN` and
  `LANDING_DSCR_GITHUB_REPO`. It can read `clients/{slug}.yaml`,
  open branch `landing/{slug}` from `main`, commit only the YAML and
  the headshot path, and open a pull request.
- [ ] **Step 2:** POST `{ action: "publish" }` runs full validation,
  `slugTaken`, and the repo file check. Download `headshot_url` when
  set. Open the pull request. Insert `submitted` with `pr_url`,
  `pr_number`, and `head_sha`.
- [ ] **Step 3:** If a `submitted` row exists, publish returns 409.
  The form stays read-only.

**Done when:** a publish from a test client opens a pull request whose
diff is only `clients/{slug}.yaml` and, when a headshot exists, one
image file. The row is `submitted`. URLs on `clients` are unchanged.

Use a fake slug. Close that pull request without merging when the
test is finished, or merge it only in Task 7.

---

### Task 6: Webhook and liveness

**Files:**

- Create: `src/app/api/webhooks/github/landing-page/route.ts`
- Modify: the landing-page route for `{ action: "check" }`

- [ ] **Step 1:** Verify `X-Hub-Signature-256` with
  `LANDING_GITHUB_WEBHOOK_SECRET` against the raw body.
  Reject a bad signature with 401. Answer a `ping` with 200.
- [ ] **Step 2:** On `pull_request` closed and merged, find the
  `submitted` row by `publish.pr_number`. HEAD
  `https://dscrexperts.com/{slug}/`. On 200, set `applied` and write
  `landing_page_url` and `thank_you_page_url`. Otherwise stay
  `submitted`, set `publish.merged = true` and `publish.error`.
- [ ] **Step 3:** On closed and not merged, set `dismissed`.
  Do not change the live URLs.
- [ ] **Step 4:** POST `{ action: "check" }` repeats the HEAD for a
  submitted, merged row and applies the same write.

**Done when:** redelivering webhook `693836837`'s ping returns 200
from production, and a closed-unmerged test pull request moves its
row to `dismissed`.

Deploy this route before expecting the ping to succeed.
Railway must have the webhook secret first.

---

### Task 7: Form on Client File

**Files:**

- Create: `src/components/landing-page/LandingPageForm.tsx`
- Modify: `src/components/ClientFile.tsx`

- [ ] **Step 1:** Lazy-load the form. One button, label **Landing**,
  visible only when `reporting_type` is DSCR. No Roster action.
- [ ] **Step 2:** Fields match the page contract. Template is a select
  of the three themes. Accent shows for `theme-custom` and
  `theme-light`, and is required for custom. Company NMLS, quiz URL,
  and SMS status are editable. Phone is prefilled and editable.
  Search indexing defaults to hidden on the first publish.
- [ ] **Step 3:** Save, publish, and check call the route.
  A submitted row disables editing and shows the pull request link
  plus the check action after merge.
- [ ] **Step 4:** Browser pass on a DSCR client: open the form, save,
  reload, see the draft. Confirm an RM or call-center client has no
  Landing button.

**Done when:** the draft survives a reload, and the button is absent
on a non-DSCR client.

---

### Task 8: One fake client, end to end

- [ ] **Step 1:** Publish a fake slug from Client File.
  Confirm the Vercel preview build passes `compliance-check`.
- [ ] **Step 2:** Merge the pull request.
  Confirm the webhook leaves the row `submitted` until the page
  responds, then `applied`, with both URLs on the client.
- [ ] **Step 3:** Publish again with a different phone.
  Confirm a new pull request and that the first applied row remains.
- [ ] **Step 4:** Delete the fake `clients/{slug}.yaml` and headshot
  in a follow-up commit so the demo stays out of production.
  Dismiss or leave the test rows. Do not point a real client at the
  fake URL.

**Done when:** the live URL served the fake page after merge, the
second publish did not edit theme HTML, and the fake YAML is removed.

---

## Out of this plan

- Reverse-mortgage factory
- Team Westside edits
- A history screen
- Auto-merge
- Setting the quiz tool's completion URL
- Deciding whose CRM the phone belongs to
