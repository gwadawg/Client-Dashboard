import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import {
  OUTCOME_EVENT_TYPES,
  buildOutcomeIndex,
  matchOutcome,
  normalizeAppointmentStatus,
  setAppointmentOutcome,
  type BookingKey,
  type OutcomeRecord,
} from '@/lib/appointments';

// Each raw data type is its own tab/permission.
const RAW_TYPE_VIEW: Record<string, string> = {
  leads: 'leads',
  dials: 'dials',
  appointments: 'appointments',
  speed_to_lead: 'speed_to_lead',
  ad_spend: 'ad_spend',
  meta_ad_insights: 'meta_ad_insights',
};

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get('type'); // leads | dials | appointments | speed_to_lead | ad_spend | meta_ad_insights
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const search = searchParams.get('search')?.trim();
  const page = parseInt(searchParams.get('page') ?? '1');
  const limit = 100;
  const offset = (page - 1) * limit;

  if (!type) return NextResponse.json({ error: 'type is required' }, { status: 400 });

  const view = RAW_TYPE_VIEW[type];
  if (!view) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  const denied = requirePermission(ctx, view);
  if (denied) return denied;

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  if (type === 'meta_ad_insights') {
    let q = ctx.service
      .from('meta_ad_insights')
      .select(
        'id, insight_date, account_id, campaign_id, campaign_name, adset_id, ad_id, spend, impressions, clicks, cpm, cpc, ctr, clients(name)',
        { count: 'exact' },
      )
      .order('insight_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (client_id) q = q.eq('client_id', client_id);
    else if (liveClientIds) q = q.in('client_id', liveClientFilter(liveClientIds));
    if (start_date) q = q.gte('insight_date', start_date);
    if (end_date) q = q.lte('insight_date', end_date);

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data, total: count });
  }

  if (type === 'ad_spend') {
    let q = ctx.service
      .from('ad_spend')
      .select('id, spend_date, platform, amount, clients(name)', { count: 'exact' })
      .neq('platform', 'meta')
      .order('spend_date', { ascending: false })
      .range(offset, offset + limit - 1);

    if (client_id) q = q.eq('client_id', client_id);
    else if (liveClientIds) q = q.in('client_id', liveClientFilter(liveClientIds));
    if (start_date) q = q.gte('spend_date', start_date);
    if (end_date) q = q.lte('spend_date', end_date);

    const { data, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ rows: data, total: count });
  }

  // Appointments are grouped one-row-per-booking: each booked appointment is
  // returned once with its current disposition (status) derived from the linked
  // outcome event (show / no_show / appointment_cancelled / lo_bailed), or
  // "pending" when none exists yet.
  if (type === 'appointments') {
    return getGroupedAppointments(ctx, {
      client_id,
      liveClientIds,
      start_date,
      end_date,
      search,
      statusFilter: searchParams.get('status'),
      page,
      limit,
      offset,
    });
  }

  const eventTypeMap: Record<string, string[]> = {
    leads:          ['lead'],
    dials:          ['dial'],
    speed_to_lead:  ['dial'],
  };

  const eventTypes = eventTypeMap[type];
  if (!eventTypes) return NextResponse.json({ error: 'Invalid type' }, { status: 400 });

  let q = ctx.service
    .from('events')
    .select('id, event_type, occurred_at, duration_seconds, is_pickup, is_conversation, speed_to_lead_seconds, lead_name, lead_phone, lead_email, agent_name, direction, call_status, recording_url, phone_number_used, dial_source, calendar_name, calendar_id, external_id, stage_booked, scheduled_at, clients(name)', { count: 'exact' })
    .in('event_type', eventTypes)
    .order('occurred_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (client_id) q = q.eq('client_id', client_id);
  else if (liveClientIds) q = q.in('client_id', liveClientFilter(liveClientIds));
  if (start_date) q = q.gte('occurred_at', `${start_date}T00:00:00.000Z`);
  if (end_date)   q = q.lte('occurred_at', `${end_date}T23:59:59.999Z`);

  if (search) {
    // Sanitize chars that have special meaning in PostgREST or() / ilike filters
    const safe = search.replace(/[,()*]/g, ' ').trim();
    if (safe) q = q.or(`lead_name.ilike.%${safe}%,lead_phone.ilike.%${safe}%,lead_email.ilike.%${safe}%`);
  }

  if (type === 'speed_to_lead') q = q.not('speed_to_lead_seconds', 'is', null);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data, total: count });
}

// ─────────────────────────────────────────────────────────────────────────────
// Grouped appointments (one row per booking + derived disposition)
// ─────────────────────────────────────────────────────────────────────────────

type AuthCtx = Exclude<Awaited<ReturnType<typeof getAuthContext>>, NextResponse>;

const BOOKING_SELECT =
  'id, event_type, occurred_at, scheduled_at, external_id, calendar_id, calendar_name, stage_booked, lead_name, lead_phone, lead_email, agent_name, ghl_contact_id, clients(name, ghl_location_id)';

type GroupedParams = {
  client_id: string | null;
  liveClientIds: string[] | null;
  start_date: string | null;
  end_date: string | null;
  search: string | undefined;
  statusFilter: string | null;
  page: number;
  limit: number;
  offset: number;
};

// Fetch every row matching `build`, paging past PostgREST's per-request cap.
async function fetchAll<R>(
  build: (from: number, to: number) => PromiseLike<{ data: R[] | null; error: { message: string } | null }>,
  hardCap = 10000,
): Promise<R[]> {
  const chunk = 1000;
  const rows: R[] = [];
  for (let from = 0; from < hardCap; from += chunk) {
    const { data, error } = await build(from, from + chunk - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < chunk) break;
  }
  return rows;
}

