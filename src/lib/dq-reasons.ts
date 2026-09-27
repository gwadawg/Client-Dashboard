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

/** Loan-officer form writes `raw.source = client_log_form` on `manual_dq`. */
export function isClientLogFormRaw(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  return (raw as { source?: unknown }).source === 'client_log_form';
}

/** Slugs stored on `events.raw.dq_reasons` for a manual DQ. */
export function parseDqReasonSlugs(raw: unknown): DqReasonSlug[] {
  if (!raw || typeof raw !== 'object') return [];
  const reasons = (raw as { dq_reasons?: unknown }).dq_reasons;
  if (!Array.isArray(reasons)) return [];
  const out: DqReasonSlug[] = [];
  const seen = new Set<string>();
  for (const item of reasons) {
    if (typeof item !== 'string') continue;
    const slug = item.trim().toLowerCase();
    if (!isDqReasonSlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    out.push(slug);
  }
  return out;
}
