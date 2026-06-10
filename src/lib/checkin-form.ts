// Structured fields for client check-in calls (stored in client_calls.checkin_form).

export const CHECKIN_SENTIMENT_CODES = ['happy', 'neutral', 'concerned', 'at_risk'] as const;
export type CheckinSentiment = (typeof CHECKIN_SENTIMENT_CODES)[number];

export const CHECKIN_SENTIMENT_OPTIONS: { value: CheckinSentiment; label: string }[] = [
  { value: 'happy', label: 'Happy / positive' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'concerned', label: 'Concerned' },
  { value: 'at_risk', label: 'At risk / unhappy' },
];

export const CHECKIN_RESULTS_CODES = ['satisfied', 'mixed', 'unsatisfied', 'too_early'] as const;
export type CheckinResultsSatisfaction = (typeof CHECKIN_RESULTS_CODES)[number];

export const CHECKIN_RESULTS_OPTIONS: { value: CheckinResultsSatisfaction; label: string }[] = [
  { value: 'satisfied', label: 'Satisfied with results' },
  { value: 'mixed', label: 'Mixed feelings' },
  { value: 'unsatisfied', label: 'Unsatisfied with results' },
  { value: 'too_early', label: 'Too early to tell' },
];

export const CHECKIN_TOPIC_CODES = [
  'leads_volume',
  'lead_quality',
  'appointments',
  'show_rate',
  'ad_spend',
  'setter_performance',
  'billing_contract',
  'goals_expectations',
] as const;
export type CheckinTopic = (typeof CHECKIN_TOPIC_CODES)[number];

export const CHECKIN_TOPIC_OPTIONS: { value: CheckinTopic; label: string }[] = [
  { value: 'leads_volume', label: 'Lead volume' },
  { value: 'lead_quality', label: 'Lead quality' },
  { value: 'appointments', label: 'Appointments / booking rate' },
  { value: 'show_rate', label: 'Show rate' },
  { value: 'ad_spend', label: 'Ad spend / budget' },
  { value: 'setter_performance', label: 'Setter / call team performance' },
  { value: 'billing_contract', label: 'Billing / contract' },
  { value: 'goals_expectations', label: 'Goals & expectations' },
];

export type CheckinFormData = {
  client_sentiment: CheckinSentiment | '';
  results_satisfaction: CheckinResultsSatisfaction | '';
  topics_discussed: CheckinTopic[];
  what_went_well: string;
  concerns_raised: string;
  our_action_items: string;
  client_action_items: string;
  escalation_needed: boolean;
  next_checkin_date: string;
  follow_up_owner: string;
};

export const EMPTY_CHECKIN_FORM: CheckinFormData = {
  client_sentiment: '',
  results_satisfaction: '',
  topics_discussed: [],
  what_went_well: '',
  concerns_raised: '',
  our_action_items: '',
  client_action_items: '',
  escalation_needed: false,
  next_checkin_date: '',
  follow_up_owner: '',
};

export type StoredCheckinForm = {
  client_sentiment?: CheckinSentiment;
  results_satisfaction?: CheckinResultsSatisfaction;
  topics_discussed?: CheckinTopic[];
  what_went_well?: string;
  concerns_raised?: string;
  our_action_items?: string;
  client_action_items?: string;
  escalation_needed?: boolean;
  next_checkin_date?: string;
  follow_up_owner?: string;
};

function trimOrNull(s: string | undefined): string | null {
  const t = s?.trim();
  return t || null;
}

