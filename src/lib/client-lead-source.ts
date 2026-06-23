/** How a client signed up with WM — stored on `clients.source`. */

export type ClientLeadSource = 'Cold' | 'Meta' | 'Referral';

export const CLIENT_LEAD_SOURCES: { value: ClientLeadSource; label: string }[] = [
  { value: 'Cold', label: 'Cold' },
  { value: 'Meta', label: 'Meta' },
  { value: 'Referral', label: 'Referral' },
];

const SOURCE_SET = new Set<string>(CLIENT_LEAD_SOURCES.map(s => s.value));

export function isClientLeadSource(value: string | null | undefined): value is ClientLeadSource {
  return !!value && SOURCE_SET.has(value);
}

/** Map legacy free-text values onto the three canonical client sources. */
export function normalizeClientLeadSource(raw: string | null | undefined): ClientLeadSource | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (isClientLeadSource(trimmed)) return trimmed;

  const s = trimmed.toLowerCase();
  if (s === 'meta' || s === 'facebook' || s === 'fb' || s.includes('meta') || s.includes('facebook')) {
    return 'Meta';
  }
  if (s === 'referral' || s.includes('refer')) return 'Referral';
  if (s === 'cold' || s.includes('cold call') || s === 'cold_call') return 'Cold';

  return null;
}

export function clientLeadSourceLabel(source: string | null | undefined): string {
  if (!source) return '—';
  const match = CLIENT_LEAD_SOURCES.find(s => s.value === source);
  return match?.label ?? source;
}
