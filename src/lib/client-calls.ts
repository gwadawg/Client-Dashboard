// Account call types shared by API + UI.

export const CALL_TYPE_CODES = ['onboarding', 'launch', 'checkin', 'churn', 'other'] as const;
export type CallTypeCode = (typeof CALL_TYPE_CODES)[number];

export const CALL_TYPE_OPTIONS: { value: CallTypeCode; label: string }[] = [
  { value: 'onboarding', label: 'Onboarding' },
  { value: 'launch', label: 'Launch' },
  { value: 'checkin', label: 'Client check-in' },
  { value: 'churn', label: 'Churn / off-boarding' },
  { value: 'other', label: 'Other' },
];

export function isValidCallType(type: string | null | undefined): type is CallTypeCode {
  return !!type && (CALL_TYPE_CODES as readonly string[]).includes(type);
}

export function callTypeLabel(type: string | null | undefined): string {
  if (!type) return '—';
  return CALL_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

export const CLIENT_CALL_FIELDS =
  'id, client_id, call_type, called_at, recording_url, transcript, notes, attendees, checkin_form, duration_seconds, disposition, follow_up_due_at, status_history_id, created_at, updated_at, created_by, updated_by';

export const CALL_DISPOSITION_CODES = [
  'completed',
  'no_show',
  'rescheduled',
  'follow_up_needed',
  'escalated',
  'other',
] as const;

export type CallDispositionCode = (typeof CALL_DISPOSITION_CODES)[number];

export function isValidCallDisposition(d: string | null | undefined): d is CallDispositionCode {
  return !!d && (CALL_DISPOSITION_CODES as readonly string[]).includes(d);
}

export const CALL_DISPOSITION_OPTIONS: { value: CallDispositionCode; label: string }[] = [
  { value: 'completed', label: 'Completed' },
  { value: 'no_show', label: 'No show' },
  { value: 'rescheduled', label: 'Rescheduled' },
  { value: 'follow_up_needed', label: 'Follow-up needed' },
  { value: 'escalated', label: 'Escalated' },
  { value: 'other', label: 'Other' },
];

export function dispositionLabel(d: string | null | undefined): string {
  if (!d) return '—';
  return CALL_DISPOSITION_OPTIONS.find(o => o.value === d)?.label ?? d;
}
