// Shared dial / sales-call examples library (call-center + B2B).

export const DIAL_EXAMPLE_DOMAINS = ['call_center', 'b2b'] as const;
export type DialExampleDomain = (typeof DIAL_EXAMPLE_DOMAINS)[number];

export const DIAL_EXAMPLE_SOURCES = ['events', 'acquisition_dials', 'acquisition_calls'] as const;
export type DialExampleSource = (typeof DIAL_EXAMPLE_SOURCES)[number];

export const DIAL_EXAMPLE_LEAD_TYPES = ['RM', 'DSCR', 'HE'] as const;
export type DialExampleLeadType = (typeof DIAL_EXAMPLE_LEAD_TYPES)[number];

export const DIAL_EXAMPLE_LEAD_TYPE_OPTIONS: { value: DialExampleLeadType; label: string }[] = [
  { value: 'RM', label: 'RM — Reverse Mortgage' },
  { value: 'DSCR', label: 'DSCR' },
  { value: 'HE', label: 'HE — Home Equity / Call Center' },
];

export const DIAL_EXAMPLE_GRADES = ['A+', 'A', 'A-', 'B'] as const;
export type DialExampleGrade = (typeof DIAL_EXAMPLE_GRADES)[number];

export const DIAL_EXAMPLE_GRADE_OPTIONS: { value: DialExampleGrade; label: string }[] = [
  { value: 'A+', label: 'A+ — Exceptional' },
  { value: 'A', label: 'A — Excellent' },
  { value: 'A-', label: 'A- — Strong' },
  { value: 'B', label: 'B — Good example' },
];

export type DialExampleHighlight = {
  at_seconds: number;
  label: string;
  takeaway: string;
};

export type DialExampleRow = {
  id: string;
  domain: DialExampleDomain;
  source: DialExampleSource;
  source_id: string;
  title: string;
  recording_url: string;
  called_at: string;
  duration_seconds: number | null;
  agent_name: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_type: DialExampleLeadType | null;
  call_type: string | null;
  grade: DialExampleGrade | null;
  summary: string | null;
  transcript: string | null;
  highlights: DialExampleHighlight[];
  tags: string[];
  client_id: string | null;
  lead_id: string | null;
  created_at: string;
  updated_at: string;
};

export const DIAL_EXAMPLE_FIELDS =
  'id, domain, source, source_id, title, recording_url, called_at, duration_seconds, agent_name, lead_name, lead_phone, lead_type, call_type, grade, summary, transcript, highlights, tags, client_id, lead_id, created_at, updated_at, created_by, updated_by';

export function isValidDialExampleDomain(v: string | null | undefined): v is DialExampleDomain {
  return !!v && (DIAL_EXAMPLE_DOMAINS as readonly string[]).includes(v);
}

export function isValidDialExampleSource(v: string | null | undefined): v is DialExampleSource {
  return !!v && (DIAL_EXAMPLE_SOURCES as readonly string[]).includes(v);
}

export function isValidDialExampleLeadType(v: string | null | undefined): v is DialExampleLeadType {
  return !!v && (DIAL_EXAMPLE_LEAD_TYPES as readonly string[]).includes(v);
}

export function isValidDialExampleGrade(v: string | null | undefined): v is DialExampleGrade {
  return !!v && (DIAL_EXAMPLE_GRADES as readonly string[]).includes(v);
}

export function domainMatchesSource(domain: DialExampleDomain, source: DialExampleSource): boolean {
  if (domain === 'call_center') return source === 'events';
  return source === 'acquisition_dials' || source === 'acquisition_calls';
}

export function normalizeDialHighlights(raw: unknown): DialExampleHighlight[] {
  if (!Array.isArray(raw)) return [];
  const out: DialExampleHighlight[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const atSeconds = Number(rec.at_seconds);
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    const takeaway = typeof rec.takeaway === 'string' ? rec.takeaway.trim() : '';
    if (!Number.isFinite(atSeconds) || atSeconds < 0) continue;
    if (!label && !takeaway) continue;
    out.push({ at_seconds: Math.floor(atSeconds), label, takeaway });
  }
  return out.sort((a, b) => a.at_seconds - b.at_seconds);
}

export function cleanDialExampleTags(v: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(v)) raw = v.filter((t): t is string => typeof t === 'string');
  else if (typeof v === 'string') raw = v.split(',');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export function formatDialExampleSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

export function dialExampleDomainLabel(domain: DialExampleDomain): string {
  return domain === 'call_center' ? 'Call Reps' : 'B2B Sales';
}