async function getGroupedAppointments(ctx: AuthCtx, p: GroupedParams) {
  try {
    // "Pending only": the actionable backlog — appointments whose scheduled date
    // has already passed but have no outcome. Resolved via anti-join in memory.
    // Deliberately NOT date-filtered so it reconciles with the dashboard banner.
    if (p.statusFilter === 'pending') {
      const nowIso = new Date().toISOString();
      const bookings = await fetchAll<Record<string, unknown>>((from, to) => {
        let bq = ctx.service
          .from('events')
          .select(BOOKING_SELECT)
          .eq('event_type', 'appointment_booked')
          .not('scheduled_at', 'is', null)
          .lt('scheduled_at', nowIso);
        if (p.client_id) bq = bq.eq('client_id', p.client_id);
        else if (p.liveClientIds) bq = bq.in('client_id', liveClientFilter(p.liveClientIds));
        if (p.search) {
          const safe = p.search.replace(/[,()*]/g, ' ').trim();
          if (safe) bq = bq.or(`lead_name.ilike.%${safe}%,lead_phone.ilike.%${safe}%,lead_email.ilike.%${safe}%`);
        }
        return bq.order('scheduled_at', { ascending: false }).range(from, to);
      });

      // Outcomes in the same client scope (no date bound — an outcome resolves
      // its booking whenever it was recorded).
      const outcomes = await fetchAll<OutcomeRecord>((from, to) => {
        let oq = ctx.service
          .from('events')
          .select('external_id, raw, ghl_contact_id, scheduled_at')
          .in('event_type', [...OUTCOME_EVENT_TYPES]);
        if (p.client_id) oq = oq.eq('client_id', p.client_id);
        else if (p.liveClientIds) oq = oq.in('client_id', liveClientFilter(p.liveClientIds));
        return oq.range(from, to);
      });

      const index = buildOutcomeIndex(outcomes);
      const pending = bookings.filter(b => !matchOutcome(b as unknown as BookingKey, index));

      const rows = pending
        .slice(p.offset, p.offset + p.limit)
        .map(b => ({ ...b, status: 'pending', outcome_id: null }));
      return NextResponse.json({ rows, total: pending.length });
    }

    // Default: DB-paginate bookings, then attach each page row's status.
    let bq = ctx.service
      .from('events')
      .select(BOOKING_SELECT, { count: 'exact' })
      .eq('event_type', 'appointment_booked');
    if (p.client_id) bq = bq.eq('client_id', p.client_id);
    else if (p.liveClientIds) bq = bq.in('client_id', liveClientFilter(p.liveClientIds));
    if (p.start_date) bq = bq.gte('occurred_at', `${p.start_date}T00:00:00.000Z`);
    if (p.end_date) bq = bq.lte('occurred_at', `${p.end_date}T23:59:59.999Z`);
    if (p.search) {
      const safe = p.search.replace(/[,()*]/g, ' ').trim();
      if (safe) bq = bq.or(`lead_name.ilike.%${safe}%,lead_phone.ilike.%${safe}%,lead_email.ilike.%${safe}%`);
    }

    const { data: bookings, error, count } = await bq
      .order('occurred_at', { ascending: false })
      .range(p.offset, p.offset + p.limit - 1);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const pageBookings = bookings ?? [];

    // Outcomes are linked to bookings mainly by lead + appointment time, so pull
    // every outcome for this page's contacts (id-based links are a subset). One
    // query, matched in memory by matchOutcome.
    const contactIds = Array.from(
      new Set(pageBookings.map(b => b.ghl_contact_id as string | null).filter((v): v is string => !!v)),
    );

    let outcomes: OutcomeRecord[] = [];
    if (contactIds.length) {
      const { data, error: oErr } = await ctx.service
        .from('events')
        .select('id, event_type, external_id, raw, ghl_contact_id, scheduled_at')
        .in('event_type', [...OUTCOME_EVENT_TYPES])
        .in('ghl_contact_id', contactIds);
      if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
      outcomes = (data ?? []) as OutcomeRecord[];
    }

    const index = buildOutcomeIndex(outcomes);
    const rows = pageBookings.map(b => {
      const outcome = matchOutcome(b as unknown as BookingKey, index);
      return { ...b, status: outcome?.event_type ?? 'pending', outcome_id: outcome?.id ?? null };
    });

    return NextResponse.json({ rows, total: count });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load appointments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual disposition: set an appointment's status from the dashboard.
// Gated by the same "appointments" tab permission used to read this data.
// Body: { appointment_event_id: string, status: "pending" | "show" | "no_show"
//         | "cancelled" | "lo_bailed" }
// ─────────────────────────────────────────────────────────────────────────────
export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const denied = requirePermission(ctx, 'appointments');
  if (denied) return denied;

  let payload: { appointment_event_id?: string; status?: string };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const appointment_event_id = payload.appointment_event_id;
  if (!appointment_event_id) {
    return NextResponse.json({ error: 'appointment_event_id is required' }, { status: 400 });
  }

  const status = normalizeAppointmentStatus(payload.status);
  if (!status) {
    return NextResponse.json(
      { error: 'status must be "pending", "show", "no_show", "cancelled", or "lo_bailed"' },
      { status: 400 },
    );
  }

  const result = await setAppointmentOutcome(ctx.service, { appointment_event_id, status });
  return NextResponse.json(result.body, { status: result.status });
}
