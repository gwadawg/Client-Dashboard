// Modular client call log payload (stored in client_calls.checkin_form jsonb).
// Writers emit the new shape; readers also accept legacy check-in fields.

export const CALL_LOG_SECTION_IDS = [
  'key_points',
  'action_items',
  'call_analysis',
  'health',
  'wins',
  'concerns',
  'transcript',
  'attendees',
] as const;

export type CallLogSectionId = (typeof CALL_LOG_SECTION_IDS)[number];

export const CALL_LOG_SECTION_OPTIONS: { id: CallLogSectionId; label: string }[] = [
  { id: 'key_points', label: 'Key points' },
  { id: 'action_items', label: 'Action items' },
  { id: 'call_analysis', label: 'Call analysis' },
  { id: 'health', label: 'Health' },
  { id: 'wins', label: 'Wins' },
  { id: 'concerns', label: 'Concerns' },
  { id: 'transcript', label: 'Transcript' },
  { id: 'attendees', label: 'Attendees' },
];

export const ACTION_ITEM_OWNERS = ['us', 'client'] as const;
export type ActionItemOwner = (typeof ACTION_ITEM_OWNERS)[number];

export type CallActionItem = {
  text: string;
  owner: ActionItemOwner;
};

export type CallAnalysisData = {
  approach: string;
  discussed: string;
  expectations: string;
};

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
  { value: 'show_rate', label: 'Show rate (unique booked who spoke)' },
  { value: 'ad_spend', label: 'Ad spend / budget' },
  { value: 'setter_performance', label: 'Setter / call team performance' },
  { value: 'billing_contract', label: 'Billing / contract' },
  { value: 'goals_expectations', label: 'Goals & expectations' },
];

export type CallHealthData = {
  client_sentiment: CheckinSentiment | '';
  results_satisfaction: CheckinResultsSatisfaction | '';
  topics_discussed: CheckinTopic[];
  escalation_needed: boolean;
  next_checkin_date: string;
  follow_up_owner: string;
};

export const EMPTY_CALL_HEALTH: CallHealthData = {
  client_sentiment: '',
  results_satisfaction: '',
  topics_discussed: [],
  escalation_needed: false,
  next_checkin_date: '',
  follow_up_owner: '',
};

export const EMPTY_CALL_ANALYSIS: CallAnalysisData = {
  approach: '',
  discussed: '',
  expectations: '',
};

/** Draft shape for the modular log (UI). */
export type CallLogDraft = {
  sections: CallLogSectionId[];
  key_points: string;
  wins: string;
  concerns: string;
  action_items: CallActionItem[];
  call_analysis: CallAnalysisData;
  health: CallHealthData;
};

export const EMPTY_CALL_LOG_DRAFT: CallLogDraft = {
  sections: [],
  key_points: '',
  wins: '',
  concerns: '',
  action_items: [],
  call_analysis: { ...EMPTY_CALL_ANALYSIS },
  health: { ...EMPTY_CALL_HEALTH },
};

/** Stored jsonb shape (new). Legacy top-level fields also accepted on read. */
export type StoredCallLogForm = {
  call_sections?: CallLogSectionId[];
  key_points?: string;
  wins?: string;
  concerns?: string;
  action_items?: CallActionItem[];
  call_analysis?: {
    approach?: string;
    discussed?: string;
    expectations?: string;
  };
  health?: {
    client_sentiment?: CheckinSentiment;
    results_satisfaction?: CheckinResultsSatisfaction;
    topics_discussed?: CheckinTopic[];
    escalation_needed?: boolean;
    next_checkin_date?: string;
    follow_up_owner?: string;
  };
  // Legacy check-in fields (read-only mapping)
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

/** @deprecated Prefer CallLogDraft / StoredCallLogForm. Kept for gradual migration. */
export type CheckinFormData = CallHealthData & {
  what_went_well: string;
  concerns_raised: string;
  our_action_items: string;
  client_action_items: string;
};

/** @deprecated */
export type StoredCheckinForm = StoredCallLogForm;

export const EMPTY_CHECKIN_FORM: CheckinFormData = {
  ...EMPTY_CALL_HEALTH,
  what_went_well: '',
  concerns_raised: '',
  our_action_items: '',
  client_action_items: '',
};

function trimOrNull(s: string | undefined): string | null {
  const t = s?.trim();
  return t || null;
}

function isSectionId(v: unknown): v is CallLogSectionId {
  return typeof v === 'string' && (CALL_LOG_SECTION_IDS as readonly string[]).includes(v);
}

function parseActionItems(raw: unknown): CallActionItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CallActionItem[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const text = typeof row.text === 'string' ? row.text.trim() : '';
    if (!text) continue;
    const owner =
      row.owner === 'client' || row.owner === 'us' ? (row.owner as ActionItemOwner) : 'us';
    out.push({ text, owner });
  }
  return out;
}