export function parseCheckinFormInput(value: unknown): StoredCheckinForm | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const out: StoredCheckinForm = {};

  if (typeof raw.client_sentiment === 'string' && CHECKIN_SENTIMENT_CODES.includes(raw.client_sentiment as CheckinSentiment)) {
    out.client_sentiment = raw.client_sentiment as CheckinSentiment;
  }
  if (typeof raw.results_satisfaction === 'string' && CHECKIN_RESULTS_CODES.includes(raw.results_satisfaction as CheckinResultsSatisfaction)) {
    out.results_satisfaction = raw.results_satisfaction as CheckinResultsSatisfaction;
  }
  if (Array.isArray(raw.topics_discussed)) {
    out.topics_discussed = raw.topics_discussed.filter(
      (t): t is CheckinTopic => typeof t === 'string' && (CHECKIN_TOPIC_CODES as readonly string[]).includes(t),
    );
  }
  const whatWentWell = trimOrNull(typeof raw.what_went_well === 'string' ? raw.what_went_well : undefined);
  if (whatWentWell) out.what_went_well = whatWentWell;
  const concerns = trimOrNull(typeof raw.concerns_raised === 'string' ? raw.concerns_raised : undefined);
  if (concerns) out.concerns_raised = concerns;
  const ourActions = trimOrNull(typeof raw.our_action_items === 'string' ? raw.our_action_items : undefined);
  if (ourActions) out.our_action_items = ourActions;
  const clientActions = trimOrNull(typeof raw.client_action_items === 'string' ? raw.client_action_items : undefined);
  if (clientActions) out.client_action_items = clientActions;
  if (raw.escalation_needed === true) out.escalation_needed = true;
  if (typeof raw.next_checkin_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.next_checkin_date.trim())) {
    out.next_checkin_date = raw.next_checkin_date.trim();
  }
  const owner = trimOrNull(typeof raw.follow_up_owner === 'string' ? raw.follow_up_owner : undefined);
  if (owner) out.follow_up_owner = owner;

  return Object.keys(out).length > 0 ? out : null;
}

export function validateCheckinFormForSave(form: StoredCheckinForm | null): string | null {
  if (!form?.client_sentiment) {
    return 'Client sentiment is required for check-in calls';
  }
  return null;
}

export function storedToDraft(stored: StoredCheckinForm | null | undefined): CheckinFormData {
  if (!stored) return { ...EMPTY_CHECKIN_FORM };
  return {
    client_sentiment: stored.client_sentiment ?? '',
    results_satisfaction: stored.results_satisfaction ?? '',
    topics_discussed: stored.topics_discussed ?? [],
    what_went_well: stored.what_went_well ?? '',
    concerns_raised: stored.concerns_raised ?? '',
    our_action_items: stored.our_action_items ?? '',
    client_action_items: stored.client_action_items ?? '',
    escalation_needed: stored.escalation_needed ?? false,
    next_checkin_date: stored.next_checkin_date ?? '',
    follow_up_owner: stored.follow_up_owner ?? '',
  };
}

export function draftToStored(draft: CheckinFormData): StoredCheckinForm | null {
  return parseCheckinFormInput({
    client_sentiment: draft.client_sentiment || undefined,
    results_satisfaction: draft.results_satisfaction || undefined,
    topics_discussed: draft.topics_discussed,
    what_went_well: draft.what_went_well,
    concerns_raised: draft.concerns_raised,
    our_action_items: draft.our_action_items,
    client_action_items: draft.client_action_items,
    escalation_needed: draft.escalation_needed,
    next_checkin_date: draft.next_checkin_date,
    follow_up_owner: draft.follow_up_owner,
  });
}

export function sentimentLabel(code: string | null | undefined): string {
  return CHECKIN_SENTIMENT_OPTIONS.find(o => o.value === code)?.label ?? code ?? '—';
}

export function resultsLabel(code: string | null | undefined): string {
  return CHECKIN_RESULTS_OPTIONS.find(o => o.value === code)?.label ?? code ?? '—';
}

export function topicLabel(code: string): string {
  return CHECKIN_TOPIC_OPTIONS.find(o => o.value === code)?.label ?? code;
}

/** One-line summary for timeline search and optional notes backfill. */
export function buildCheckinSummary(form: StoredCheckinForm): string {
  const parts: string[] = [];
  if (form.client_sentiment) parts.push(`Sentiment: ${sentimentLabel(form.client_sentiment)}`);
  if (form.results_satisfaction) parts.push(`Results: ${resultsLabel(form.results_satisfaction)}`);
  if (form.concerns_raised) parts.push(`Concerns: ${form.concerns_raised.slice(0, 120)}`);
  else if (form.what_went_well) parts.push(`Went well: ${form.what_went_well.slice(0, 120)}`);
  if (form.escalation_needed) parts.push('Escalation needed');
  if (form.next_checkin_date) parts.push(`Next check-in: ${form.next_checkin_date}`);
  return parts.join(' · ');
}
