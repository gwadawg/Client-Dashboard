import {
  buildCallLogSummary,
  callLogDraftToStored,
  emptyCallLogDraft,
  storedToCallLogDraft,
  type CallLogDraft,
  type StoredCallLogForm,
} from '@/lib/call-log-form';

export type ClientCallDraft = {
  client_id: string;
  call_type: string;
  called_at: string;
  recording_url: string;
  transcript: string;
  notes: string;
  attendees: string;
  /** Whether this draft should re-apply section defaults when call_type changes. */
  lock_section_defaults: boolean;
  log: CallLogDraft;
};

export function toDatetimeLocal(iso?: string): string {
  const d = iso ? new Date(iso) : new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function defaultCallDraft(clientId = '', callType = 'checkin'): ClientCallDraft {
  return {
    client_id: clientId,
    call_type: callType,
    called_at: toDatetimeLocal(),
    recording_url: '',
    transcript: '',
    notes: '',
    attendees: '',
    lock_section_defaults: true,
    log: emptyCallLogDraft(callType),
  };
}

export function validateCallDraft(draft: ClientCallDraft, requireClient: boolean): string | null {
  if (requireClient && !draft.client_id) return 'Select a client';
  if (!draft.recording_url.trim()) return 'Call / recording link is required';
  if (!draft.called_at) return 'Call date is required';
  return null;
}

export function callDraftToApiBody(draft: ClientCallDraft): Record<string, unknown> {
  const storedLog = callLogDraftToStored(draft.log);
  const notes =
    draft.notes.trim() || (storedLog ? buildCallLogSummary(storedLog) : '');

  const sections = new Set(draft.log.sections);

  return {
    call_type: draft.call_type || 'other',
    called_at: new Date(draft.called_at).toISOString(),
    recording_url: draft.recording_url.trim(),
    transcript: sections.has('transcript') ? draft.transcript.trim() || null : null,
    notes: notes || undefined,
    attendees: sections.has('attendees') ? draft.attendees.trim() || null : null,
    checkin_form: storedLog ?? null,
  };
}

export function rowToCallDraft(row: {
  client_id?: string;
  call_type: string;
  called_at: string;
  recording_url: string | null;
  transcript: string | null;
  notes: string | null;
  attendees: string | null;
  checkin_form?: StoredCallLogForm | null;
}): ClientCallDraft {
  return {
    client_id: row.client_id ?? '',
    call_type: row.call_type,
    called_at: toDatetimeLocal(row.called_at),
    recording_url: row.recording_url ?? '',
    transcript: row.transcript ?? '',
    notes: row.notes ?? '',
    attendees: row.attendees ?? '',
    lock_section_defaults: false,
    log: storedToCallLogDraft(row.checkin_form, row.transcript, row.attendees),
  };
}

/** Apply call-type default chips only while the draft still uses locked defaults. */
export function applyCallTypeToDraft(draft: ClientCallDraft, callType: string): ClientCallDraft {
  if (!draft.lock_section_defaults) {
    return { ...draft, call_type: callType };
  }
  return {
    ...draft,
    call_type: callType,
    log: {
      ...draft.log,
      sections: emptyCallLogDraft(callType).sections,
    },
  };
}

export function toggleDraftSection(
  draft: ClientCallDraft,
  section: CallLogDraft['sections'][number],
): ClientCallDraft {
  const set = new Set(draft.log.sections);
  if (set.has(section)) set.delete(section);
  else set.add(section);
  return {
    ...draft,
    lock_section_defaults: false,
    log: { ...draft.log, sections: [...set] },
  };
}
