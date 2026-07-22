import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  fetchEnrichedBookingsInRange,
  outcomeSummaryFromRows,
  type EnrichedAgentBooking,
} from '@/lib/agent-appointment-stats';
import { buildRosterMatcher, rosterAliasesForAgent } from '@/lib/agent-roster';

const TRANSFER_SELECT =
  'id, occurred_at, lead_name, lead_phone, lead_email, agent_name, clients(name)';

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

  const enriched = await fetchEnrichedBookingsInRange(ctx.service, startDate, endDate, {
    agentNameAliases: rosterAliasesForAgent(roster ?? [], agentName),
  });
  const agentRows = enriched.filter(row => belongsToAgent(row.agent_name));
  const summary = outcomeSummaryFromRows(agentRows);

  const rows = agentRows.map(toActivityRow);
  const offset = (page - 1) * limit;
  const pageRows = rows.slice(offset, offset + limit);

  return NextResponse.json({
    tab: 'appointments',
    summary: {
      appointments: summary.appointments,
      shows: summary.shows,
      no_shows: summary.no_shows,
      pending: summary.pending,
      cancelled: summary.cancelled,
      rescheduled: summary.rescheduled,
      lo_bailed: summary.lo_bailed,
      live_transfers: 0,
    },
    rows: pageRows,
    total: rows.length,
    page,
    limit,
  });
}

function toActivityRow(row: EnrichedAgentBooking) {
  return {
    id: row.id,
    occurred_at: row.occurred_at,
    scheduled_at: row.scheduled_at,
    external_id: row.external_id,
    calendar_name: row.calendar_name,
    lead_name: row.lead_name,
    lead_phone: row.lead_phone,
    lead_email: row.lead_email,
    client_name: row.clients?.name ?? null,
    status: row.status,
    outcome_id: row.outcome_id,
  };
}
