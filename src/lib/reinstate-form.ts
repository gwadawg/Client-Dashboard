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

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Normalize stored cs_checklist onto the canonical CS keys. */
export function readCsChecklist(
  responses: Record<string, unknown> | null | undefined,
): Record<string, boolean> {
  const raw = responses?.cs_checklist;
  const current =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    CS_REINSTATE_CHECKLIST.map((item) => [item.key, current[item.key] === true]),
  );
}

/**
 * Merge a partial cs_checklist PATCH onto existing responses.
 * Returns null when `patch` is not a plain object.
 */
export function mergeCsChecklistPatch(
  responses: Record<string, unknown> | null | undefined,
  patch: unknown,
): Record<string, boolean> | null {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return null;
  const incoming = patch as Record<string, unknown>;
  const out = readCsChecklist(responses);
  let anyKnown = false;
  for (const item of CS_REINSTATE_CHECKLIST) {
    if (!(item.key in incoming)) continue;
    anyKnown = true;
    out[item.key] = incoming[item.key] === true;
  }
  return anyKnown ? out : null;
}

export function parseReinstateDraftFromBody(body: Record<string, unknown>): ReinstateFormDraft {
  const draft = emptyReinstateDraft();
  draft.client_id = optionalText(body.client_id);
  draft.engagement =
    body.engagement === 'same_file' || body.engagement === 'new_offer'
      ? body.engagement
      : draft.engagement;
  draft.offer = optionalText(body.offer);
  draft.reporting_type = optionalText(body.reporting_type);
  draft.sales_package = optionalText(body.sales_package);
  draft.mrr = optionalNumber(body.mrr);
  if (typeof body.closed_at === 'string') draft.closed_at = body.closed_at;
  draft.closer_name = optionalText(body.closer_name);
  draft.cash_collected = optionalNumber(body.cash_collected);
  draft.contract_term_months = optionalNumber(body.contract_term_months);
  draft.contract_end_date = optionalText(body.contract_end_date);
  draft.ghl_reuse =
    body.ghl_reuse === 'yes' || body.ghl_reuse === 'no' || body.ghl_reuse === 'unsure'
      ? body.ghl_reuse
      : draft.ghl_reuse;
  draft.leave_billing_paused = body.leave_billing_paused === true;
  draft.leave_ads_paused = body.leave_ads_paused === true;
  draft.internal_notes = optionalText(body.internal_notes);
  return draft;
}
