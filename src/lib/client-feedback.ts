// Structured churn/feedback reason codes and helpers shared by API + UI.

export const LIFECYCLE_REASON_CODES = [
  'poor_results',
  'pricing_cost',
  'went_in_house',
  'business_closed',
  'contract_ended',
  'service_issues',
  'competitor',
  'unresponsive',
  'mutual_decision',
  'other',
] as const;

export type LifecycleReasonCode = (typeof LIFECYCLE_REASON_CODES)[number];

export const LIFECYCLE_REASON_OPTIONS: { value: LifecycleReasonCode; label: string }[] = [
  { value: 'poor_results', label: 'Poor results / ROI' },
  { value: 'pricing_cost', label: 'Pricing / cost' },
  { value: 'went_in_house', label: 'Went in-house' },
  { value: 'business_closed', label: 'Business closed' },
  { value: 'contract_ended', label: 'Contract ended (no renewal)' },
  { value: 'service_issues', label: 'Service / delivery issues' },
  { value: 'competitor', label: 'Switched to competitor' },
  { value: 'unresponsive', label: 'Client unresponsive' },
  { value: 'mutual_decision', label: 'Mutual decision' },
  { value: 'other', label: 'Other' },
];

export const NOTE_TYPE_CODES = ['general', 'concern', 'win', 'internal'] as const;
export type NoteTypeCode = (typeof NOTE_TYPE_CODES)[number];

export const NOTE_TYPE_OPTIONS: { value: NoteTypeCode; label: string }[] = [
  { value: 'general', label: 'General' },
  { value: 'concern', label: 'Concern' },
  { value: 'win', label: 'Win' },
  { value: 'internal', label: 'Internal' },
];

const FEEDBACK_LIFECYCLE_STATUSES = new Set(['paused', 'churned', 'off_boarding']);

export function requiresLifecycleFeedback(status: string | null | undefined): boolean {
  return !!status && FEEDBACK_LIFECYCLE_STATUSES.has(status);
}

export function requiresReasonOnChurn(status: string | null | undefined): boolean {
  return status === 'churned';
}

export function isValidReasonCode(code: string | null | undefined): code is LifecycleReasonCode {
  return !!code && (LIFECYCLE_REASON_CODES as readonly string[]).includes(code);
}

export function isValidNoteType(type: string | null | undefined): type is NoteTypeCode {
  return !!type && (NOTE_TYPE_CODES as readonly string[]).includes(type);
}

export function reasonLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return LIFECYCLE_REASON_OPTIONS.find(o => o.value === code)?.label ?? code;
}

export function noteTypeLabel(type: string | null | undefined): string {
  if (!type) return 'General';
  return NOTE_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
}

export function lifecycleStatusLabel(status: string | null | undefined): string {
  if (!status) return '—';
  return status.replace(/_/g, ' ');
}
