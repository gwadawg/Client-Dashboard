# Client Backend Conversions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show proposal / submission / funded KPIs and the Reverse
Conversions & ROI page on every fulfillment offer, and make unique-lead
counts click through to Explorer → Conversions.

**Architecture:** Reuse `events` and `calculateMetrics`. Put URL, ROI-sub
alias, cost-visibility, and funnel-rollup matching in one helper module.
Explorer → Conversions is Lead Profiles with `?conv=`. KPI `sub=roi`
opens ROI; `sub=conversions` on the KPI tab stays an alias.

**Tech Stack:** Next.js App Router, React 19, node:test via `tsx`,
existing Client Workspace URL params (`tab`, `sub`, `conv`).

**Spec:** `docs/superpowers/specs/2026-08-18-client-backend-conversions-design.md`

## Global Constraints

- No new tables. No first-class `loan_size` / `commission` columns.
- No identity merge of synthetic `ldr:` ids with later GHL ids.
- Do not change loan-log write rules or `events_conversion_unique`.
- Do not change KPI formulas. Funnel rollup stays: funded ⇒ submitted ⇒
  proposed.
- Clickable cards are Proposals Made, Submissions, Unique Funded
  Borrowers only. Funded Transactions, Loan Volume, and cost cards are
  not links.
- Hide cost-per-stage, ROAS, and spend what-if when `ad_spend` is 0.
  Unique-lead counts and step rates still show. Loan Volume still shows.
- Explorer Conversions permission is `data_explorer`. Without it, hide
  the tab and do not make KPI counts clickable.
- Tests run with `npx --yes tsx --test <files>`. This repo has no
  component test runner — UI wiring is verified by helper tests plus a
  manual checklist at the end.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/conversion-explorer.ts` | Stage type, rollup match, ROI sub alias, cost visibility, explorer nav payload |
| `src/lib/conversion-explorer.test.ts` | Unit tests for the helpers |
| `src/lib/nav.ts` | Add `conversions` Explorer tab |
| `src/app/api/raw/leads/route.ts` | When `conversion_event` is set, list unique leads who reached that stage **or beyond** in range (not only leads created in range) |
| `src/components/LeadProfilesTable.tsx` | Empty copy for a stage with zero rows; `conversionsTab` hint text |
| `src/components/kpi/KpiCard.tsx` | Optional `onActivate` overlay so a card can open Explorer without nesting `<button>` around MetricInfoTip |
| `src/components/client-workspace/ClientKpiPanel.tsx` | Conversions block + ROI button on all offers; hide costs when spend is 0; count cards call `onOpenConversionLeads` |
| `src/components/ClientConversionsView.tsx` | Hide spend math when spend is 0 |
| `src/components/client-workspace/ClientWorkspaceHub.tsx` | Explorer tab render; KPI ROI via `isKpiRoiSub`; pass explorer permission + click-through |
| `src/components/DashboardView.tsx` | Navigate to explorer+conv; ROI actuals link uses `sub=roi` |
| `docs/KPIS.md` | Conversions are all offers; cost/ROAS hide when spend is 0 |
| `package.json` | Register the new test file |

---

### Task 1: Conversion explorer helpers

**Files:**

- Create: `src/lib/conversion-explorer.ts`
- Test: `src/lib/conversion-explorer.test.ts`
- Modify: `package.json` (add the test file to the `test` script)

**Interfaces:**

- Consumes: nothing
- Produces:
  - `ConversionStage = 'proposal_made' \| 'submission_made' \| 'loan_funded'`
  - `isConversionStage(value: string | null | undefined): value is ConversionStage`
  - `isKpiRoiSub(sub: string | null | undefined): boolean`
  - `matchesConversionRollup(flags, stage): boolean`
  - `profilesForConversionExplorer(profiles, conversionEvent): T[]`
  - `shouldShowConversionCosts(adSpend: number): boolean`
  - `conversionExplorerNav(stage): { view, tab, sub, conv }`

- [ ] **Step 1: Write the failing test**

Create `src/lib/conversion-explorer.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  conversionExplorerNav,
  isConversionStage,
  isKpiRoiSub,
  matchesConversionRollup,
  profilesForConversionExplorer,
  shouldShowConversionCosts,
} from './conversion-explorer';

const fundedOnly = {
  has_proposal_made: false,
  has_submission_made: false,
  has_loan_funded: true,
  has_lead_in_period: false,
};

