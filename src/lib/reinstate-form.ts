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
