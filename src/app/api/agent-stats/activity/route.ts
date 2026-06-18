import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { buildRosterMatcher } from '@/lib/agent-roster';
import {
  OUTCOME_EVENT_TYPES,
  buildOutcomeIndex,
  matchOutcome,
  type BookingKey,
  type OutcomeRecord,
} from '@/lib/appointments';

const BOOKING_SELECT =
  'id, client_id, occurred_at, scheduled_at, external_id, calendar_name, lead_name, lead_phone, lead_email, agent_name, ghl_contact_id, clients(name)';

const TRANSFER_SELECT =
  'id, occurred_at, lead_name, lead_phone, lead_email, agent_name, clients(name)';

type AppointmentStatus = 'pending' | 'show' | 'no_show' | 'appointment_cancelled' | 'lo_bailed';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'agent_scorecards']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const agentName = searchParams.get('agent_name')?.trim();
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const tab = searchParams.get('tab') ?? 'appointments';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

  if (!agentName) {
    return NextResponse.json({ error: 'agent_name is required' }, { status: 400 });
  }

  const { data: roster, error: rosterError } = await ctx.service
    .from('agents')
    .select('name, phone')
    .order('name');

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });

  const resolveAgent = buildRosterMatcher(roster ?? []);
  if (!roster?.some(a => a.name === agentName)) {
    return NextResponse.json({ error: 'Agent not found on roster' }, { status: 404 });
  }

  const belongsToAgent = (raw: string | null | undefined) => resolveAgent(raw) === agentName;

  if (tab === 'live_transfers') {
    let q = ctx.service
      .from('events')
      .select(TRANSFER_SELECT)
      .eq('event_type', 'live_transfer')
      .order('occurred_at', { ascending: false });

    if (startDate) q = q.gte('occurred_at', `${startDate}T00:00:00.000Z`);
    if (endDate) q = q.lte('occurred_at', `${endDate}T23:59:59.999Z`);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const filtered = (data ?? []).filter(row => belongsToAgent(row.agent_name));
    const offset = (page - 1) * limit;
    const pageRows = filtered.slice(offset, offset + limit).map(row => ({
      id: row.id,
      occurred_at: row.occurred_at,
      lead_name: row.lead_name,
      lead_phone: row.lead_phone,
      lead_email: row.lead_email,
      client_name: (row.clients as { name?: string } | null)?.name ?? null,
    }));

    return NextResponse.json({
      tab: 'live_transfers',
      summary: { live_transfers: filtered.length },
      rows: pageRows,
      total: filtered.length,
      page,
      limit,
    });
  }

  // Appointments: one row per booking with derived disposition.
  let q = ctx.service
    .from('events')
    .select(BOOKING_SELECT)
    .eq('event_type', 'appointment_booked')
    .order('occurred_at', { ascending: false });

  if (startDate) q = q.gte('occurred_at', `${startDate}T00:00:00.000Z`);
  if (endDate) q = q.lte('occurred_at', `${endDate}T23:59:59.999Z`);

  const { data: bookings, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const agentBookings = (bookings ?? []).filter(row => belongsToAgent(row.agent_name));

  const contactIds = Array.from(
    new Set(agentBookings.map(b => b.ghl_contact_id as string | null).filter((v): v is string => !!v)),
  );

  let outcomes: OutcomeRecord[] = [];
  if (contactIds.length) {
    const { data: outcomeRows, error: oErr } = await ctx.service
      .from('events')
      .select('id, event_type, external_id, raw, ghl_contact_id, scheduled_at')
      .in('event_type', [...OUTCOME_EVENT_TYPES])
      .in('ghl_contact_id', contactIds);
    if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 });
    outcomes = (outcomeRows ?? []) as OutcomeRecord[];
  }

  const index = buildOutcomeIndex(outcomes);
  const rows = agentBookings.map(b => {
    const outcome = matchOutcome(b as unknown as BookingKey, index);
    const status = (outcome?.event_type ?? 'pending') as AppointmentStatus;
    return {
      id: b.id,
      occurred_at: b.occurred_at,
      scheduled_at: b.scheduled_at,
      external_id: b.external_id,
      calendar_name: b.calendar_name,
      lead_name: b.lead_name,
      lead_phone: b.lead_phone,
      lead_email: b.lead_email,
      client_name: (b.clients as { name?: string } | null)?.name ?? null,
      status,
      outcome_id: outcome?.id ?? null,
    };
  });

  const summary = {
    appointments: rows.length,
    shows: rows.filter(r => r.status === 'show').length,
    no_shows: rows.filter(r => r.status === 'no_show').length,
    pending: rows.filter(r => r.status === 'pending').length,
    cancelled: rows.filter(r => r.status === 'appointment_cancelled').length,
    lo_bailed: rows.filter(r => r.status === 'lo_bailed').length,
    live_transfers: 0,
  };

  const offset = (page - 1) * limit;
  const pageRows = rows.slice(offset, offset + limit);

  return NextResponse.json({
    tab: 'appointments',
    summary,
    rows: pageRows,
    total: rows.length,
    page,
    limit,
  });
}
