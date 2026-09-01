import { buildContactKey } from '@/lib/contact-key';
import { dqReasonLabel, isDqReasonSlug, type DqReasonSlug } from '@/lib/dq-reasons';

export type DqExistingEvent = {
  id?: string;
  event_type: string;
  occurred_at: string | null;
  ad_name?: string | null;
  adset_name?: string | null;
  campaign_name?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  utm_content?: string | null;
};

export type DqLogEventRow = {
  client_id: string;
  event_type: 'manual_dq';
  occurred_at: string;
  occurred_at_has_time: boolean;
  lead_name: string;
  lead_phone: string;
  ghl_contact_id: string;
  dq_reason: string;
  lead_event_id: string | null;
  ad_name: string | null;
  adset_name: string | null;
  campaign_name: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  raw: Record<string, unknown>;
};

export type DqLeadEventRow = {
  client_id: string;
  event_type: 'lead';
  occurred_at: string;
  occurred_at_has_time: boolean;
  lead_name: string;
  lead_phone: string;
  ghl_contact_id: string;
  raw: Record<string, unknown>;
};

export type ValidateDqReasonsResult =
  | { ok: true; dqReasons: DqReasonSlug[]; dqOther: string | null; notes: string | null }
  | { ok: false; error: string };

export type PlanDqLogInput = {
  createLead: boolean;
  occurredDate: string;
  clientId: string;
  leadName: string;
  leadPhone: string;
  ghlContactId: string | null;
  dqReasons: DqReasonSlug[];
  dqOther: string | null;
  notes: string | null;
  existing: DqExistingEvent[];
};

export type PlanDqLogResult = {
  duplicate: boolean;
  ghlContactId: string;
  leadRow: DqLeadEventRow | null;
  dqRow: DqLogEventRow;
  /** Set when a new lead row is inserted in the same request — use returned id for lead_event_id. */
  pendingLeadEventId: null;
};

export function validateDqReasons(body: unknown): ValidateDqReasonsResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid payload.' };
  }
  const raw = body as Record<string, unknown>;

  const rawReasons = raw.dq_reasons;
  if (!Array.isArray(rawReasons) || rawReasons.length === 0) {
    return { ok: false, error: 'Select at least one reason.' };
  }

  const dqReasons: DqReasonSlug[] = [];
  const seen = new Set<string>();
  for (const item of rawReasons) {
    if (typeof item !== 'string') continue;
    const slug = item.trim().toLowerCase();
    if (!isDqReasonSlug(slug) || seen.has(slug)) continue;
    seen.add(slug);
    dqReasons.push(slug);
  }

  if (dqReasons.length === 0) {
    return { ok: false, error: 'Select at least one reason.' };
  }

  const dqOther =
    typeof raw.dq_other === 'string' && raw.dq_other.trim() ? raw.dq_other.trim() : null;
  const notes =
    typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null;

  if (dqReasons.includes('other') && !dqOther) {
    return { ok: false, error: 'Describe the other reason.' };
  }

  return { ok: true, dqReasons, dqOther, notes };
}

export function formatDqReason(dqReasons: DqReasonSlug[], dqOther: string | null): string {
  return dqReasons
    .map(slug => {
      if (slug === 'other' && dqOther) return `Other: ${dqOther}`;
      return dqReasonLabel(slug);
    })
    .join('; ');
}

export function findSourceLeadEvent(existing: DqExistingEvent[]): DqExistingEvent | null {
  const leads = existing
    .filter(e => e.event_type === 'lead' && e.id)
    .sort((a, b) => {
      const ta = a.occurred_at ? Date.parse(a.occurred_at) : 0;
      const tb = b.occurred_at ? Date.parse(b.occurred_at) : 0;
      return ta - tb;
    });
  return leads[0] ?? null;
}

function hasManualDq(existing: DqExistingEvent[]): boolean {
  return existing.some(e => e.event_type === 'manual_dq');
}

function hasLead(existing: DqExistingEvent[]): boolean {
  return existing.some(e => e.event_type === 'lead');
}

export function planDqLogEvent(input: PlanDqLogInput): PlanDqLogResult {
  const ghlContactId =
    input.ghlContactId?.trim() || buildContactKey(input.clientId, input.leadPhone);
  const occurredAt = `${input.occurredDate}T12:00:00.000Z`;
  const identity = {
    client_id: input.clientId,
    occurred_at: occurredAt,
    occurred_at_has_time: false,
    lead_name: input.leadName.trim(),
    lead_phone: input.leadPhone.trim(),
    ghl_contact_id: ghlContactId,
  };

  const duplicate = hasManualDq(input.existing);
  const sourceLead = findSourceLeadEvent(input.existing);
  const needsLead = input.createLead && !hasLead(input.existing);

  const leadRow: DqLeadEventRow | null = needsLead
    ? {
        ...identity,
        event_type: 'lead',
        raw: { source: 'client_log_form' },
      }
    : null;

  const dqRow: DqLogEventRow = {
    ...identity,
    event_type: 'manual_dq',
    dq_reason: formatDqReason(input.dqReasons, input.dqOther),
    lead_event_id: sourceLead?.id ?? null,
    ad_name: sourceLead?.ad_name?.trim() || null,
    adset_name: sourceLead?.adset_name?.trim() || null,
    campaign_name: sourceLead?.campaign_name?.trim() || null,
    utm_source: sourceLead?.utm_source?.trim() || null,
    utm_campaign: sourceLead?.utm_campaign?.trim() || null,
    utm_content: sourceLead?.utm_content?.trim() || null,
    raw: {
      source: 'client_log_form',
      log_type: 'dq',
      dq_reasons: input.dqReasons,
      ...(input.dqOther ? { dq_other: input.dqOther } : {}),
      ...(input.notes ? { notes: input.notes } : {}),
    },
  };

  return {
    duplicate,
    ghlContactId,
    leadRow,
    dqRow,
    pendingLeadEventId: null,
  };
}

/** After inserting a new lead row, attach its id to the DQ row. */
export function attachLeadEventId(
  dqRow: DqLogEventRow,
  leadEventId: string,
): DqLogEventRow {
  return { ...dqRow, lead_event_id: leadEventId };
}

export function isClientLogType(value: unknown): value is 'conversion' | 'dq' {
  return value === 'conversion' || value === 'dq';
}
