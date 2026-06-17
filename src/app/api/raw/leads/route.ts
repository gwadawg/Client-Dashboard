import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import { buildContactKey, eventPhone } from '@/lib/contact-key';

const PAGE_SIZE = 50;
/** Cap rows loaded for in-memory grouping (historical backfills). */
const MAX_EVENTS = 20_000;

type EventRow = {
  id: string;
  client_id: string;
  event_type: string;
  occurred_at: string;
  scheduled_at: string | null;
  duration_seconds: number | null;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  speed_to_lead_seconds: number | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  agent_name: string | null;
  direction: string | null;
  call_status: string | null;
  recording_url: string | null;
  calendar_name: string | null;
  external_id: string | null;
  calendar_id: string | null;
  stage_booked: string | null;
  ghl_contact_id: string | null;
  phone_number_used: string | null;
  is_qualified: boolean | null;
  is_hot: boolean | null;
  is_out_of_state: boolean | null;
  lead_source: string | null;
  raw: unknown;
  clients:
    | { name: string; ghl_location_id: string | null }
    | { name: string; ghl_location_id: string | null }[]
    | null;
};

function clientRecord(
  clients: EventRow['clients'],
): { name: string; ghl_location_id: string | null } | null {
  if (!clients) return null;
  if (Array.isArray(clients)) return clients[0] ?? null;
  return clients;
}

function clientName(clients: EventRow['clients']): string {
  return clientRecord(clients)?.name ?? '—';
}

type TimelineItem = {
  id: string;
  event_type: string;
  occurred_at: string;
  scheduled_at: string | null;
  agent_name: string | null;
  duration_seconds: number | null;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  call_status: string | null;
  calendar_name: string | null;
  external_id: string | null;
  calendar_id: string | null;
  stage_booked: string | null;
  recording_url: string | null;
};

type LeadCounts = {
  dials: number;
  pickups: number;
  conversations: number;
  appointments_booked: number;
  shows: number;
  no_shows: number;
  lo_bailed: number;
  cancellations: number;
  callbacks: number;
  live_transfers: number;
  claimed: number;
  proposals: number;
  loan_processing: number;
  closed: number;
  proposals_made: number;
  submissions_made: number;
  funded_loans: number;
};

type LeadProfile = {
  contact_key: string;
  client_id: string;
  client_name: string;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  created_at: string;
  is_qualified: boolean;
  is_hot: boolean;
  is_out_of_state: boolean;
  loan_amount: string | null;
  property_value: string | null;
  ltv: number | null;
  b1_age: string | null;
  b2_age: string | null;
  lead_source: string | null;
  has_proposal_made: boolean;
  has_submission_made: boolean;
  has_loan_funded: boolean;
  ghl_contact_id: string | null;
  ghl_location_id: string | null;
  counts: LeadCounts;
  timeline: TimelineItem[];
};

const PROPOSAL_EVENT_TYPES = new Set(['proposal_made', 'proposal_sent']);
const SUBMISSION_EVENT_TYPES = new Set(['submission_made', 'loan_processing']);
const FUNDED_EVENT_TYPES = new Set(['loan_funded', 'closed']);

/** Pull first matching key from webhook `raw` jsonb. */
function pickRaw(raw: unknown, keys: string[]): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  for (const k of keys) {
    if (!(k in o)) continue;
    const v = o[k];
    if (v == null || typeof v === 'boolean') continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    return v;
  }
  return null;
}

function formatCurrencyCell(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) {
    return `$${v.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
  }
  if (typeof v === 'string') {
    const t = v.trim();
    const n = Number(t.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(n) && t !== '') {
      return `$${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
    }
    return t;
  }
  return String(v);
}

function extractLoanAmount(raw: unknown): string | null {
  return formatCurrencyCell(
    pickRaw(raw, ['loan_amount', 'loanAmount', 'mortgage_amount', 'mortgageAmount', 'requested_loan_amount']),
  );
}

function extractPropertyValue(raw: unknown): string | null {
  return formatCurrencyCell(
    pickRaw(raw, [
      'property_value',
      'propertyValue',
      'home_value',
      'homeValue',
      'estimated_property_value',
      'property_estimated_value',
    ]),
  );
}

