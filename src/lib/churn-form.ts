// Churn offboarding — stored in client_form_submissions.responses, not clients columns.

import {
  isValidReasonCode,
  reasonLabel,
  type LifecycleReasonCode,
} from '@/lib/client-feedback';

export const CHURN_CHECKLIST_ITEMS = [
  { key: 'exit_call_completed', label: 'Exit / churn call completed' },
  { key: 'meta_ads_paused', label: 'Meta ads paused or ownership transferred' },
  { key: 'ghl_access_documented', label: 'GHL sub-account access documented / revoked' },
  { key: 'billing_finalized', label: 'Billing finalized (final invoice collected or written off)' },
  { key: 'slack_channel_archived', label: 'Client Slack channel archived or notified' },
] as const;

export type ChurnChecklistKey = (typeof CHURN_CHECKLIST_ITEMS)[number]['key'];

export const WOULD_REJOIN_OPTIONS = [
  { value: '', label: 'Not specified' },
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
  { value: 'unknown', label: 'Unknown' },
] as const;

export type WouldRejoin = '' | 'yes' | 'no' | 'unknown';

export type ChurnFormDraft = {
  reason_code: string;
  effective_churn_date: string;
  client_feedback: string;
  internal_notes: string;
  recording_url: string;
  would_rejoin: WouldRejoin;
  checklist: Record<ChurnChecklistKey, boolean>;
};

export function emptyChurnDraft(effectiveDate = ''): ChurnFormDraft {
  const checklist = {} as Record<ChurnChecklistKey, boolean>;
  for (const item of CHURN_CHECKLIST_ITEMS) checklist[item.key] = false;
  return {
    reason_code: '',
    effective_churn_date: effectiveDate || new Date().toISOString().slice(0, 10),
    client_feedback: '',
    internal_notes: '',
    recording_url: '',
    would_rejoin: '',
    checklist,
  };
}

export function isChurnFormComplete(draft: ChurnFormDraft): boolean {
  if (!draft.effective_churn_date.trim()) return false;
  if (!isValidReasonCode(draft.reason_code)) return false;
  if (!draft.client_feedback.trim()) return false;
  return CHURN_CHECKLIST_ITEMS.every(item => draft.checklist[item.key] === true);
}

export function churnDraftToResponses(draft: ChurnFormDraft): Record<string, unknown> {
  return {
    reason_code: draft.reason_code,
    effective_churn_date: draft.effective_churn_date,
    client_feedback: draft.client_feedback.trim(),
    internal_notes: draft.internal_notes.trim() || null,
    recording_url: draft.recording_url.trim() || null,
    would_rejoin: draft.would_rejoin || null,
    checklist: draft.checklist,
  };
}

export function churnResponsesToDraft(responses: Record<string, unknown>): ChurnFormDraft {
  const draft = emptyChurnDraft(
    typeof responses.effective_churn_date === 'string' ? responses.effective_churn_date : undefined,
  );
  draft.reason_code = typeof responses.reason_code === 'string' ? responses.reason_code : '';
  draft.client_feedback =
    typeof responses.client_feedback === 'string' ? responses.client_feedback : '';
  draft.internal_notes =
    typeof responses.internal_notes === 'string' ? responses.internal_notes : '';
  draft.recording_url =
    typeof responses.recording_url === 'string' ? responses.recording_url : '';
  draft.would_rejoin =
    responses.would_rejoin === 'yes' ||
    responses.would_rejoin === 'no' ||
    responses.would_rejoin === 'unknown'
      ? responses.would_rejoin
      : '';

  const raw = responses.checklist;
  if (raw && typeof raw === 'object') {
    for (const item of CHURN_CHECKLIST_ITEMS) {
      draft.checklist[item.key] = !!(raw as Record<string, boolean>)[item.key];
    }
  }
  return draft;
}

export function churnChecklistSummary(responses: Record<string, unknown>): string[] {
  const draft = churnResponsesToDraft(responses);
  return CHURN_CHECKLIST_ITEMS.filter(item => draft.checklist[item.key]).map(item => item.label);
}

export function formatChurnHistoryNote(draft: ChurnFormDraft): string {
  const parts = [draft.client_feedback.trim()];
  if (draft.internal_notes.trim()) {
    parts.push(`Internal: ${draft.internal_notes.trim()}`);
  }
  return parts.join('\n\n');
}

export function formatChurnSlackChecklist(responses: Record<string, unknown>): string {
  const draft = churnResponsesToDraft(responses);
  return CHURN_CHECKLIST_ITEMS.map(item =>
    draft.checklist[item.key] ? `  ✓ ${item.label}` : `  — ${item.label}`,
  ).join('\n');
}

export function churnReasonDisplay(code: string | null | undefined): string {
  return reasonLabel(code);
}

export function parseChurnDraftFromBody(body: Record<string, unknown>): ChurnFormDraft {
  const draft = emptyChurnDraft(
    typeof body.effective_churn_date === 'string' ? body.effective_churn_date : undefined,
  );
  draft.reason_code = typeof body.reason_code === 'string' ? body.reason_code : '';
  draft.client_feedback = typeof body.client_feedback === 'string' ? body.client_feedback : '';
  draft.internal_notes = typeof body.internal_notes === 'string' ? body.internal_notes : '';
  draft.recording_url = typeof body.recording_url === 'string' ? body.recording_url : '';
  draft.would_rejoin =
    body.would_rejoin === 'yes' || body.would_rejoin === 'no' || body.would_rejoin === 'unknown'
      ? body.would_rejoin
      : '';
  if (body.checklist && typeof body.checklist === 'object') {
    for (const item of CHURN_CHECKLIST_ITEMS) {
      draft.checklist[item.key] = !!(body.checklist as Record<string, boolean>)[item.key];
    }
  }
  return draft;
}

export function wouldRejoinLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return WOULD_REJOIN_OPTIONS.find(o => o.value === value)?.label ?? value;
}