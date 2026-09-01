import { buildContactKey } from '@/lib/contact-key';
import { parseLoanSizeFromRaw } from '@/lib/loan-deals';

export type ActivityRange = '7d' | '30d' | '90d' | 'all';

export type ActivityStage = 'proposal' | 'submitted' | 'funded' | 'disqualified';

export type ActivityRow = {
  id: string;
  lead_name: string;
  lead_phone: string | null;
  stage: ActivityStage;
  loan_size: number | null;
  transaction_label: string | null;
  occurred_on: string;
  dq_reason: string | null;
};

export type ActivitySummary = {
  proposals: number;
  submitted: number;
  funded: number;
  disqualified: number;
};

export type ActivityDealInput = {
  id: string;
  ghl_contact_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  stage: 'submitted' | 'funded';
  submitted_at: string;
  funded_at: string | null;
  loan_size: number | null;
  transaction_label: string | null;
};

export type ActivityEventInput = {
  id: string;
  event_type: string;
  ghl_contact_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  occurred_at: string | null;
  dq_reason: string | null;
  raw: unknown;
};

export type ClientLogActivityResult = {
  range: { start: string | null; end: string };
  summary: ActivitySummary;
  rows: ActivityRow[];
};

const PROPOSAL_TYPES = new Set(['proposal_made', 'proposal_sent']);
const MAX_ROWS = 500;

export function parseActivityRange(value: string | null): ActivityRange {
  if (value === '7d' || value === '90d' || value === 'all') return value;
  return '30d';
}

export function activityRangeWindow(
  range: ActivityRange,
  now = new Date(),
): { start: string | null; end: string } {
  const end = now.toISOString().slice(0, 10);
  if (range === 'all') return { start: null, end };
  const days = range === '7d' ? 7 : range === '90d' ? 90 : 30;
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1));
  return { start: startDate.toISOString().slice(0, 10), end };
}

export function dateInRange(
  iso: string | null | undefined,
  start: string | null,
  end: string,
): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  if (day > end) return false;
  if (start && day < start) return false;
  return true;
}

function formEventSource(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return null;
  const source = (raw as { source?: unknown }).source;
  return typeof source === 'string' ? source : null;
}

function contactKey(
  clientId: string,
  ghlContactId: string | null,
  phone: string | null,
): string {
  return buildContactKey(clientId, phone, ghlContactId);
}

function dealOccurredIso(deal: ActivityDealInput): string {
  if (deal.stage === 'funded') {
    return deal.funded_at ?? deal.submitted_at;
  }
  return deal.submitted_at;
}

export function buildClientLogActivity(
  clientId: string,
  deals: ActivityDealInput[],
  events: ActivityEventInput[],
  range: ActivityRange,
  now?: Date,
): ClientLogActivityResult {
  const window = activityRangeWindow(range, now);
  const dealContacts = new Set(
    deals.map(d => contactKey(clientId, d.ghl_contact_id, d.lead_phone)),
  );

  const rows: ActivityRow[] = [];

  for (const deal of deals) {
    const occurredIso = dealOccurredIso(deal);
    if (!dateInRange(occurredIso, window.start, window.end)) continue;
    rows.push({
      id: deal.id,
      lead_name: deal.lead_name?.trim() || 'Unknown',
      lead_phone: deal.lead_phone,
      stage: deal.stage,
      loan_size: deal.loan_size,
      transaction_label: deal.transaction_label,
      occurred_on: occurredIso.slice(0, 10),
      dq_reason: null,
    });
  }

  const proposalByContact = new Map<string, ActivityEventInput>();
  for (const ev of events) {
    if (!PROPOSAL_TYPES.has(ev.event_type)) continue;
    if (formEventSource(ev.raw) !== 'loan_log_form') continue;
    if (!dateInRange(ev.occurred_at, window.start, window.end)) continue;
    const key = contactKey(clientId, ev.ghl_contact_id, ev.lead_phone);
    if (dealContacts.has(key)) continue;
    const existing = proposalByContact.get(key);
    if (!existing || (ev.occurred_at ?? '') > (existing.occurred_at ?? '')) {
      proposalByContact.set(key, ev);
    }
  }

  for (const ev of proposalByContact.values()) {
    rows.push({
      id: ev.id,
      lead_name: ev.lead_name?.trim() || 'Unknown',
      lead_phone: ev.lead_phone,
      stage: 'proposal',
      loan_size: parseLoanSizeFromRaw(ev.raw),
      transaction_label: null,
      occurred_on: ev.occurred_at!.slice(0, 10),
      dq_reason: null,
    });
  }

  for (const ev of events) {
    if (ev.event_type !== 'manual_dq') continue;
    if (formEventSource(ev.raw) !== 'client_log_form') continue;
    if (!dateInRange(ev.occurred_at, window.start, window.end)) continue;
    rows.push({
      id: ev.id,
      lead_name: ev.lead_name?.trim() || 'Unknown',
      lead_phone: ev.lead_phone,
      stage: 'disqualified',
      loan_size: null,
      transaction_label: null,
      occurred_on: ev.occurred_at!.slice(0, 10),
      dq_reason: ev.dq_reason,
    });
  }

  const proposalContacts = new Set<string>();
  for (const ev of events) {
    if (!PROPOSAL_TYPES.has(ev.event_type)) continue;
    if (formEventSource(ev.raw) !== 'loan_log_form') continue;
    if (!dateInRange(ev.occurred_at, window.start, window.end)) continue;
    proposalContacts.add(contactKey(clientId, ev.ghl_contact_id, ev.lead_phone));
  }

  let submitted = 0;
  let funded = 0;
  for (const deal of deals) {
    if (dateInRange(deal.submitted_at, window.start, window.end)) submitted++;
    if (
      deal.stage === 'funded' &&
      dateInRange(deal.funded_at, window.start, window.end)
    ) {
      funded++;
    }
  }

  let disqualified = 0;
  for (const ev of events) {
    if (ev.event_type !== 'manual_dq') continue;
    if (formEventSource(ev.raw) !== 'client_log_form') continue;
    if (dateInRange(ev.occurred_at, window.start, window.end)) disqualified++;
  }

  rows.sort((a, b) => {
    if (a.occurred_on !== b.occurred_on) {
      return b.occurred_on.localeCompare(a.occurred_on);
    }
    return a.lead_name.localeCompare(b.lead_name);
  });

  return {
    range: window,
    summary: {
      proposals: proposalContacts.size,
      submitted,
      funded,
      disqualified,
    },
    rows: rows.slice(0, MAX_ROWS),
  };
}
