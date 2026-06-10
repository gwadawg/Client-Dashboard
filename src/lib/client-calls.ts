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
  'id, client_id, call_type, called_at, recording_url, transcript, notes, attendees, created_at, updated_at, created_by, updated_by';
