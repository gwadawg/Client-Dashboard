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
  transcript: string;
  would_rejoin: WouldRejoin;
  checklist: Record<ChurnChecklistKey, boolean>;
  checklist_answered: Record<ChurnChecklistKey, boolean>;
  checklist_exceptions: Record<ChurnChecklistKey, string>;
};

function emptyChecklistMaps() {
  const checklist = {} as Record<ChurnChecklistKey, boolean>;
  const checklist_answered = {} as Record<ChurnChecklistKey, boolean>;
  const checklist_exceptions = {} as Record<ChurnChecklistKey, string>;
  for (const item of CHURN_CHECKLIST_ITEMS) {
    checklist[item.key] = false;
    checklist_answered[item.key] = false;
    checklist_exceptions[item.key] = '';
  }
  return { checklist, checklist_answered, checklist_exceptions };
}

export function emptyChurnDraft(effectiveDate = ''): ChurnFormDraft {
  return {
    reason_code: '',
    effective_churn_date: effectiveDate || new Date().toISOString().slice(0, 10),
    client_feedback: '',
    internal_notes: '',
    recording_url: '',
    transcript: '',
    would_rejoin: '',
    ...emptyChecklistMaps(),
  };
}

export function isChurnChecklistItemSatisfied(
  draft: ChurnFormDraft,
  key: ChurnChecklistKey,
): boolean {
  if (!draft.checklist_answered[key]) return false;
  if (draft.checklist[key]) return true;
  return !!draft.checklist_exceptions[key]?.trim();
}

export function churnChecklistValidationError(draft: ChurnFormDraft): string | null {
  for (const item of CHURN_CHECKLIST_ITEMS) {
    if (!draft.checklist_answered[item.key]) {
      return `Answer yes or no for every checklist item (missing: "${item.label}").`;
    }
    if (!draft.checklist[item.key] && !draft.checklist_exceptions[item.key]?.trim()) {
      return `Explain why "${item.label}" was not completed.`;
    }
  }
  return null;
}

export function isChurnFormComplete(draft: ChurnFormDraft): boolean {
  if (!draft.effective_churn_date.trim()) return false;
  if (!isValidReasonCode(draft.reason_code)) return false;
  if (!draft.client_feedback.trim()) return false;
  return CHURN_CHECKLIST_ITEMS.every(item => isChurnChecklistItemSatisfied(draft, item.key));
}

export function churnDraftToResponses(draft: ChurnFormDraft): Record<string, unknown> {
  const checklist_exceptions = Object.fromEntries(
    CHURN_CHECKLIST_ITEMS.map(item => [
      item.key,
      draft.checklist[item.key] ? null : draft.checklist_exceptions[item.key].trim() || null,
    ]),
  );
  return {
    reason_code: draft.reason_code,
    effective_churn_date: draft.effective_churn_date,
    client_feedback: draft.client_feedback.trim(),
    internal_notes: draft.internal_notes.trim() || null,
    recording_url: draft.recording_url.trim() || null,
    transcript: draft.transcript.trim() || null,
    would_rejoin: draft.would_rejoin || null,
    checklist: draft.checklist,
    checklist_exceptions,
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
  draft.transcript =
    typeof responses.transcript === 'string' ? responses.transcript : '';
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

  const rawExceptions = responses.checklist_exceptions;
  if (rawExceptions && typeof rawExceptions === 'object') {
    for (const item of CHURN_CHECKLIST_ITEMS) {
      const value = (rawExceptions as Record<string, unknown>)[item.key];
      draft.checklist_exceptions[item.key] = typeof value === 'string' ? value : '';
    }
  }

  for (const item of CHURN_CHECKLIST_ITEMS) {
    draft.checklist_answered[item.key] =
      draft.checklist[item.key] || !!draft.checklist_exceptions[item.key]?.trim();
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

export function formatChurnChecklistLine(
  draft: ChurnFormDraft,
  item: (typeof CHURN_CHECKLIST_ITEMS)[number],
  options?: { plainText?: boolean },
): string {
  if (draft.checklist[item.key]) return `  ✓ ${item.label}`;
  const reason = draft.checklist_exceptions[item.key]?.trim();
  if (reason) {
    const suffix = options?.plainText ? `(not done: ${reason})` : `_(not done: ${reason})_`;
    return `  — ${item.label} ${suffix}`;
  }
  return `  — ${item.label}`;
}

export function formatChurnSlackChecklist(responses: Record<string, unknown>): string {
  const draft = churnResponsesToDraft(responses);
  return CHURN_CHECKLIST_ITEMS.map(item => formatChurnChecklistLine(draft, item)).join('\n');
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
  draft.transcript = typeof body.transcript === 'string' ? body.transcript : '';
  draft.would_rejoin =
    body.would_rejoin === 'yes' || body.would_rejoin === 'no' || body.would_rejoin === 'unknown'
      ? body.would_rejoin
      : '';
  if (body.checklist && typeof body.checklist === 'object') {
    for (const item of CHURN_CHECKLIST_ITEMS) {
      draft.checklist[item.key] = !!(body.checklist as Record<string, boolean>)[item.key];
    }
  }
  if (body.checklist_exceptions && typeof body.checklist_exceptions === 'object') {
    for (const item of CHURN_CHECKLIST_ITEMS) {
      const value = (body.checklist_exceptions as Record<string, unknown>)[item.key];
      draft.checklist_exceptions[item.key] = typeof value === 'string' ? value : '';
    }
  }
  if (body.checklist_answered && typeof body.checklist_answered === 'object') {
    for (const item of CHURN_CHECKLIST_ITEMS) {
      draft.checklist_answered[item.key] = !!(body.checklist_answered as Record<string, boolean>)[
        item.key
      ];
    }
  } else {
    for (const item of CHURN_CHECKLIST_ITEMS) {
      draft.checklist_answered[item.key] =
        draft.checklist[item.key] || !!draft.checklist_exceptions[item.key]?.trim();
    }
  }
  return draft;
}

export function wouldRejoinLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return WOULD_REJOIN_OPTIONS.find(o => o.value === value)?.label ?? value;
}