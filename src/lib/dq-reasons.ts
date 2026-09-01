export const DQ_REASONS = [
  { slug: 'ltv', label: 'LTV' },
  { slug: 'fico', label: 'FICO' },
  { slug: 'low_property_value', label: 'Low Property Value' },
  { slug: 'seasoning', label: 'Seasoning' },
  { slug: 'low_income', label: 'Low Income' },
  { slug: 'other', label: 'Other' },
] as const;

export type DqReasonSlug = (typeof DQ_REASONS)[number]['slug'];

const SLUG_SET = new Set<string>(DQ_REASONS.map(r => r.slug));

const LABEL_BY_SLUG = new Map<string, string>(DQ_REASONS.map(r => [r.slug, r.label]));

export function dqReasonLabel(slug: string): string {
  return LABEL_BY_SLUG.get(slug) ?? slug;
}

export function isDqReasonSlug(value: string): value is DqReasonSlug {
  return SLUG_SET.has(value);
}
