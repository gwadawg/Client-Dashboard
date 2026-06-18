/** Closer form field options and reflection rules (non-closed deals only). */

export const LEAD_QUALITY_SCORES = [
  '10',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
  '1',
] as const;
export type LeadQualityScore = (typeof LEAD_QUALITY_SCORES)[number];

/** Explanation required at or below this lead quality score. */
export const LOW_LEAD_QUALITY_THRESHOLD = 6;

export const SURFACE_OBJECTIONS = [
  'Need to think about it / not ready',
  'Need to talk to partner/compliance/broker',
  "I don't make decisions on the spot",
  'Too expensive / budget',
  'Due diligence',
  'Going to shop around',
  'Bad past experience with lead gen',
  'Already working with someone',
  'Not interested',
  'Other',
] as const;

export const ROOT_CAUSE_OBJECTIONS = [
  'Urgency',
  'Fear',
  'Trust',
  'Logistics',
  'Financial DQ',
  'Not a fit / wrong ICP',
  'Closer execution / call skill',
  'Setter mis-set expectations',
  'Offer mismatch (Bootcamp/downsell)',
  'Other',
] as const;

export const LEAD_QUALIFIED_LABELS = [
  'Qualified',
  'Financial DQ',
  'No',
  'Yes',
  'Other',
] as const;

/** Legacy sheet closer id → display name. */
export const CLOSER_SHEET_NAME_BY_ID: Record<string, string> = {
  '1': 'Pedro',
};

export function parseLeadQualified(raw: string | null | undefined): boolean | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'qualified' || s === 'yes') return true;
  return false;
}

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

function parseLeadQualityScore(value: string | null | undefined): number | null {
  if (!value?.trim()) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n);
  if (rounded < 1 || rounded > 10) return null;
  return rounded;
}

export function isLowLeadQualityScore(value: string | null | undefined): boolean {
  const n = parseLeadQualityScore(value);
  return n != null && n <= LOW_LEAD_QUALITY_THRESHOLD;
}

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
  if (!score || parseLeadQualityScore(score) == null) {
    return 'Lead quality score (1–10) is required';
  }

  if (isLowLeadQualityScore(score) && !input.lead_quality_explanation?.trim()) {
    return 'Lead quality explanation is required for scores 6 or below';
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

export function normalizeCloserSheetName(raw: string | null | undefined): string | null {
  const s = raw?.trim();
  if (!s) return null;
  return CLOSER_SHEET_NAME_BY_ID[s] ?? s;
}

export function normalizeLeadQualityScore(raw: string | number | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const letter = String(raw).trim().toUpperCase();
  const letterMap: Record<string, string> = { A: '9', B: '7', C: '5', D: '3' };
  if (letterMap[letter]) return letterMap[letter];
  const n = parseLeadQualityScore(String(raw));
  return n != null ? String(n) : null;
}

export function normalizeSurfaceObjection(raw: string | null | undefined): {
  value: string | null;
  other: string | null;
} {
  const s = raw?.trim();
  if (!s) return { value: null, other: null };

  const lower = s.toLowerCase();
  if (lower === 'think about it') return { value: 'Need to think about it / not ready', other: null };
  if (lower.includes('partner') || lower.includes('compliance') || lower.includes('broker') || lower.includes('spouse')) {
    return { value: 'Need to talk to partner/compliance/broker', other: null };
  }
  if (lower.includes("don't make decisions") || lower.includes('on the spot')) {
    return { value: "I don't make decisions on the spot", other: null };
  }
  if (lower.includes('too expensive') || lower === 'too expensive') {
    return { value: 'Too expensive / budget', other: null };
  }
  if (lower.includes('due diligence')) return { value: 'Due diligence', other: null };
  if (lower.includes('shop around')) return { value: 'Going to shop around', other: null };
  if (lower.includes('bad past') || lower.includes('lead gen')) {
    return { value: 'Bad past experience with lead gen', other: null };
  }

  const exact = SURFACE_OBJECTIONS.find((o) => o.toLowerCase() === lower);
  if (exact) return { value: exact, other: null };

  if (SURFACE_OBJECTIONS.includes(s as (typeof SURFACE_OBJECTIONS)[number])) {
    return { value: s, other: null };
  }

  return { value: 'Other', other: s };
}

export function normalizeRootCauseObjection(raw: string | null | undefined): {
  value: string | null;
  other: string | null;
} {
  const s = raw?.trim();
  if (!s) return { value: null, other: null };

  const parts = s.split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  const first = parts[0]?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    urgency: 'Urgency',
    fear: 'Fear',
    trust: 'Trust',
    logistics: 'Logistics',
    'financial dq': 'Financial DQ',
  };
  if (map[first]) {
    const extra = parts.slice(1).join(', ');
    return { value: map[first], other: extra || null };
  }

  const exact = ROOT_CAUSE_OBJECTIONS.find((o) => o.toLowerCase() === s.toLowerCase());
  if (exact) return { value: exact, other: null };

  if (ROOT_CAUSE_OBJECTIONS.includes(s as (typeof ROOT_CAUSE_OBJECTIONS)[number])) {
    return { value: s, other: null };
  }

  return { value: 'Other', other: s };
}

export function parseSheetYesNo(raw: string | null | undefined): boolean | null {
  const s = (raw ?? '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'yes' || s === 'y' || s === 'true') return true;
  if (s === 'no' || s === 'n' || s === 'false') return false;
  return null;
}

export function isRecordingUrl(raw: string | null | undefined): boolean {
  const s = raw?.trim();
  if (!s) return false;
  return /^https?:\/\//i.test(s);
}