const proposalOnly = {
  has_proposal_made: true,
  has_submission_made: false,
  has_loan_funded: false,
  has_lead_in_period: true,
};

describe('conversion-explorer', () => {
  it('treats roi and conversions as the KPI ROI sub', () => {
    assert.equal(isKpiRoiSub('roi'), true);
    assert.equal(isKpiRoiSub('conversions'), true);
    assert.equal(isKpiRoiSub('leads'), false);
    assert.equal(isKpiRoiSub(null), false);
  });

  it('accepts only the three canonical conv values', () => {
    assert.equal(isConversionStage('proposal_made'), true);
    assert.equal(isConversionStage('loan_funded'), true);
    assert.equal(isConversionStage('lead'), false);
    assert.equal(isConversionStage(''), false);
  });

  it('rolls later stages into earlier filters', () => {
    assert.equal(matchesConversionRollup(fundedOnly, 'proposal_made'), true);
    assert.equal(matchesConversionRollup(fundedOnly, 'submission_made'), true);
    assert.equal(matchesConversionRollup(fundedOnly, 'loan_funded'), true);
    assert.equal(matchesConversionRollup(proposalOnly, 'submission_made'), false);
    assert.equal(matchesConversionRollup(proposalOnly, 'loan_funded'), false);
  });

  it('lists conversion-in-range contacts even without a lead event in range', () => {
    const rows = profilesForConversionExplorer(
      [fundedOnly, proposalOnly],
      'loan_funded',
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0], fundedOnly);
  });

  it('keeps lead-in-period only when no conversion filter is set', () => {
    const rows = profilesForConversionExplorer(
      [fundedOnly, proposalOnly],
      null,
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0], proposalOnly);
  });

  it('hides cost cards when spend is 0', () => {
    assert.equal(shouldShowConversionCosts(0), false);
    assert.equal(shouldShowConversionCosts(12.5), true);
  });

  it('builds explorer nav for a KPI click', () => {
    assert.deepEqual(conversionExplorerNav('loan_funded'), {
      view: 'client_workspace',
      tab: 'explorer',
      sub: 'conversions',
      conv: 'loan_funded',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test src/lib/conversion-explorer.test.ts
```

Expected: FAIL with `Cannot find module './conversion-explorer'`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/conversion-explorer.ts`:

```ts
export const CONVERSION_STAGES = [
  'proposal_made',
  'submission_made',
  'loan_funded',
] as const;

export type ConversionStage = (typeof CONVERSION_STAGES)[number];

export type ConversionFlags = {
  has_proposal_made: boolean;
  has_submission_made: boolean;
  has_loan_funded: boolean;
};

export function isConversionStage(
  value: string | null | undefined,
): value is ConversionStage {
  return (
    value === 'proposal_made' ||
    value === 'submission_made' ||
    value === 'loan_funded'
  );
}

/** KPI tab only: `roi` is canonical; `conversions` remains a bookmark alias. */
export function isKpiRoiSub(sub: string | null | undefined): boolean {
  return sub === 'roi' || sub === 'conversions';
}

export function matchesConversionRollup(
  flags: ConversionFlags,
  stage: ConversionStage,
): boolean {
  if (stage === 'loan_funded') return flags.has_loan_funded;
  if (stage === 'submission_made') {
    return flags.has_submission_made || flags.has_loan_funded;
  }
  return (
    flags.has_proposal_made ||
    flags.has_submission_made ||
    flags.has_loan_funded
  );
}

export function profilesForConversionExplorer<
  T extends ConversionFlags & { has_lead_in_period: boolean },
>(profiles: T[], conversionEvent: string | null | undefined): T[] {
  if (!isConversionStage(conversionEvent)) {
    return profiles.filter(p => p.has_lead_in_period);
  }
  return profiles.filter(p => matchesConversionRollup(p, conversionEvent));
}

export function shouldShowConversionCosts(adSpend: number): boolean {
  return Number.isFinite(adSpend) && adSpend > 0;
}

export function conversionExplorerNav(stage: ConversionStage): {
  view: 'client_workspace';
  tab: 'explorer';
  sub: 'conversions';
  conv: ConversionStage;
} {
  return {
    view: 'client_workspace',
    tab: 'explorer',
    sub: 'conversions',
    conv: stage,
  };
}
```

In `package.json`, append `src/lib/conversion-explorer.test.ts` to the
`test` script file list (keep the other files).

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx --yes tsx --test src/lib/conversion-explorer.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/conversion-explorer.ts src/lib/conversion-explorer.test.ts package.json
git commit -m "$(cat <<'EOF'
Add conversion explorer helpers for funnel rollup and ROI URL aliases.

EOF
)"
```

---

### Task 2: Explorer Conversions tab in nav

**Files:**

- Modify: `src/lib/nav.ts`
- Test: `src/lib/conversion-explorer.test.ts` (append)

**Interfaces:**

- Consumes: none
- Produces: `DataExplorerTab` includes `"conversions"`;
  `DATA_EXPLORER_TABS` has `{ key: "conversions", label: "Conversions" }`
  immediately after Leads

- [ ] **Step 1: Write the failing test**

Append to `src/lib/conversion-explorer.test.ts`:

```ts
import { DATA_EXPLORER_TABS, resolveWorkspaceSubTab } from './nav';

describe('explorer conversions tab', () => {
  it('lists Conversions next to Leads', () => {
    assert.equal(DATA_EXPLORER_TABS[0].key, 'leads');
    assert.equal(DATA_EXPLORER_TABS[1].key, 'conversions');
    assert.equal(DATA_EXPLORER_TABS[1].label, 'Conversions');
  });

  it('resolves explorer sub=conversions instead of falling back to leads', () => {
    assert.equal(resolveWorkspaceSubTab('explorer', 'conversions'), 'conversions');
    assert.equal(resolveWorkspaceSubTab('explorer', 'roi'), 'leads');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx --yes tsx --test src/lib/conversion-explorer.test.ts
```

Expected: FAIL (`DATA_EXPLORER_TABS[1].key` is `'dials'`, not
`'conversions'`)

- [ ] **Step 3: Write minimal implementation**

In `src/lib/nav.ts`:

1. Change the `DataExplorerTab` union to:

```ts
export type DataExplorerTab =
  | "leads"
  | "conversions"
  | "dials"
  | "appointments"
  | "speed_to_lead"
  | "meta_ads";
```

2. Change `DATA_EXPLORER_TABS` to:

```ts
export const DATA_EXPLORER_TABS: HubTabDef<DataExplorerTab>[] = [
  { key: "leads", label: "Leads" },
  { key: "conversions", label: "Conversions" },
  { key: "dials", label: "Dials" },
  { key: "appointments", label: "Appointments" },
  { key: "speed_to_lead", label: "Speed to Lead" },
  { key: "meta_ads", label: "Meta Ads" },
];
```

3. Update the comment above `CLIENT_WORKSPACE_SUBTABS` from
   “`kpis` uses `sub=conversions` for the RM drill-in” to:

```ts
 * `kpis` uses `sub=roi` for Conversions & ROI (`sub=conversions` is still
 * accepted as an alias). Explorer uses `sub=conversions` for the lead list.
```

Do not add `conversions` to `LEGACY_VIEW_REDIRECTS`. KPI vs Explorer
share `sub` by tab, which Task 6/7 handle.

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx --yes tsx --test src/lib/conversion-explorer.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts src/lib/conversion-explorer.test.ts
git commit -m "$(cat <<'EOF'
Add Explorer Conversions as a Client Workspace sub-tab.

EOF
)"
```

---

### Task 3: Lead list matches KPI rollup

**Files:**

- Modify: `src/app/api/raw/leads/route.ts`

**Interfaces:**

- Consumes: `isConversionStage`, `profilesForConversionExplorer` from
  `src/lib/conversion-explorer.ts`
- Produces: `GET /api/raw/leads?conversion_event=proposal_made` returns
  unique contacts who reached proposal **or beyond** in the date window,
  including contacts with no `lead` event in that window

- [ ] **Step 1: Confirm the current gap with a helper test already
  passing**

Task 1 already covers `profilesForConversionExplorer`. This task only
wires the route. If you skip Task 1, stop and do it first.

- [ ] **Step 2: Use the helper in the route**

At the top of `src/app/api/raw/leads/route.ts` add:

```ts
import { profilesForConversionExplorer } from '@/lib/conversion-explorer';
```

Replace the block that currently does:

```ts
  const leadProfiles = Array.from(profiles.values()).filter((p) => p.has_lead_in_period);
  // ...
  let sortedLeads = leadProfiles.sort(...);
  if (conversion_event === 'proposal_made') {
    sortedLeads = sortedLeads.filter((p) => p.has_proposal_made);
  } else if (conversion_event === 'submission_made') {
    sortedLeads = sortedLeads.filter((p) => p.has_submission_made);
  } else if (conversion_event === 'loan_funded') {
    sortedLeads = sortedLeads.filter((p) => p.has_loan_funded);
  }
```

with:

```ts
  const allProfiles = Array.from(profiles.values());
  const leadProfiles = allProfiles.filter((p) => p.has_lead_in_period);
  const conversionRows = profilesForConversionExplorer(
    allProfiles,
    conversion_event,
  );
  // ... keep unmappedContacts derived from orphanCandidates as today ...

  let sortedLeads = conversionRows.sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
```

Keep `mappingSummary.leads_in_period` as `leadProfiles.length` (Total
Leads grain). The conversion-filtered `total` is `sortedLeads.length`.

Leave the unmapped `view` path unchanged. It must not use the
conversion helper.

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors in `src/app/api/raw/leads/route.ts`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/raw/leads/route.ts
git commit -m "$(cat <<'EOF'
Filter Explorer conversion leads by funnel rollup, not lead-created date.

EOF
)"
```

---

### Task 4: Explorer panel + empty copy

**Files:**

- Modify: `src/components/client-workspace/ClientWorkspaceHub.tsx`
- Modify: `src/components/LeadProfilesTable.tsx`

**Interfaces:**

- Consumes: `DataExplorerTab` now includes `"conversions"`
- Produces: Explorer → Conversions renders `LeadProfilesTable`; empty
  stage copy is “No leads reached this stage in this range”

- [ ] **Step 1: Point Explorer conversions at Lead Profiles**

In `ClientWorkspaceHub.tsx`, `ExplorerPanel` currently returns
`LeadProfilesTable` only for `tab === "leads"`. Change it to:

```ts
function ExplorerPanel({ tab, filters }: { tab: DataExplorerTab; filters: DashboardFilters }) {
  const scope = {
    clientId: filters.singleClientId,
    liveOnly: filters.liveOnly,
    startDate: filters.dateStart,
    endDate: filters.dateEnd,
  };

  if (tab === "leads" || tab === "conversions") {
    return <LeadProfilesTable {...scope} conversionsTab={tab === "conversions"} />;
  }
  if (tab === "appointments") return <AppointmentsTable {...scope} />;
  return <RawDataTable key={tab} type={tab === "meta_ads" ? "meta_ad_insights" : tab} {...scope} />;
}
```

`RawDataTable` `type` does not include `"conversions"` — the early
return above is required so conversions never fall through.

- [ ] **Step 2: Add `conversionsTab` + empty copy on Lead Profiles**

In `LeadProfilesTable.tsx`:

1. Extend props:

```ts
type Props = {
  clientId: string;
  liveOnly: boolean;
  startDate: string;
  endDate: string;
  conversionsTab?: boolean;
};
```

2. Replace the empty-row message:

```ts
{isUnmappedView
  ? "No unmapped activity in this range"
  : conversionFilter
    ? "No leads reached this stage in this range"
    : "No leads in this range"}
```

3. When `conversionsTab` is true, replace the helper paragraph under
   the toolbar with:

```ts
"Unique leads who reached this conversion stage in the selected date range (same rollup as the KPI cards: funded counts as submitted and proposed). Search by name, phone, or email still ignores the date range. Expand a row for the full event timeline."
```

Leave the stage `<select>` as-is (`conv` URL param). A KPI click never
lands on All because Task 7 always sets `conv`.

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: no errors in the two modified files. `RawDataTable` `type`
must not receive `"conversions"`.

- [ ] **Step 4: Commit**

```bash
git add src/components/client-workspace/ClientWorkspaceHub.tsx src/components/LeadProfilesTable.tsx
git commit -m "$(cat <<'EOF'
Render Explorer Conversions as Lead Profiles with stage empty copy.

EOF
)"
```

---

### Task 5: KPI cards on every offer + click-through hook

**Files:**

- Modify: `src/components/kpi/KpiCard.tsx`
- Modify: `src/components/client-workspace/ClientKpiPanel.tsx`

**Interfaces:**

- Consumes: `ConversionStage`, `shouldShowConversionCosts`,
  `conversionExplorerNav` (nav applied in Task 7; panel only calls
  `onOpenConversionLeads(stage)`)
- Produces:
  - `KpiCard` optional `onActivate?: () => void`
  - `ClientKpiPanel` props `canOpenExplorer: boolean` and
    `onOpenConversionLeads: (stage: ConversionStage) => void`
  - Conversion block + ROI button render for Call Center as well as
    Reverse/DSCR
  - Cost-per-* and ROAS omit when `shouldShowConversionCosts(ad_spend)`
    is false

- [ ] **Step 1: Add `onActivate` to KpiCard without nesting buttons**

`MetricInfoTip` already renders a `<button>`. Do not wrap the card in
`<button>`. Add an overlay control.

In `src/components/kpi/KpiCard.tsx` add to `Props`:

```ts
  /** Opens a drill-in (Explorer). Ignored when undefined. */
  onActivate?: () => void;
```

Destructure `onActivate` in the component.

On the outer `div`, add `className` `relative` (it already has
`relative`).

Immediately inside the outer `div`, after the accent bar, when
`onActivate` is set:

```tsx
{onActivate && (
  <button
    type="button"
    onClick={onActivate}
    aria-label={`View ${label} leads`}
    className="absolute inset-0 z-[1] rounded-lg"
  />
)}
```

On the existing inner content wrapper, add `className` `relative z-[2]
pointer-events-none` when `onActivate` is set, **except** MetricInfoTip
must stay clickable. Wrap only `MetricInfoTip` with
`className="pointer-events-auto relative z-[3]"`.

If MetricInfoTip is rendered as:

```tsx
{hint ? <MetricInfoTip hint={hint} /> : null}
```

change it to:

```tsx
{hint ? (
  <span className={onActivate ? "pointer-events-auto relative z-[3]" : undefined}>
    <MetricInfoTip hint={hint} />
  </span>
) : null}
```

and on the inner flex column add
`onActivate ? "pointer-events-none" : ""` so the overlay receives the
card click.

- [ ] **Step 2: Ungate the conversion block and wire clicks**

In `ClientKpiPanel.tsx`:

1. Import:

```ts
import {
  shouldShowConversionCosts,
  type ConversionStage,
} from "@/lib/conversion-explorer";
```

2. Extend `Props`:

```ts
  canOpenExplorer: boolean;
  onOpenConversionLeads: (stage: ConversionStage) => void;
```

3. Remove `usesRmKpiLayout(reportingType)` from:
   - `const conversions = showConversions && usesRmKpiLayout(...)`
     → `const conversions = showConversions;`
   - the Conversions & ROI button wrapper
   - the Conversions `KpiSection` wrapper

   Keep `usesRmKpiLayout` on **Cost Trends** only (Call Center still has
   no ad-cost charts).

4. Inside the Conversions `KpiSection`, compute:

```ts
const showCosts = shouldShowConversionCosts(metrics.ad_spend);
const openStage = canOpenExplorer
  ? (stage: ConversionStage) => onOpenConversionLeads(stage)
  : undefined;
```

5. Pass `onActivate` only on the three unique-lead cards:

```tsx
<KpiCard
  label="Proposals Made"
  value={formatKpiValue(metrics.proposals_made, "int")}
  hint="Unique leads that reached the proposal stage or beyond (submitted/funded count too)."
  onActivate={openStage ? () => openStage("proposal_made") : undefined}
/>
<KpiCard
  label="Submissions"
  value={formatKpiValue(metrics.submissions_made, "int")}
  hint="Unique borrowers that reached the submission stage or beyond."
  onActivate={openStage ? () => openStage("submission_made") : undefined}
/>
```

On Unique Funded Borrowers:

```tsx
onActivate={openStage ? () => openStage("loan_funded") : undefined}
```

Do **not** pass `onActivate` on Funded Transactions, Loan Volume, or
cost cards.

6. Wrap the three cost cards and ROAS in `showCosts && (...)`. Keep
   Loan Volume visible even when spend is 0.

7. Place the Conversions `KpiSection` **after** Appointment Breakdown
   and **before** Rate Trends, same as today. Call Center then sees it
   under its appointment/calling `KpiSections`.

Temporary compile: Hub does not pass the new props yet. Add them in
this same task on `ClientWorkspaceHub` as:

```ts
canOpenExplorer={false}
onOpenConversionLeads={() => {}}
```

Task 7 replaces the stubs. If you prefer not to stub, do Task 7 in the
same sitting before `tsc`.

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS after hub props exist (Task 7) or with the stubs above.

- [ ] **Step 4: Commit**

```bash
git add src/components/kpi/KpiCard.tsx src/components/client-workspace/ClientKpiPanel.tsx src/components/client-workspace/ClientWorkspaceHub.tsx
git commit -m "$(cat <<'EOF'
Show conversion KPIs on every offer and make unique-lead counts clickable.

EOF
)"
```

---

### Task 6: ROI page for every offer, hide spend math

**Files:**

- Modify: `src/components/ClientConversionsView.tsx`
- Modify: `src/components/client-workspace/ClientWorkspaceHub.tsx`

**Interfaces:**

- Consumes: `isKpiRoiSub`, `shouldShowConversionCosts`
- Produces: KPI `sub=roi` or `sub=conversions` opens ROI on any offer;
  money / what-if hide when spend is 0; rates stay

- [ ] **Step 1: Hide spend math in ClientConversionsView**

Import `shouldShowConversionCosts`.

After `const hasCommission = ...` add:

```ts
const showCosts = shouldShowConversionCosts(metrics.ad_spend);
```

In the “Pipeline outcomes” grid:

- Keep Proposals Made, Submissions, Funded Transactions, Unique Funded
  Borrowers, Loan Volume.
- Render Total Spend, Cost per Funded Transaction, Cost per Funded
  Borrower, ROAS, and Est. Commission Rev. only when `showCosts` is
  true.

Wrap the “Stage costs” card (the right column under Funnel) in
`showCosts && (...)`. When `showCosts` is false, Funnel is just
`ConversionFunnel` full width (`lg:grid-cols-1` or skip the grid).

Wrap the entire “What-if scenario” `KpiSection` in `showCosts && (...)`.

Keep “Conversion rates” and “Revenue inputs” visible (rates are not
cost; commission input is optional ROAS later).

When `showCosts` is false, change the header subtitle so it does not
mention the scenario planner. Use:

```ts
{clientLabel
  ? `Pipeline outcomes for ${clientLabel} in the selected date range.`
  : "Pipeline outcomes for the selected client and date range."}
{showCosts
  ? " Use the scenario planner to estimate revenue if spend or close rates improve."
  : ""}
```

- [ ] **Step 2: Open ROI from `sub=roi` (alias `conversions`) on all
  offers**

In `ClientWorkspaceHub.tsx` import `isKpiRoiSub`.

Change:

```ts
showConversions={sub === "conversions"}
onOpenConversions={() => onSubChange("conversions")}
```

to:

```ts
showConversions={isKpiRoiSub(sub)}
onOpenConversions={() => onSubChange("roi")}
```

`onCloseConversions` stays `onSubChange(null)`.

Because this block only renders when `activeTab === "kpis"`, Explorer
`sub=conversions` never hits `showConversions`.

- [ ] **Step 3: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/components/ClientConversionsView.tsx src/components/client-workspace/ClientWorkspaceHub.tsx
git commit -m "$(cat <<'EOF'
Open Conversions & ROI for every offer and hide spend math at $0.

EOF
)"
```

---

### Task 7: Dashboard URL navigation

**Files:**

- Modify: `src/components/DashboardView.tsx`
- Modify: `src/components/client-workspace/ClientWorkspaceHub.tsx`

**Interfaces:**

- Consumes: `conversionExplorerNav`, `ConversionStage`
- Produces: KPI count click sets
  `view=client_workspace&tab=explorer&sub=conversions&conv=<stage>`
  without dropping client/date params. Funnel Simulator “actuals” uses
  `sub=roi`.

- [ ] **Step 1: Add `goToConversionLeads`**

In `DashboardView.tsx` import:

```ts
import {
  conversionExplorerNav,
  type ConversionStage,
} from "@/lib/conversion-explorer";
```

Next to `goToConversionsActuals`, add:

```ts
  const goToConversionLeads = useCallback((stage: ConversionStage) => {
    const nav = conversionExplorerNav(stage);
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", nav.view);
    params.set("tab", nav.tab);
    params.set("sub", nav.sub);
    params.set("conv", nav.conv);
    params.delete("sim");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setView(nav.view);
    setHubTab(nav.tab);
    setWorkspaceSub(nav.sub);
    setSidebarOpen(false);
  }, [searchParams, pathname, router]);
```

Do **not** use `setHubTabAndUrl` — it deletes `sub`.

- [ ] **Step 2: Point ROI actuals at `sub=roi`**

In `goToConversionsActuals`, change `params.set("sub", "conversions")`
and `setWorkspaceSub("conversions")` to `"roi"`. Keep
`tab=kpis`. Old bookmarks with `sub=conversions` still work via
`isKpiRoiSub`.

- [ ] **Step 3: Pass click-through + explorer permission into the hub**

`allowedWorkspaceTabs` already filters by
`CLIENT_WORKSPACE_TAB_PERMISSIONS.explorer === "data_explorer"`.

On `ClientWorkspaceHub`:

```ts
canOpenExplorer={allowedWorkspaceTabs.includes("explorer")}
onOpenConversionLeads={goToConversionLeads}
```

Remove the Task 5 stubs.

Add to hub `Props`:

```ts
  canOpenExplorer: boolean;
  onOpenConversionLeads: (stage: ConversionStage) => void;
```

and pass them into `ClientKpiPanel`.

- [ ] **Step 4: Typecheck**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/DashboardView.tsx src/components/client-workspace/ClientWorkspaceHub.tsx
git commit -m "$(cat <<'EOF'
Jump conversion KPI counts to Explorer and canonicalize ROI as sub=roi.

EOF
)"
```

---

### Task 8: KPI docs + full test run

**Files:**

- Modify: `docs/KPIS.md`

**Interfaces:**

- Consumes: behavior from Tasks 1–7
- Produces: docs that match the shipped UI

- [ ] **Step 1: Update layout copy in `docs/KPIS.md`**

In “### RM dashboard layout (login → Dashboard)”, rename the heading
to “### Client Workspace KPI layout” and change item 5 plus the HE
paragraph to:

```markdown
5. **Conversions** — Proposals Made, Submissions, Unique Funded
   Borrowers (and funded-transaction / loan-volume cards). Shown for
   Reverse, DSCR, and Call Center. Cost per stage and ROAS omit when
   ad spend in range is $0. Unique-lead count cards open Explorer →
   Conversions filtered to that stage.

HE / Call Center clients keep the appointment + calling stats grid
and also get the Conversions block. Booking Rate on the HE overview
still uses Total Leads as the denominator.
```

Leave formula rows in the primary KPI table unchanged.

- [ ] **Step 2: Run the registered unit tests**

Run:

```bash
npm test
```

Expected: PASS, including `conversion-explorer.test.ts`

- [ ] **Step 3: Manual checklist (browser)**

Log in as a user who has both `dashboard` and `data_explorer`.

1. Reverse client with spend: Conversions block + ROI button. Click
   Unique Funded Borrowers → URL has `tab=explorer`, `sub=conversions`,
   `conv=loan_funded`. List is those leads.
2. Same client, ROI button → `tab=kpis&sub=roi`. Back returns to grid.
3. Open `?tab=kpis&sub=conversions` → still ROI.
4. DSCR client: same cards + ROI.
5. Call Center client with $0 spend: unique-lead counts visible; cost
   cards and ROAS hidden; ROI rates visible; what-if hidden.
6. User without Explorer permission: counts are not clickable;
   Conversions Explorer tab is absent (workspace `allowedTabs`).

- [ ] **Step 4: Commit**

```bash
git add docs/KPIS.md
git commit -m "$(cat <<'EOF'
Document conversion KPIs for every Client Workspace offer.

EOF
)"
```

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Same `events` / no new table | Global constraint |
| Conversion cards on RM / DSCR / Call Center | 5 |
| Hide cost/ROAS when spend is 0 | 1, 5, 6 |
| Keep Loan Volume at $0 spend | 5 |
| Conversions & ROI on all offers | 6 |
| Hide what-if spend math at $0 | 6 |
| Explorer → Conversions tab | 2, 4 |
| Stage filter = KPI rollup | 1, 3 |
| Include conversion-in-range without lead-in-range | 1, 3 |
| Count-card click → explorer+conv | 5, 7 |
| `sub=roi` canonical, `sub=conversions` alias on KPIs | 1, 6, 7 |
| Explorer `sub=conversions` is the lead list | 2, 4, 6 |
| `data_explorer` gates tab + click | 5, 7 |
| Empty stage copy | 4 |
| `docs/KPIS.md` | 8 |
| No identity merge / no unique-index change | omitted on purpose |
