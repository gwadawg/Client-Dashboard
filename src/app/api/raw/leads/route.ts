import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
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
  stage_booked: string | null;
  ghl_contact_id: string | null;
  phone_number_used: string | null;
  is_qualified: boolean | null;
  is_hot: boolean | null;
  is_out_of_state: boolean | null;
  clients: { name: string } | { name: string }[] | null;
};

function clientName(clients: EventRow['clients']): string {
  if (!clients) return '—';
  if (Array.isArray(clients)) return clients[0]?.name ?? '—';
  return clients.name;
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
  cancellations: number;
  callbacks: number;
  live_transfers: number;
  proposals: number;
  closed: number;
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
  counts: LeadCounts;
  timeline: TimelineItem[];
};

function emptyCounts(): LeadCounts {
  return {
    dials: 0,
    pickups: 0,
    conversations: 0,
    appointments_booked: 0,
    shows: 0,
    no_shows: 0,
    cancellations: 0,
    callbacks: 0,
    live_transfers: 0,
    proposals: 0,
    closed: 0,
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
    case 'appointment_cancelled':
      counts.cancellations++;
      break;
    case 'callback_booked':
      counts.callbacks++;
      break;
    case 'live_transfer':
      counts.live_transfers++;
      break;
    case 'proposal_sent':
      counts.proposals++;
      break;
    case 'closed':
      counts.closed++;
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
    stage_booked: row.stage_booked,
    recording_url: row.recording_url,
  };
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let q = ctx.service
    .from('events')
    .select(
      'id, client_id, event_type, occurred_at, scheduled_at, duration_seconds, is_pickup, is_conversation, speed_to_lead_seconds, lead_name, lead_phone, lead_email, agent_name, direction, call_status, recording_url, phone_number_used, calendar_name, stage_booked, ghl_contact_id, is_qualified, is_hot, is_out_of_state, clients(name)',
    )
    .order('occurred_at', { ascending: false })
    .limit(MAX_EVENTS);

  if (client_id) q = q.eq('client_id', client_id);
  else if (liveClientIds) q = q.in('client_id', liveClientFilter(liveClientIds));
  if (start_date) q = q.gte('occurred_at', `${start_date}T00:00:00.000Z`);
  if (end_date) q = q.lte('occurred_at', `${end_date}T23:59:59.999Z`);

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
        counts: emptyCounts(),
        timeline: [],
      });
    }

    const profile = profiles.get(key)!;
    profile.timeline.push(toTimelineItem(row));
    bumpCounts(profile.counts, row.event_type, row);

    if (row.lead_name && !profile.lead_name) profile.lead_name = row.lead_name;
    if (row.lead_email && !profile.lead_email) profile.lead_email = row.lead_email;
    if (phone && !profile.lead_phone) profile.lead_phone = phone;

    if (row.event_type === 'lead') {
      if (row.is_qualified === true) profile.is_qualified = true;
      if (row.is_hot === true) profile.is_hot = true;
      if (row.is_out_of_state === true) profile.is_out_of_state = true;
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

  const sorted = Array.from(profiles.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

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
