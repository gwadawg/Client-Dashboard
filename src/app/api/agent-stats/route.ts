import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { buildRosterMatcher } from '@/lib/agent-roster';
import { computeSpeedToLead, type SpeedToLeadEventRow } from '@/lib/speed-to-lead';

type AgentAccumulator = {
  agent_name: string;
  dials: number;
  pickups: number;
  conversations: number;
  appointments: number;
  callbacks: number;
  live_transfers: number;
  shows: number;
  no_shows: number;
};

type TodayStats = {
  dials: number;
  pickups: number;
  appointments: number;
  live_transfers: number;
};

function emptyAccumulator(name: string): AgentAccumulator {
  return {
    agent_name: name,
    dials: 0,
    pickups: 0,
    conversations: 0,
    appointments: 0,
    callbacks: 0,
    live_transfers: 0,
    shows: 0,
    no_shows: 0,
  };
}

function emptyToday(): TodayStats {
  return { dials: 0, pickups: 0, appointments: 0, live_transfers: 0 };
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['agents', 'agent_scorecards']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  let eventsQuery = ctx.service
    .from('events')
    .select('agent_name, client_id, event_type, is_pickup, is_conversation, speed_to_lead_seconds, occurred_at, occurred_at_has_time, lead_created_at, ghl_contact_id, lead_phone, phone_number_used');

  if (startDate) eventsQuery = eventsQuery.gte('occurred_at', `${startDate}T00:00:00.000Z`);
  if (endDate) eventsQuery = eventsQuery.lte('occurred_at', `${endDate}T23:59:59.999Z`);

  const [
    { data: roster, error: rosterError },
    { data, error },
    { data: availability, error: availabilityError },
  ] = await Promise.all([
    ctx.service.from('agents').select('name, phone').order('name'),
    eventsQuery,
    ctx.service.from('setter_availability').select('weekday, time_start, time_end, is_live'),
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (availabilityError) return NextResponse.json({ error: availabilityError.message }, { status: 500 });

  const resolveAgent = buildRosterMatcher(roster ?? []);

  const speed = computeSpeedToLead(
    (data ?? []) as SpeedToLeadEventRow[],
    availability ?? [],
    undefined,
    resolveAgent,
  );
  const agentMap = new Map<string, AgentAccumulator>();
  for (const agent of roster ?? []) {
    agentMap.set(agent.name, emptyAccumulator(agent.name));
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayMap = new Map<string, TodayStats>();
  for (const agent of roster ?? []) {
    todayMap.set(agent.name, emptyToday());
  }

  for (const row of data ?? []) {
    const name = resolveAgent(row.agent_name);
    if (!name) continue;

    const a = agentMap.get(name)!;
    const t = todayMap.get(name)!;
    const isToday = row.occurred_at?.startsWith(todayStr);

    if (row.event_type === 'dial') {
      a.dials++;
      if (row.is_pickup) a.pickups++;
      if (row.is_conversation) a.conversations++;
      if (isToday) {
        t.dials++;
        if (row.is_pickup) t.pickups++;
      }
    } else if (row.event_type === 'appointment_booked') {
      a.appointments++;
      if (isToday) t.appointments++;
    } else if (row.event_type === 'callback_booked') {
      a.callbacks++;
    } else if (row.event_type === 'live_transfer') {
      a.live_transfers++;
      if (isToday) t.live_transfers++;
    } else if (row.event_type === 'show') {
      a.shows++;
    } else if (row.event_type === 'no_show') {
      a.no_shows++;
    }
  }

  function hasActivity(a: AgentAccumulator, today: TodayStats) {
    return (
      a.dials > 0 ||
      a.appointments > 0 ||
      a.callbacks > 0 ||
      a.live_transfers > 0 ||
      a.shows > 0 ||
      a.no_shows > 0 ||
      today.dials > 0 ||
      today.appointments > 0 ||
      today.live_transfers > 0
    );
  }

  const agents = Array.from(agentMap.values())
    .filter(a => hasActivity(a, todayMap.get(a.agent_name) ?? emptyToday()))
    .map(a => {
      const todayStats = todayMap.get(a.agent_name) ?? emptyToday();
      const avg_speed = speed.by_agent[a.agent_name]?.median_min ?? null;
      return {
        agent_name: a.agent_name,
        dials: a.dials,
        pickups: a.pickups,
        pickup_rate: a.dials > 0 ? Math.round((a.pickups / a.dials) * 100) : 0,
        conversations: a.conversations,
        conversation_rate: a.dials > 0 ? Math.round((a.conversations / a.dials) * 100) : 0,
        appointments: a.appointments,
        callbacks: a.callbacks,
        live_transfers: a.live_transfers,
        shows: a.shows,
        no_shows: a.no_shows,
        show_rate: (a.shows + a.no_shows) > 0 ? Math.round((a.shows / (a.shows + a.no_shows)) * 100) : 0,
        avg_speed_to_lead_min: avg_speed,
        today: todayStats,
      };
    });

  agents.sort((a, b) => b.appointments - a.appointments || a.agent_name.localeCompare(b.agent_name));

  const activeCount = agents.length || 1;
  const teamTotals = agents.reduce(
    (acc, a) => ({
      dials: acc.dials + a.dials,
      pickups: acc.pickups + a.pickups,
      appointments: acc.appointments + a.appointments,
      live_transfers: acc.live_transfers + a.live_transfers,
      shows: acc.shows + a.shows,
      no_shows: acc.no_shows + a.no_shows,
    }),
    { dials: 0, pickups: 0, appointments: 0, live_transfers: 0, shows: 0, no_shows: 0 },
  );

  const team_averages = {
    dials: Math.round(teamTotals.dials / activeCount),
    pickups: Math.round(teamTotals.pickups / activeCount),
    appointments: Math.round(teamTotals.appointments / activeCount),
    live_transfers: Math.round(teamTotals.live_transfers / activeCount),
    shows: Math.round(teamTotals.shows / activeCount),
    pickup_rate: teamTotals.dials > 0 ? Math.round((teamTotals.pickups / teamTotals.dials) * 100) : 0,
    show_rate:
      teamTotals.shows + teamTotals.no_shows > 0
        ? Math.round((teamTotals.shows / (teamTotals.shows + teamTotals.no_shows)) * 100)
        : 0,
  };

  return NextResponse.json({ agents, team_averages });
}
