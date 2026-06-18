/** Closer form field options and reflection rules (non-closed deals only). */

export const LEAD_QUALITY_SCORES = ['A', 'B', 'C', 'D'] as const;
export type LeadQualityScore = (typeof LEAD_QUALITY_SCORES)[number];

export const LOW_LEAD_QUALITY_SCORES = new Set<LeadQualityScore>(['C', 'D']);

export const SURFACE_OBJECTIONS = [
  'Need to think about it',
  'Need to talk to spouse/partner',
  'Too expensive / budget',
  'Bad timing',
  'Already working with someone',
  'Not interested',
  'Want to do it themselves',
  'Need more proof / credibility',
  'Other',
] as const;

export const ROOT_CAUSE_OBJECTIONS = [
  'Not a fit / wrong ICP',
  'Price / ROI not clear',
  'Trust / burned before',
  'Timing / not urgent',
  'Decision maker not on call',
  'Competing priority',
  'Closer execution / call skill',
  'Setter mis-set expectations',
  'Offer mismatch (Bootcamp/downsell)',
  'Other',
] as const;

export type CloserReflectionFields = {
  offer_presented: boolean;
  closed_on_call?: boolean | null;
  call_rating?: number | null;
  improvement_notes?: string | null;
  lead_quality_score?: string | null;
  lead_quality_explanation?: string | null;
  surface_objection?: string | null;
  surface_objection_other?: string | null;
  root_cause_objection?: string | null;
  root_cause_objection_other?: string | null;
};

/** Reflection block applies when the deal did not close on this call. */
export function closerFormNeedsReflection(
  offerPresented: boolean,
  closedOnCall: boolean | null | undefined,
): boolean {
  if (!offerPresented) return true;
  return closedOnCall !== true;
}

export function validateCloserFormReflection(input: CloserReflectionFields): string | null {
  if (!closerFormNeedsReflection(input.offer_presented, input.closed_on_call)) {
    return null;
  }

  const rating = input.call_rating;
  if (rating == null || !Number.isFinite(rating) || rating < 1 || rating > 10) {
    return 'Call rating (1–10) is required for non-closed calls';
  }

  if (!input.improvement_notes?.trim()) {
    return 'One improvement for your next call is required';
  }

  const score = input.lead_quality_score?.trim();
  if (!score || !LEAD_QUALITY_SCORES.includes(score as LeadQualityScore)) {
    return 'Lead quality score is required';
  }

  if (
    LOW_LEAD_QUALITY_SCORES.has(score as LeadQualityScore) &&
    !input.lead_quality_explanation?.trim()
  ) {
    return 'Lead quality explanation is required for C or D leads';
  }

  const surface = input.surface_objection?.trim();
  if (!surface) return 'Surface objection is required';
  if (surface === 'Other' && !input.surface_objection_other?.trim()) {
    return 'Please describe the surface objection';
  }

  const root = input.root_cause_objection?.trim();
  if (!root) return 'Root cause objection is required';
  if (root === 'Other' && !input.root_cause_objection_other?.trim()) {
    return 'Please describe the root cause objection';
  }

  return null;
}

export function resolveObjectionLabel(
  value: string | null | undefined,
  other: string | null | undefined,
): string | null {
  if (!value?.trim()) return null;
  if (value === 'Other') return other?.trim() || 'Other';
  return value.trim();
}