function parseHealthBlock(raw: Record<string, unknown> | undefined): CallHealthData {
  if (!raw) return { ...EMPTY_CALL_HEALTH };
  const sentiment =
    typeof raw.client_sentiment === 'string' &&
    CHECKIN_SENTIMENT_CODES.includes(raw.client_sentiment as CheckinSentiment)
      ? (raw.client_sentiment as CheckinSentiment)
      : '';
  const results =
    typeof raw.results_satisfaction === 'string' &&
    CHECKIN_RESULTS_CODES.includes(raw.results_satisfaction as CheckinResultsSatisfaction)
      ? (raw.results_satisfaction as CheckinResultsSatisfaction)
      : '';
  const topics = Array.isArray(raw.topics_discussed)
    ? raw.topics_discussed.filter(
        (t): t is CheckinTopic =>
          typeof t === 'string' && (CHECKIN_TOPIC_CODES as readonly string[]).includes(t),
      )
    : [];
  const next =
    typeof raw.next_checkin_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.next_checkin_date.trim())
      ? raw.next_checkin_date.trim()
      : '';
  const owner = typeof raw.follow_up_owner === 'string' ? raw.follow_up_owner : '';
  return {
    client_sentiment: sentiment,
    results_satisfaction: results,
    topics_discussed: topics,
    escalation_needed: raw.escalation_needed === true,
    next_checkin_date: next,
    follow_up_owner: owner,
  };
}

function healthHasContent(h: CallHealthData): boolean {
  return !!(
    h.client_sentiment ||
    h.results_satisfaction ||
    h.topics_discussed.length > 0 ||
    h.escalation_needed ||
    h.next_checkin_date ||
    h.follow_up_owner.trim()
  );
}

function analysisHasContent(a: CallAnalysisData): boolean {
  return !!(a.approach.trim() || a.discussed.trim() || a.expectations.trim());
}

/** Default section chips for a new draft by call type. */
export function defaultSectionsForCallType(callType: string): CallLogSectionId[] {
  switch (callType) {
    case 'checkin':
      return ['health', 'key_points'];
    case 'onboarding':
    case 'launch':
      return ['call_analysis', 'key_points'];
    case 'churn':
      return ['call_analysis', 'concerns', 'key_points'];
    case 'other':
    default:
      return ['key_points'];
  }
}

export function emptyCallLogDraft(callType = 'checkin'): CallLogDraft {
  return {
    ...EMPTY_CALL_LOG_DRAFT,
    sections: defaultSectionsForCallType(callType),
    call_analysis: { ...EMPTY_CALL_ANALYSIS },
    health: { ...EMPTY_CALL_HEALTH },
    action_items: [],
  };
}

function contentSectionsFromParts(parts: {
  key_points: string;
  wins: string;
  concerns: string;
  action_items: CallActionItem[];
  call_analysis: CallAnalysisData;
  health: CallHealthData;
  transcript?: string | null;
  attendees?: string | null;
}): CallLogSectionId[] {
  const inferred: CallLogSectionId[] = [];
  if (parts.key_points.trim()) inferred.push('key_points');
  if (parts.action_items.length) inferred.push('action_items');
  if (analysisHasContent(parts.call_analysis)) inferred.push('call_analysis');
  if (healthHasContent(parts.health)) inferred.push('health');
  if (parts.wins.trim()) inferred.push('wins');
  if (parts.concerns.trim()) inferred.push('concerns');
  if (parts.transcript?.trim()) inferred.push('transcript');
  if (parts.attendees?.trim()) inferred.push('attendees');
  return inferred;
}

