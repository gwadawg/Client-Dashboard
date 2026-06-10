import {
  EMPTY_CHECKIN_FORM,
  buildCheckinSummary,
  draftToStored,
  storedToDraft,
  type CheckinFormData,
  type StoredCheckinForm,
} from '@/lib/checkin-form';

export type ClientCallDraft = {
  client_id: string;
  call_type: string;
  called_at: string;
  recording_url: string;
  transcript: string;
  notes: string;
  attendees: string;
  checkin_form: CheckinFormData;
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
    checkin_form: { ...EMPTY_CHECKIN_FORM },
  };
}

export function validateCallDraft(draft: ClientCallDraft, requireClient: boolean): string | null {
  if (requireClient && !draft.client_id) return 'Select a client';
  if (!draft.called_at) return 'Call date is required';
  if (draft.call_type === 'checkin') {
    const stored = draftToStored(draft.checkin_form);
    if (!stored?.client_sentiment) return 'Client sentiment is required for check-in calls';
  }
  return null;
}

export function callDraftToApiBody(draft: ClientCallDraft): Record<string, unknown> {
  const storedCheckin = draft.call_type === 'checkin' ? draftToStored(draft.checkin_form) : null;
  const notes =
    draft.notes.trim() || (storedCheckin ? buildCheckinSummary(storedCheckin) : '');

  return {
    call_type: draft.call_type,
    called_at: new Date(draft.called_at).toISOString(),
    recording_url: draft.recording_url.trim() || undefined,
    transcript: draft.transcript.trim() || undefined,
    notes: notes || undefined,
    attendees: draft.attendees.trim() || undefined,
    checkin_form: storedCheckin ?? undefined,
  };
}

export function rowToCallDraft(
  row: {
    client_id: string;
    call_type: string;
    called_at: string;
    recording_url: string | null;
    transcript: string | null;
    notes: string | null;
    attendees: string | null;
    checkin_form?: StoredCheckinForm | null;
  },
): ClientCallDraft {
  return {
    client_id: row.client_id,
    call_type: row.call_type,
    called_at: toDatetimeLocal(row.called_at),
    recording_url: row.recording_url ?? '',
    transcript: row.transcript ?? '',
    notes: row.notes ?? '',
    attendees: row.attendees ?? '',
    checkin_form: storedToDraft(row.checkin_form),
  };
}