/** Parse a raw value into a positive number, or null. */
function toNumber(v: unknown): number | null {
  if (v == null || typeof v === 'boolean') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function loanAmountNumber(raw: unknown): number | null {
  return toNumber(
    pickRaw(raw, ['loan_amount', 'loanAmount', 'mortgage_amount', 'mortgageAmount', 'requested_loan_amount']),
  );
}

function propertyValueNumber(raw: unknown): number | null {
  return toNumber(
    pickRaw(raw, [
      'property_value',
      'propertyValue',
      'home_value',
      'homeValue',
      'estimated_property_value',
      'property_estimated_value',
    ]),
  );
}

function extractLtv(raw: unknown): number | null {
  const loan = loanAmountNumber(raw);
  const property = propertyValueNumber(raw);
  if (loan == null || property == null || property <= 0) return null;
  return Math.round((loan / property) * 100);
}

/** Ages as whole numbers or short labels (e.g. co-borrower not yet collected). */
function formatAgeCell(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && !Number.isNaN(v)) return String(Math.trunc(v));
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return null;
    const n = Number(t.replace(/[^0-9.-]/g, ''));
    if (!Number.isNaN(n) && /^-?\d/.test(t)) return String(Math.trunc(n));
    return t;
  }
  return String(v);
}

function extractB1Age(raw: unknown): string | null {
  const v = pickRaw(raw, [
    'b1_age',
    'b1Age',
    'B1_age',
    'borrower_1_age',
    'borrower1_age',
    'primary_borrower_age',
    'lead_age',
  ]);
  return formatAgeCell(v);
}

function extractB2Age(raw: unknown): string | null {
  const v = pickRaw(raw, [
    'b2_age',
    'b2Age',
    'B2_age',
    'borrower_2_age',
    'borrower2_age',
    'spouse_age',
    'co_borrower_age',
    'coborrower_age',
  ]);
  return formatAgeCell(v);
}

