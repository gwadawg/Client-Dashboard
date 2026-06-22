/** Canonical acquisition lead sources (editable on leads / appointments). */

export type AcquisitionLeadSource = 'organic' | 'Meta' | 'Referral' | 'Cold' | 'Unknown';

export const ACQUISITION_LEAD_SOURCES: { value: AcquisitionLeadSource; label: string }[] = [
  { value: 'organic', label: 'Organic' },
  { value: 'Meta', label: 'Meta' },
  { value: 'Referral', label: 'Referral' },
  { value: 'Cold', label: 'Cold' },
  { value: 'Unknown', label: 'Unknown' },
];

const SOURCE_SET = new Set<string>(ACQUISITION_LEAD_SOURCES.map((s) => s.value));

export function isAcquisitionLeadSource(value: string | null | undefined): value is AcquisitionLeadSource {
  return !!value && SOURCE_SET.has(value);
}

/** Map legacy sheet / GHL / webhook values onto the four canonical sources. */
export function normalizeAcquisitionLeadSource(raw: string | null | undefined): AcquisitionLeadSource | null {
  if (!raw?.trim()) return null;
  const s = raw.trim().toLowerCase();

  if (s === 'meta' || s === 'facebook' || s === 'fb' || s === 'ig' || s === 'instagram') return 'Meta';
  if (s.includes('meta') || s.includes('facebook')) return 'Meta';

  if (s === 'referral' || s.includes('refer')) return 'Referral';

  if (s === 'cold' || s.includes('cold call') || s === 'cold_call') return 'Cold';

  if (s === 'organic' || s === 'funnel' || s.includes('organic') || s.includes('website')) return 'organic';

  if (s === 'unknown') return 'Unknown';

  if (isAcquisitionLeadSource(raw.trim())) return raw.trim() as AcquisitionLeadSource;

  return null;
}

export function acquisitionLeadSourceLabel(source: string | null | undefined): string {
  if (!source) return 'Unset';
  const match = ACQUISITION_LEAD_SOURCES.find((s) => s.value === source);
  return match?.label ?? source;
}

/** Resolve canonical lead source from DB value or GHL custom field text. */
export function resolveAcquisitionLeadSource(
  dbSource: string | null | undefined,
  ghlSource: string | null | undefined,
): AcquisitionLeadSource | null {
  return normalizeAcquisitionLeadSource(dbSource) ?? normalizeAcquisitionLeadSource(ghlSource);
}

export type LeadSourceUpdatePayload = {
  source: AcquisitionLeadSource | null;
  raw: Record<string, unknown>;
};

/** Build lead row patch when a form submits an optional lead source selection. */
export function leadSourceUpdateFromFormInput(
  existingRaw: unknown,
  submitted: string | null | undefined,
): LeadSourceUpdatePayload | null {
  if (submitted == null || submitted === '') return null;

  const source = isAcquisitionLeadSource(submitted)
    ? submitted
    : normalizeAcquisitionLeadSource(submitted);
  if (!source) return null;

  const raw =
    existingRaw && typeof existingRaw === 'object' && !Array.isArray(existingRaw)
      ? { ...(existingRaw as Record<string, unknown>) }
      : {};

  return {
    source,
    raw: {
      ...raw,
      lead_source_manual: source,
      lead_source_updated_at: new Date().toISOString(),
      lead_source_updated_via: 'closer_form',
    },
  };
}
