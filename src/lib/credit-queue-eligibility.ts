/** GHL contact tag applied when Conversation AI / workflow books the appointment. */
export const AI_BOOKED_CONTACT_TAG = 'ai-booked';

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

/** Credit queue shows agent-claimable events only — AI bookings stay in KPI totals. */
export function isCreditQueueEligibleEvent(
  eventType: string,
  isAiBooked: boolean | null | undefined,
): boolean {
  if (eventType === 'live_transfer') return true;
  if (eventType === 'appointment_booked' || eventType === 'callback_booked') {
    return isAiBooked !== true;
  }
  return true;
}
