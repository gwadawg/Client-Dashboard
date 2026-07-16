import {
  cleanTeamCallTags,
  highlightsToSearchText,
  normalizeHighlights,
  parseTimestamp,
  type CallHighlight,
  type TeamCallGrade,
  type TeamCallLeadType,
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
  lead_type: TeamCallLeadType | '';
  grade: TeamCallGrade | '';
  source_event_id: string | null;
  is_private: boolean;
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
    lead_type: '',
    grade: '',
    source_event_id: null,
    is_private: false,
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
  // Highlights are optional. Incomplete rows are dropped on save.
  // Only reject a row that has a timestamp filled in but it's invalid.
  for (const h of draft.highlights) {
    const ts = h.timestamp.trim();
    if (!ts) continue;
    if (parseTimestamp(ts) === null) {
      return 'Highlight timestamps must be MM:SS or H:MM:SS (or leave the row empty)';
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
    lead_type: draft.lead_type || null,
    grade: draft.grade || null,
    source_event_id: draft.source_event_id,
    is_private: !!draft.is_private,
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
    lead_type: row.lead_type ?? '',
    grade: row.grade ?? '',
    source_event_id: row.source_event_id ?? null,
    is_private: !!row.is_private,
  };
}

/** Prefill a library draft from a dial recording row. */
export function draftFromRecording(row: {
  id: string;
  occurred_at: string;
  lead_name: string | null;
  agent_name: string | null;
  duration_seconds: number | null;
  recording_url: string;
  clients: { name: string } | null;
}): TeamCallDraft {
  const lead = row.lead_name?.trim() || 'Unknown lead';
  const client = row.clients?.name?.trim();
  const title = client ? `${lead} · ${client}` : lead;
  const duration_minutes =
    row.duration_seconds != null && row.duration_seconds > 0
      ? String(Math.round((row.duration_seconds / 60) * 10) / 10)
      : '';

  return {
    ...defaultTeamCallDraft('sales_review'),
    title,
    called_at: toDatetimeLocal(row.occurred_at),
    participants: row.agent_name?.trim() || '',
    recording_url: row.recording_url,
    duration_minutes,
    source_event_id: row.id,
  };
}
