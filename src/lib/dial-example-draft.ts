import {
  cleanDialExampleTags,
  normalizeDialHighlights,
  type DialExampleDomain,
  type DialExampleGrade,
  type DialExampleLeadType,
  type DialExampleSource,
} from '@/lib/dial-examples';

export type DialExampleDraft = {
  domain: DialExampleDomain;
  source: DialExampleSource;
  source_id: string;
  title: string;
  recording_url: string;
  called_at: string;
  duration_seconds: number | null;
  agent_name: string;
  lead_name: string;
  lead_phone: string;
  lead_type: DialExampleLeadType | '';
  call_type: string;
  grade: DialExampleGrade | '';
  summary: string;
  client_id: string | null;
  lead_id: string | null;
};

export function draftFromCallCenterRecording(row: {
  id: string;
  occurred_at: string;
  lead_name: string | null;
  lead_phone: string | null;
  agent_name: string | null;
  duration_seconds: number | null;
  recording_url: string;
  clients: { name: string } | null;
  client_id?: string | null;
}): DialExampleDraft {
  const lead = row.lead_name?.trim() || 'Unknown lead';
  const client = row.clients?.name?.trim();
  return {
    domain: 'call_center',
    source: 'events',
    source_id: row.id,
    title: client ? `${lead} · ${client}` : lead,
    recording_url: row.recording_url,
    called_at: row.occurred_at,
    duration_seconds: row.duration_seconds,
    agent_name: row.agent_name?.trim() || '',
    lead_name: row.lead_name?.trim() || '',
    lead_phone: row.lead_phone?.trim() || '',
    lead_type: '',
    call_type: '',
    grade: '',
    summary: '',
    client_id: row.client_id ?? null,
    lead_id: null,
  };
}

/** Prefill helper for future B2B Save from acquisition_dials. */
export function draftFromAcquisitionDial(row: {
  id: string;
  occurred_at: string;
  agent_name: string | null;
  duration_seconds: number | null;
  recording_url: string;
  phone: string | null;
  lead_id: string | null;
  lead_name?: string | null;
}): DialExampleDraft {
  const lead = row.lead_name?.trim() || row.phone?.trim() || 'Unknown lead';
  return {
    domain: 'b2b',
    source: 'acquisition_dials',
    source_id: row.id,
    title: lead,
    recording_url: row.recording_url,
    called_at: row.occurred_at,
    duration_seconds: row.duration_seconds,
    agent_name: row.agent_name?.trim() || '',
    lead_name: row.lead_name?.trim() || '',
    lead_phone: row.phone?.trim() || '',
    lead_type: '',
    call_type: 'dial',
    grade: '',
    summary: '',
    client_id: null,
    lead_id: row.lead_id,
  };
}

export function dialExampleDraftToApiBody(draft: DialExampleDraft): Record<string, unknown> {
  return {
    domain: draft.domain,
    source: draft.source,
    source_id: draft.source_id,
    title: draft.title.trim(),
    recording_url: draft.recording_url.trim(),
    called_at: new Date(draft.called_at).toISOString(),
    duration_seconds: draft.duration_seconds,
    agent_name: draft.agent_name.trim() || null,
    lead_name: draft.lead_name.trim() || null,
    lead_phone: draft.lead_phone.trim() || null,
    lead_type: draft.lead_type || null,
    call_type: draft.call_type.trim() || null,
    grade: draft.grade || null,
    summary: draft.summary.trim() || null,
    tags: cleanDialExampleTags([]),
    highlights: normalizeDialHighlights([]),
    client_id: draft.client_id,
    lead_id: draft.lead_id,
  };
}

export function validateDialExampleDraft(draft: DialExampleDraft, opts?: { requireLeadType?: boolean }): string | null {
  if (!draft.title.trim()) return 'Title is required';
  if (!draft.recording_url.trim()) return 'Recording URL is required';
  if (!draft.grade) return 'Select a grade';
  if (opts?.requireLeadType !== false && draft.domain === 'call_center' && !draft.lead_type) {
    return 'Select the lead type (RM, DSCR, or HE)';
  }
  return null;
}