/** Infer which chips should be on when editing an existing row. */
export function inferSectionsFromStored(
  stored: StoredCallLogForm | null | undefined,
  transcript?: string | null,
  attendees?: string | null,
): CallLogSectionId[] {
  if (stored?.call_sections?.length) {
    const fromStored = stored.call_sections.filter(isSectionId);
    if (fromStored.length) return [...fromStored];
  }
  if (!stored) {
    return contentSectionsFromParts({
      key_points: '',
      wins: '',
      concerns: '',
      action_items: [],
      call_analysis: { ...EMPTY_CALL_ANALYSIS },
      health: { ...EMPTY_CALL_HEALTH },
      transcript,
      attendees,
    });
  }

  const healthNested = stored.health
    ? parseHealthBlock(stored.health as Record<string, unknown>)
    : parseHealthBlock(stored as Record<string, unknown>);
  const actionItems: CallActionItem[] = stored.action_items ? [...stored.action_items] : [];
  if (!actionItems.length) {
    if (stored.our_action_items?.trim()) {
      actionItems.push({ text: stored.our_action_items.trim(), owner: 'us' });
    }
    if (stored.client_action_items?.trim()) {
      actionItems.push({ text: stored.client_action_items.trim(), owner: 'client' });
    }
  }

  return contentSectionsFromParts({
    key_points: stored.key_points ?? '',
    wins: stored.wins ?? stored.what_went_well ?? '',
    concerns: stored.concerns ?? stored.concerns_raised ?? '',
    action_items: actionItems,
    call_analysis: {
      approach: stored.call_analysis?.approach ?? '',
      discussed: stored.call_analysis?.discussed ?? '',
      expectations: stored.call_analysis?.expectations ?? '',
    },
    health: healthNested,
    transcript,
    attendees,
  });
}