function extractLeadSource(row: EventRow): string | null {
  if (row.lead_source?.trim()) return row.lead_source.trim();
  const v = pickRaw(row.raw, ['lead_source', 'leadSource', 'list_source', 'listSource']);
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function emptyCounts(): LeadCounts {
  return {
    dials: 0,
    pickups: 0,
    conversations: 0,
    appointments_booked: 0,
    shows: 0,
    no_shows: 0,
    lo_bailed: 0,
    cancellations: 0,
    callbacks: 0,
    live_transfers: 0,
    claimed: 0,
    proposals: 0,
    loan_processing: 0,
    closed: 0,
    proposals_made: 0,
    submissions_made: 0,
    funded_loans: 0,
  };
}

function bumpCounts(counts: LeadCounts, eventType: string, row: EventRow) {
  switch (eventType) {
    case 'dial':
      counts.dials++;
      if (row.is_pickup) counts.pickups++;
      if (row.is_conversation) counts.conversations++;
      break;
    case 'appointment_booked':
      counts.appointments_booked++;
      break;
    case 'show':
      counts.shows++;
      break;
    case 'no_show':
      counts.no_shows++;
      break;
    case 'lo_bailed':
      counts.lo_bailed++;
      break;
    case 'appointment_cancelled':
      counts.cancellations++;
      break;
    case 'callback_booked':
      counts.callbacks++;
      break;
    case 'live_transfer':
      counts.live_transfers++;
      break;
    case 'claimed':
      counts.claimed++;
      break;
    case 'proposal_sent':
    case 'proposal_made':
      counts.proposals++;
      counts.proposals_made++;
      break;
    case 'loan_processing':
    case 'submission_made':
      counts.loan_processing++;
      counts.submissions_made++;
      break;
    case 'closed':
    case 'loan_funded':
      counts.closed++;
      counts.funded_loans++;
      break;
    default:
      break;
  }
}

function toTimelineItem(row: EventRow): TimelineItem {
  return {
    id: row.id,
    event_type: row.event_type,
    occurred_at: row.occurred_at,
    scheduled_at: row.scheduled_at,
    agent_name: row.agent_name,
    duration_seconds: row.duration_seconds,
    is_pickup: row.is_pickup,
    is_conversation: row.is_conversation,
    call_status: row.call_status,
    calendar_name: row.calendar_name,
    external_id: row.external_id,
    calendar_id: row.calendar_id,
    stage_booked: row.stage_booked,
    recording_url: row.recording_url,
  };
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'leads');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const conversion_event = searchParams.get('conversion_event');
  const search = searchParams.get('search')?.trim();
  const safeSearch = search ? search.replace(/[,()*]/g, ' ').trim() : '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let q = ctx.service
    .from('events')
    .select(
      'id, client_id, event_type, occurred_at, scheduled_at, duration_seconds, is_pickup, is_conversation, speed_to_lead_seconds, lead_name, lead_phone, lead_email, agent_name, direction, call_status, recording_url, phone_number_used, calendar_name, external_id, calendar_id, stage_booked, ghl_contact_id, is_qualified, is_hot, is_out_of_state, lead_source, raw, clients(name, ghl_location_id)',
    )
    .order('occurred_at', { ascending: false })
    .limit(MAX_EVENTS);

  if (client_id) q = q.eq('client_id', client_id);
  else if (liveClientIds) q = q.in('client_id', liveClientFilter(liveClientIds));
  // When searching, span all dates so a lookup finds the person regardless of range.
  if (!safeSearch) {
    if (start_date) q = q.gte('occurred_at', `${start_date}T00:00:00.000Z`);
    if (end_date) q = q.lte('occurred_at', `${end_date}T23:59:59.999Z`);
  } else {
    q = q.or(
      `lead_name.ilike.%${safeSearch}%,lead_phone.ilike.%${safeSearch}%,lead_email.ilike.%${safeSearch}%`,
    );
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as unknown as EventRow[];
  const profiles = new Map<string, LeadProfile>();

  for (const row of rows) {
    const phone = eventPhone(row);
    const key = buildContactKey(row.client_id, phone, row.ghl_contact_id);

    if (!profiles.has(key)) {
      profiles.set(key, {
        contact_key: key,
        client_id: row.client_id,
        client_name: clientName(row.clients),
        lead_name: row.lead_name,
        lead_phone: phone,
        lead_email: row.lead_email,
        created_at: row.occurred_at,
        is_qualified: false,
        is_hot: false,
        is_out_of_state: false,
        loan_amount: null,
        property_value: null,
        ltv: null,
        b1_age: null,
        b2_age: null,
        lead_source: null,
        has_proposal_made: false,
        has_submission_made: false,
        has_loan_funded: false,
        ghl_contact_id: null,
        ghl_location_id: clientRecord(row.clients)?.ghl_location_id ?? null,
        counts: emptyCounts(),
        timeline: [],
      });
    }

    const profile = profiles.get(key)!;
    profile.timeline.push(toTimelineItem(row));
    bumpCounts(profile.counts, row.event_type, row);
    if (PROPOSAL_EVENT_TYPES.has(row.event_type)) profile.has_proposal_made = true;
    if (SUBMISSION_EVENT_TYPES.has(row.event_type)) profile.has_submission_made = true;
    if (FUNDED_EVENT_TYPES.has(row.event_type)) profile.has_loan_funded = true;

    if (row.lead_name && !profile.lead_name) profile.lead_name = row.lead_name;
    if (row.lead_email && !profile.lead_email) profile.lead_email = row.lead_email;
    if (phone && !profile.lead_phone) profile.lead_phone = phone;
    if (row.ghl_contact_id && !profile.ghl_contact_id) profile.ghl_contact_id = row.ghl_contact_id;
    if (!profile.ghl_location_id) {
      profile.ghl_location_id = clientRecord(row.clients)?.ghl_location_id ?? null;
    }

    if (row.event_type === 'lead') {
      if (row.is_qualified === true) profile.is_qualified = true;
      if (row.is_hot === true) profile.is_hot = true;
      if (row.is_out_of_state === true) profile.is_out_of_state = true;
      const la = extractLoanAmount(row.raw);
      const pv = extractPropertyValue(row.raw);
      const ltv = extractLtv(row.raw);
      const b1 = extractB1Age(row.raw);
      const b2 = extractB2Age(row.raw);
      const ls = extractLeadSource(row);
      if (la != null) profile.loan_amount = la;
      if (pv != null) profile.property_value = pv;
      if (ltv != null) profile.ltv = ltv;
      if (b1 != null) profile.b1_age = b1;
      if (b2 != null) profile.b2_age = b2;
      if (ls != null) profile.lead_source = ls;
      if (new Date(row.occurred_at).getTime() < new Date(profile.created_at).getTime()) {
        profile.created_at = row.occurred_at;
        if (row.lead_name) profile.lead_name = row.lead_name;
        if (row.lead_email) profile.lead_email = row.lead_email;
      }
    }
  }

  for (const profile of profiles.values()) {
    profile.timeline.sort(
      (a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime(),
    );
  }

  let sorted = Array.from(profiles.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (conversion_event === 'proposal_made') {
    sorted = sorted.filter((p) => p.has_proposal_made);
  } else if (conversion_event === 'submission_made') {
    sorted = sorted.filter((p) => p.has_submission_made);
  } else if (conversion_event === 'loan_funded') {
    sorted = sorted.filter((p) => p.has_loan_funded);
  }

  const total = sorted.length;
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(offset, offset + PAGE_SIZE);

  return NextResponse.json({
    rows: pageRows,
    total,
    page,
    page_size: PAGE_SIZE,
    events_loaded: rows.length,
    capped: rows.length >= MAX_EVENTS,
  });
}
