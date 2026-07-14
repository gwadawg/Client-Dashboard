// Team call library types shared by API + UI.

export const TEAM_CALL_TYPE_CODES = [
  'coaching',
  'team_meeting',
  'role_play',
  'training',
  '1on1',
  'sales_review',
  'other',
] as const;

export type TeamCallTypeCode = (typeof TEAM_CALL_TYPE_CODES)[number];

export const TEAM_CALL_TYPE_OPTIONS: { value: TeamCallTypeCode; label: string }[] = [
  { value: 'coaching', label: 'Coaching' },
  { value: 'team_meeting', label: 'Team Meeting' },
  { value: 'role_play', label: 'Role Play' },
  { value: 'training', label: 'Training' },
  { value: '1on1', label: '1:1' },
  { value: 'sales_review', label: 'Sales Review' },
  { value: 'other', label: 'Other' },
];

/** Product line for exemplar dials saved from Recordings. */
export const TEAM_CALL_LEAD_TYPE_CODES = ['RM', 'DSCR', 'HE'] as const;
export type TeamCallLeadType = (typeof TEAM_CALL_LEAD_TYPE_CODES)[number];

export const TEAM_CALL_LEAD_TYPE_OPTIONS: { value: TeamCallLeadType; label: string }[] = [
  { value: 'RM', label: 'RM — Reverse Mortgage' },
  { value: 'DSCR', label: 'DSCR' },
  { value: 'HE', label: 'HE — Home Equity / Call Center' },
];

/** Quality grade for curated "good call" examples. */
export const TEAM_CALL_GRADE_CODES = ['A+', 'A', 'A-', 'B'] as const;
export type TeamCallGrade = (typeof TEAM_CALL_GRADE_CODES)[number];

export const TEAM_CALL_GRADE_OPTIONS: { value: TeamCallGrade; label: string }[] = [
  { value: 'A+', label: 'A+ — Exceptional' },
  { value: 'A', label: 'A — Excellent' },
  { value: 'A-', label: 'A- — Strong' },
  { value: 'B', label: 'B — Good example' },
];

export type CallHighlight = {
  at_seconds: number;
  label: string;
  takeaway: string;
};

export type TeamCallRow = {
  id: string;
  title: string;
  call_type: TeamCallTypeCode;
  called_at: string;
  participants: string | null;
  recording_url: string | null;
  transcript: string | null;
  summary: string | null;
  highlights: CallHighlight[];
  highlights_text: string | null;
  tags: string[];
  duration_seconds: number | null;
  lead_type: TeamCallLeadType | null;
  grade: TeamCallGrade | null;
  source_event_id: string | null;
  created_at: string;
  updated_at: string;
};

export const TEAM_CALL_FIELDS =
  'id, title, call_type, called_at, participants, recording_url, transcript, summary, highlights, highlights_text, tags, duration_seconds, lead_type, grade, source_event_id, created_at, updated_at, created_by, updated_by';

export function isValidTeamCallType(type: string | null | undefined): type is TeamCallTypeCode {
  return !!type && (TEAM_CALL_TYPE_CODES as readonly string[]).includes(type);
}

export function isValidTeamCallLeadType(type: string | null | undefined): type is TeamCallLeadType {
  return !!type && (TEAM_CALL_LEAD_TYPE_CODES as readonly string[]).includes(type);
}

export function isValidTeamCallGrade(grade: string | null | undefined): grade is TeamCallGrade {
  return !!grade && (TEAM_CALL_GRADE_CODES as readonly string[]).includes(grade);
}

export function teamCallTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return TEAM_CALL_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

export function teamCallLeadTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return TEAM_CALL_LEAD_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

export function teamCallGradeLabel(grade: string | null | undefined): string {
  if (!grade) return '—';
  return TEAM_CALL_GRADE_OPTIONS.find(o => o.value === grade)?.label ?? grade;
}

/** Format seconds as MM:SS or H:MM:SS when over one hour. */
export function formatSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
  return `${pad(m)}:${pad(sec)}`;
}

/** Parse MM:SS or H:MM:SS into seconds. Returns null if invalid. */
export function parseTimestamp(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(':').map(p => p.trim());
  if (parts.some(p => !/^\d+$/.test(p))) return null;

  if (parts.length === 2) {
    const [m, s] = parts.map(Number);
    if (s >= 60) return null;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts.map(Number);
    if (m >= 60 || s >= 60) return null;
    return h * 3600 + m * 60 + s;
  }
  return null;
}

export function normalizeHighlights(raw: unknown): CallHighlight[] {
  if (!Array.isArray(raw)) return [];
  const out: CallHighlight[] = [];
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

export function highlightsToSearchText(highlights: CallHighlight[]): string {
  return highlights
    .map(h => `${h.label} ${h.takeaway}`.trim())
    .filter(Boolean)
    .join(' ');
}

/** Normalize tags from string[] or comma-separated string. */
export function cleanTeamCallTags(v: unknown): string[] {
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

export function recordingUrlAtSeconds(url: string, seconds: number): string {
  const base = url.trim();
  if (!base) return base;
  const hashIdx = base.indexOf('#');
  const withoutHash = hashIdx >= 0 ? base.slice(0, hashIdx) : base;
  return `${withoutHash}#t=${Math.floor(seconds)}`;
}

export function isDirectAudioUrl(url: string): boolean {
  return /\.(mp3|wav|ogg|m4a|aac|webm)(\?|$)/i.test(url.trim());
}
