import { buildContactKey } from '@/lib/contact-key';
import { parseLoanSizeFromRaw } from '@/lib/loan-deals';

export type ActivityRange = '7d' | '30d' | '90d' | 'all';

export type ActivityStage =
  | 'proposal'
  | 'submitted'
  | 'fell_out'
  | 'funded'
  | 'disqualified';

export type ActivityStageFilter = 'all' | ActivityStage;

export type ActivityRecordType = 'deal' | 'event';

export type ActivityRow = {
  id: string;
  record_type: ActivityRecordType;
  editable: boolean;
  lead_name: string;
  lead_phone: string | null;
  stage: ActivityStage;
  loan_size: number | null;
  transaction_label: string | null;
  occurred_on: string;
  submitted_on: string | null;
  fell_out_on: string | null;
  dq_reason: string | null;
};

export type ActivitySummary = {
  proposals: number;
  submitted: number;
  fell_out: number;
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
  fell_out_at: string | null;
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

export function resolveActivityDealStage(deal: Pick<
  ActivityDealInput,
  'stage' | 'fell_out_at'
>): ActivityStage {
  if (deal.stage === 'funded') return 'funded';
  if (deal.fell_out_at) return 'fell_out';
  return 'submitted';
}

export function filterActivityRows(
  rows: ActivityRow[],
  stageFilter: ActivityStageFilter,
  search: string,
): ActivityRow[] {
  const q = search.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');

  return rows.filter(row => {
    if (stageFilter !== 'all' && row.stage !== stageFilter) return false;
    if (!q) return true;

    const name = row.lead_name.toLowerCase();
    const phone = (row.lead_phone ?? '').replace(/\D/g, '');
    if (name.includes(q)) return true;
    if (digits && phone.includes(digits)) return true;
    return false;
  });
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
    const stage = resolveActivityDealStage(deal);
    rows.push({
      id: deal.id,
      record_type: 'deal',
      editable: deal.stage === 'submitted',
      lead_name: deal.lead_name?.trim() || 'Unknown',
      lead_phone: deal.lead_phone,
      stage,
      loan_size: deal.loan_size,
      transaction_label: deal.transaction_label,
      occurred_on: occurredIso.slice(0, 10),
      submitted_on: deal.submitted_at.slice(0, 10),
      fell_out_on: deal.fell_out_at?.slice(0, 10) ?? null,
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
      record_type: 'event',
      editable: false,
      lead_name: ev.lead_name?.trim() || 'Unknown',
      lead_phone: ev.lead_phone,
      stage: 'proposal',
      loan_size: parseLoanSizeFromRaw(ev.raw),
      transaction_label: null,
      occurred_on: ev.occurred_at!.slice(0, 10),
      submitted_on: null,
      fell_out_on: null,
      dq_reason: null,
    });
  }

  for (const ev of events) {
    if (ev.event_type !== 'manual_dq') continue;
    if (formEventSource(ev.raw) !== 'client_log_form') continue;
    if (!dateInRange(ev.occurred_at, window.start, window.end)) continue;
    rows.push({
      id: ev.id,
      record_type: 'event',
      editable: false,
      lead_name: ev.lead_name?.trim() || 'Unknown',
      lead_phone: ev.lead_phone,
      stage: 'disqualified',
      loan_size: null,
      transaction_label: null,
      occurred_on: ev.occurred_at!.slice(0, 10),
      submitted_on: null,
      fell_out_on: null,
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
  let fellOut = 0;
  let funded = 0;
  for (const deal of deals) {
    if (dateInRange(deal.submitted_at, window.start, window.end)) {
      submitted++;
      if (deal.fell_out_at) fellOut++;
    }
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
      fell_out: fellOut,
      funded,
      disqualified,
    },
    rows: rows.slice(0, MAX_ROWS),
  };
}
