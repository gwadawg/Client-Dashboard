/** GHL contact tag applied when Conversation AI / workflow books the appointment. */
export const AI_BOOKED_CONTACT_TAG = 'ai-booked';

/** Setter / call-center bookings — ongoing credit path. */
export const CALL_CENTER_CREDIT_CALENDAR_NAME = 'Call Center Booking Calendar';

/**
 * Legacy path: reps sometimes booked on the AI calendar before the setter calendar was enforced.
 * Still eligible for agent credit (especially uncredited rows).
 */
export const LEGACY_AI_CREDIT_CALENDAR_NAME = 'AI Booking Calendar';

export const CREDIT_QUEUE_CALENDAR_NAMES = [
  CALL_CENTER_CREDIT_CALENDAR_NAME,
  LEGACY_AI_CREDIT_CALENDAR_NAME,
] as const;

export const CREDIT_QUEUE_BOOKING_EVENT_TYPES = ['appointment_booked', 'callback_booked'] as const;

/** GHL sends this when assignedUser is empty — not a real agent credit. */
export const UNCREDITED_AGENT_PLACEHOLDERS = new Set(['#n/a', 'n/a']);

function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

function extractTags(payload: Record<string, unknown>): string[] {
  const raw =
    payload.contact_tags ??
    payload.tags ??
    (typeof payload.contact === 'object' && payload.contact !== null && !Array.isArray(payload.contact)
      ? (payload.contact as Record<string, unknown>).tags
      : null);

  if (Array.isArray(raw)) {
    return raw.map(v => String(v).trim()).filter(Boolean);
  }
  if (typeof raw === 'string') {
    return raw
      .split(/[,;]/)
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

/** True when the webhook indicates this booking was made by AI automation. */
export function isAiBookedFromPayload(payload: Record<string, unknown>): boolean {
  if (isTruthyFlag(payload.is_ai_booked ?? payload.ai_booked)) return true;

  const target = normalizeTag(AI_BOOKED_CONTACT_TAG);
  return extractTags(payload).some(tag => normalizeTag(tag) === target);
}

export function isCreditQueueCalendar(calendarName: string | null | undefined): boolean {
  const normalized = calendarName?.trim().toLowerCase();
  if (!normalized) return false;
  return CREDIT_QUEUE_CALENDAR_NAMES.some(calendar => calendar.toLowerCase() === normalized);
}

/** True when the event still needs a roster agent assigned in the credit queue. */
export function needsAgentCredit(agentName: string | null | undefined): boolean {
  const trimmed = agentName?.trim();
  if (!trimmed) return true;
  return UNCREDITED_AGENT_PLACEHOLDERS.has(trimmed.toLowerCase());
}

/** Credit queue: live transfers + Call Center / legacy AI calendar bookings. */
export function isCreditQueueEligibleEvent(
  eventType: string,
  calendarName: string | null | undefined,
  agentName?: string | null,
): boolean {
  if (eventType === 'live_transfer') return true;
  if (
    eventType !== 'appointment_booked' &&
    eventType !== 'callback_booked'
  ) {
    return false;
  }

  const cal = calendarName?.trim().toLowerCase();
  if (cal === CALL_CENTER_CREDIT_CALENDAR_NAME.toLowerCase()) return true;
  if (cal === LEGACY_AI_CREDIT_CALENDAR_NAME.toLowerCase()) {
    return !UNCREDITED_AGENT_PLACEHOLDERS.has(agentName?.trim().toLowerCase() ?? '');
  }
  return false;
}

function postgrestQuoted(value: string): string {
  if (/^[a-zA-Z0-9_]+$/.test(value)) return value;
  return `"${value.replace(/"/g, '\\"')}"`;
}

/** PostgREST `or` filter for credit-queue list queries. */
export function creditQueueEventOrFilter(): string {
  const bookingTypes = CREDIT_QUEUE_BOOKING_EVENT_TYPES.join(',');
  const ccCalendar = postgrestQuoted(CALL_CENTER_CREDIT_CALENDAR_NAME);
  const aiCalendar = postgrestQuoted(LEGACY_AI_CREDIT_CALENDAR_NAME);
  return [
    'event_type.eq.live_transfer',
    `and(event_type.in.(${bookingTypes}),calendar_name.eq.${ccCalendar})`,
    // Legacy AI calendar: #N/A = Conversation AI; null/empty = rep bookings needing credit.
    `and(event_type.in.(${bookingTypes}),calendar_name.eq.${aiCalendar},agent_name.isdistinct."#N/A")`,
  ].join(',');
}

/** PostgREST filter for rows that still need agent credit. */
export function creditQueueUncreditedAgentOrFilter(): string {
  return 'agent_name.is.null,agent_name.eq.,agent_name.eq.#N/A';
}

/** PostgREST filter for rows already credited to a real agent name. */
export function creditQueueCreditedAgentAndFilter(): string {
  return 'agent_name.not.is.null,agent_name.neq.,agent_name.neq.#N/A';
}