export function parseCallLogFormInput(value: unknown): StoredCallLogForm | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object' || Array.isArray(value)) return null;

  const raw = value as Record<string, unknown>;
  const out: StoredCallLogForm = {};

  if (Array.isArray(raw.call_sections)) {
    const sections = raw.call_sections.filter(isSectionId);
    if (sections.length) out.call_sections = sections;
  }

  const keyPoints = trimOrNull(typeof raw.key_points === 'string' ? raw.key_points : undefined);
  if (keyPoints) out.key_points = keyPoints;

  const wins =
    trimOrNull(typeof raw.wins === 'string' ? raw.wins : undefined) ??
    trimOrNull(typeof raw.what_went_well === 'string' ? raw.what_went_well : undefined);
  if (wins) out.wins = wins;

  const concerns =
    trimOrNull(typeof raw.concerns === 'string' ? raw.concerns : undefined) ??
    trimOrNull(typeof raw.concerns_raised === 'string' ? raw.concerns_raised : undefined);
  if (concerns) out.concerns = concerns;

  const actionItems = parseActionItems(raw.action_items);
  if (actionItems.length) {
    out.action_items = actionItems;
  } else {
    // Legacy string action fields → structured list
    const migrated: CallActionItem[] = [];
    const our = trimOrNull(typeof raw.our_action_items === 'string' ? raw.our_action_items : undefined);
    if (our) migrated.push({ text: our, owner: 'us' });
    const theirs = trimOrNull(
      typeof raw.client_action_items === 'string' ? raw.client_action_items : undefined,
    );
    if (theirs) migrated.push({ text: theirs, owner: 'client' });
    if (migrated.length) out.action_items = migrated;
  }

  if (raw.call_analysis && typeof raw.call_analysis === 'object' && !Array.isArray(raw.call_analysis)) {
    const ca = raw.call_analysis as Record<string, unknown>;
    const approach = trimOrNull(typeof ca.approach === 'string' ? ca.approach : undefined);
    const discussed = trimOrNull(typeof ca.discussed === 'string' ? ca.discussed : undefined);
    const expectations = trimOrNull(typeof ca.expectations === 'string' ? ca.expectations : undefined);
    if (approach || discussed || expectations) {
      out.call_analysis = {
        ...(approach ? { approach } : {}),
        ...(discussed ? { discussed } : {}),
        ...(expectations ? { expectations } : {}),
      };
    }
  }

  // Nested health or legacy top-level health fields
  const nestedHealth =
    raw.health && typeof raw.health === 'object' && !Array.isArray(raw.health)
      ? (raw.health as Record<string, unknown>)
      : undefined;
  const healthSource = nestedHealth ?? raw;
  const healthDraft = parseHealthBlock(healthSource);
  if (healthHasContent(healthDraft)) {
    out.health = {};
    if (healthDraft.client_sentiment) out.health.client_sentiment = healthDraft.client_sentiment;
    if (healthDraft.results_satisfaction) {
      out.health.results_satisfaction = healthDraft.results_satisfaction;
    }
    if (healthDraft.topics_discussed.length) {
      out.health.topics_discussed = healthDraft.topics_discussed;
    }
    if (healthDraft.escalation_needed) out.health.escalation_needed = true;
    if (healthDraft.next_checkin_date) out.health.next_checkin_date = healthDraft.next_checkin_date;
    if (healthDraft.follow_up_owner.trim()) {
      out.health.follow_up_owner = healthDraft.follow_up_owner.trim();
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

/** @deprecated alias */
export const parseCheckinFormInput = parseCallLogFormInput;

export function validateCallLogFormForSave(_form: StoredCallLogForm | null): string | null {
  // Sentiment is never a hard block (design).
  return null;
}

/** @deprecated alias — no longer requires sentiment */
export function validateCheckinFormForSave(form: StoredCallLogForm | null): string | null {
  return validateCallLogFormForSave(form);
}

export function storedToCallLogDraft(
  stored: StoredCallLogForm | null | undefined,
  transcript?: string | null,
  attendees?: string | null,
): CallLogDraft {
  if (!stored) {
    return {
      ...emptyCallLogDraft('other'),
      sections: [],
    };
  }

  const healthNested = stored.health
    ? parseHealthBlock(stored.health as Record<string, unknown>)
    : parseHealthBlock(stored as Record<string, unknown>);

  const analysis: CallAnalysisData = {
    approach: stored.call_analysis?.approach ?? '',
    discussed: stored.call_analysis?.discussed ?? '',
    expectations: stored.call_analysis?.expectations ?? '',
  };

  let actionItems = stored.action_items ? [...stored.action_items] : [];
  if (!actionItems.length) {
    if (stored.our_action_items?.trim()) {
      actionItems.push({ text: stored.our_action_items.trim(), owner: 'us' });
    }
    if (stored.client_action_items?.trim()) {
      actionItems.push({ text: stored.client_action_items.trim(), owner: 'client' });
    }
  }

  const wins = stored.wins ?? stored.what_went_well ?? '';
  const concerns = stored.concerns ?? stored.concerns_raised ?? '';

  return {
    sections: inferSectionsFromStored(stored, transcript, attendees),
    key_points: stored.key_points ?? '',
    wins,
    concerns,
    action_items: actionItems,
    call_analysis: analysis,
    health: healthNested,
  };
}

/**
 * Build stored jsonb from draft. Only includes content for sections that are
 * enabled (or have content for safety). Omits empty noise.
 */
export function callLogDraftToStored(draft: CallLogDraft): StoredCallLogForm | null {
  const on = new Set(draft.sections);
  const out: StoredCallLogForm = {};

  // Persist which chips were on (even if empty) so edit restores UX
  if (draft.sections.length) {
    out.call_sections = [...draft.sections];
  }

  if (on.has('key_points')) {
    const t = trimOrNull(draft.key_points);
    if (t) out.key_points = t;
  }
  if (on.has('wins')) {
    const t = trimOrNull(draft.wins);
    if (t) out.wins = t;
  }
  if (on.has('concerns')) {
    const t = trimOrNull(draft.concerns);
    if (t) out.concerns = t;
  }
  if (on.has('action_items')) {
    const items = draft.action_items
      .map(i => ({ text: i.text.trim(), owner: i.owner }))
      .filter(i => i.text);
    if (items.length) out.action_items = items;
  }
  if (on.has('call_analysis')) {
    const approach = trimOrNull(draft.call_analysis.approach);
    const discussed = trimOrNull(draft.call_analysis.discussed);
    const expectations = trimOrNull(draft.call_analysis.expectations);
    if (approach || discussed || expectations) {
      out.call_analysis = {
        ...(approach ? { approach } : {}),
        ...(discussed ? { discussed } : {}),
        ...(expectations ? { expectations } : {}),
      };
    }
  }
  if (on.has('health') && healthHasContent(draft.health)) {
    out.health = {};
    if (draft.health.client_sentiment) out.health.client_sentiment = draft.health.client_sentiment;
    if (draft.health.results_satisfaction) {
      out.health.results_satisfaction = draft.health.results_satisfaction;
    }
    if (draft.health.topics_discussed.length) {
      out.health.topics_discussed = [...draft.health.topics_discussed];
    }
    if (draft.health.escalation_needed) out.health.escalation_needed = true;
    if (draft.health.next_checkin_date) out.health.next_checkin_date = draft.health.next_checkin_date;
    if (draft.health.follow_up_owner.trim()) {
      out.health.follow_up_owner = draft.health.follow_up_owner.trim();
    }
  }

  // call_sections alone is enough to keep an empty modular log distinguishable
  return Object.keys(out).length > 0 ? out : null;
}

/** Legacy adapters used by older UI paths. */
export function storedToDraft(stored: StoredCallLogForm | null | undefined): CheckinFormData {
  const log = storedToCallLogDraft(stored);
  const our = log.action_items
    .filter(i => i.owner === 'us')
    .map(i => i.text)
    .join('\n');
  const client = log.action_items
    .filter(i => i.owner === 'client')
    .map(i => i.text)
    .join('\n');
  return {
    ...log.health,
    what_went_well: log.wins,
    concerns_raised: log.concerns,
    our_action_items: our,
    client_action_items: client,
  };
}

export function draftToStored(draft: CheckinFormData): StoredCallLogForm | null {
  return parseCallLogFormInput({
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

export function buildCallLogSummary(form: StoredCallLogForm): string {
  const draft = storedToCallLogDraft(form);
  const parts: string[] = [];
  if (draft.key_points.trim()) parts.push(`Key points: ${draft.key_points.trim().slice(0, 120)}`);
  if (draft.health.client_sentiment) {
    parts.push(`Sentiment: ${sentimentLabel(draft.health.client_sentiment)}`);
  }
  if (draft.concerns.trim()) parts.push(`Concerns: ${draft.concerns.trim().slice(0, 120)}`);
  else if (draft.wins.trim()) parts.push(`Wins: ${draft.wins.trim().slice(0, 120)}`);
  if (draft.health.escalation_needed) parts.push('Escalation needed');
  if (draft.action_items.length) {
    parts.push(`${draft.action_items.length} action item${draft.action_items.length === 1 ? '' : 's'}`);
  }
  if (draft.health.next_checkin_date) parts.push(`Next check-in: ${draft.health.next_checkin_date}`);
  return parts.join(' · ');
}

/** @deprecated alias */
export function buildCheckinSummary(form: StoredCallLogForm): string {
  return buildCallLogSummary(form);
}

export function callLogHasDisplayContent(form: StoredCallLogForm | null | undefined): boolean {
  if (!form) return false;
  const d = storedToCallLogDraft(form);
  return !!(
    d.key_points.trim() ||
    d.wins.trim() ||
    d.concerns.trim() ||
    d.action_items.length ||
    analysisHasContent(d.call_analysis) ||
    healthHasContent(d.health)
  );
}
