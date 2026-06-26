import {
  cleanTeamCallTags,
  highlightsToSearchText,
  normalizeHighlights,
  parseTimestamp,
  type CallHighlight,
  type TeamCallRow,
} from '@/lib/team-calls';

export type HighlightDraft = {
  timestamp: string;
  label: string;
  takeaway: string;
};

export type TeamCallDraft = {
  title: string;
  call_type: string;
  called_at: string;
  participants: string;
  recording_url: string;
  duration_minutes: string;
  summary: string;
  transcript: string;
  tags: string;
  highlights: HighlightDraft[];
};

export function toDatetimeLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultTeamCallDraft(callType = 'coaching'): TeamCallDraft {
  return {
    title: '',
    call_type: callType,
    called_at: toDatetimeLocal(),
    participants: '',
    recording_url: '',
    duration_minutes: '',
    summary: '',
    transcript: '',
    tags: '',
    highlights: [],
  };
}

export function defaultHighlightDraft(): HighlightDraft {
  return { timestamp: '', label: '', takeaway: '' };
}

export function highlightDraftToStored(draft: HighlightDraft): CallHighlight | null {
  const atSeconds = parseTimestamp(draft.timestamp);
  const label = draft.label.trim();
  const takeaway = draft.takeaway.trim();
  if (atSeconds === null || (!label && !takeaway)) return null;
  return { at_seconds: atSeconds, label, takeaway };
}

export function highlightStoredToDraft(h: CallHighlight): HighlightDraft {
  const m = Math.floor(h.at_seconds / 60);
  const s = h.at_seconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    timestamp: `${pad(m)}:${pad(s)}`,
    label: h.label,
    takeaway: h.takeaway,
  };
}

export function validateTeamCallDraft(draft: TeamCallDraft): string | null {
  if (!draft.title.trim()) return 'Title is required';
  if (!draft.called_at) return 'Call date is required';
  for (const h of draft.highlights) {
    if (!h.timestamp.trim() && !h.label.trim() && !h.takeaway.trim()) continue;
    if (parseTimestamp(h.timestamp) === null) {
      return 'Each highlight needs a valid timestamp (MM:SS or H:MM:SS)';
    }
  }
  return null;
}

export function teamCallDraftToApiBody(draft: TeamCallDraft): Record<string, unknown> {
  const highlights = draft.highlights
    .map(highlightDraftToStored)
    .filter((h): h is CallHighlight => h !== null);

  const durationMinutes = draft.duration_minutes.trim();
  let duration_seconds: number | null = null;
  if (durationMinutes) {
    const n = Number(durationMinutes);
    if (Number.isFinite(n) && n > 0) duration_seconds = Math.round(n * 60);
  }

  return {
    title: draft.title.trim(),
    call_type: draft.call_type,
    called_at: new Date(draft.called_at).toISOString(),
    participants: draft.participants.trim() || null,
    recording_url: draft.recording_url.trim() || null,
    transcript: draft.transcript.trim() || null,
    summary: draft.summary.trim() || null,
    tags: cleanTeamCallTags(draft.tags),
    highlights,
    highlights_text: highlightsToSearchText(highlights) || null,
    duration_seconds,
  };
}

export function rowToTeamCallDraft(row: TeamCallRow): TeamCallDraft {
  const highlights = normalizeHighlights(row.highlights).map(highlightStoredToDraft);
  const duration_minutes =
    row.duration_seconds != null && row.duration_seconds > 0
      ? String(Math.round(row.duration_seconds / 60))
      : '';

  return {
    title: row.title,
    call_type: row.call_type,
    called_at: toDatetimeLocal(row.called_at),
    participants: row.participants ?? '',
    recording_url: row.recording_url ?? '',
    duration_minutes,
    summary: row.summary ?? '',
    transcript: row.transcript ?? '',
    tags: (row.tags ?? []).join(', '),
    highlights,
  };
}
