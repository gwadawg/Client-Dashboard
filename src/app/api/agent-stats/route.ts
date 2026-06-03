import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { buildRosterMatcher } from '@/lib/agent-roster';

type AgentAccumulator = {
  agent_name: string;
  dials: number;
  pickups: number;
  conversations: number;
  appointments: number;
  callbacks: number;
  shows: number;
  no_shows: number;
  speed_readings: number[];
};

function emptyAccumulator(name: string): AgentAccumulator {
  return {
    agent_name: name,
    dials: 0,
    pickups: 0,
    conversations: 0,
    appointments: 0,
    callbacks: 0,
    shows: 0,
    no_shows: 0,
    speed_readings: [],
  };
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  // Powers both the Agent Stats table and the Scorecards view.
  const denied = requireAnyPermission(ctx, ['agent_stats', 'agent_scorecards']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  let eventsQuery = ctx.service
    .from('events')
    .select('agent_name, event_type, is_pickup, is_conversation, speed_to_lead_seconds, occurred_at');

  if (startDate) eventsQuery = eventsQuery.gte('occurred_at', `${startDate}T00:00:00.000Z`);
  if (endDate) eventsQuery = eventsQuery.lte('occurred_at', `${endDate}T23:59:59.999Z`);

  const [{ data: roster, error: rosterError }, { data, error }] = await Promise.all([
    ctx.service.from('agents').select('name, phone').order('name'),
    eventsQuery,
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resolveAgent = buildRosterMatcher(roster ?? []);
  const agentMap = new Map<string, AgentAccumulator>();
  for (const agent of roster ?? []) {
    agentMap.set(agent.name, emptyAccumulator(agent.name));
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayMap = new Map<string, { dials: number; pickups: number; appointments: number }>();
  for (const agent of roster ?? []) {
    todayMap.set(agent.name, { dials: 0, pickups: 0, appointments: 0 });
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
      if (row.speed_to_lead_seconds != null) a.speed_readings.push(Number(row.speed_to_lead_seconds));
      if (isToday) {
        t.dials++;
        if (row.is_pickup) t.pickups++;
      }
    } else if (row.event_type === 'appointment_booked') {
      a.appointments++;
      if (isToday) t.appointments++;
    } else if (row.event_type === 'callback_booked') {
      a.callbacks++;
    } else if (row.event_type === 'show') {
      a.shows++;
    } else if (row.event_type === 'no_show') {
      a.no_shows++;
    }
  }

  function hasActivity(a: AgentAccumulator, today: { dials: number; pickups: number; appointments: number }) {
    return (
      a.dials > 0 ||
      a.appointments > 0 ||
      a.callbacks > 0 ||
      a.shows > 0 ||
      a.no_shows > 0 ||
      today.dials > 0 ||
      today.appointments > 0
    );
  }

  const agents = Array.from(agentMap.values())
    .filter(a => hasActivity(a, todayMap.get(a.agent_name) ?? { dials: 0, pickups: 0, appointments: 0 }))
    .map(a => {
    const todayStats = todayMap.get(a.agent_name) ?? { dials: 0, pickups: 0, appointments: 0 };
    const avg_speed = a.speed_readings.length > 0
      ? Math.round(a.speed_readings.reduce((x, y) => x + y, 0) / a.speed_readings.length / 60 * 10) / 10
      : null;
    return {
      agent_name: a.agent_name,
      dials: a.dials,
      pickups: a.pickups,
      pickup_rate: a.dials > 0 ? Math.round((a.pickups / a.dials) * 100) : 0,
      conversations: a.conversations,
      conversation_rate: a.dials > 0 ? Math.round((a.conversations / a.dials) * 100) : 0,
      appointments: a.appointments,
      callbacks: a.callbacks,
      shows: a.shows,
      no_shows: a.no_shows,
      show_rate: (a.shows + a.no_shows) > 0 ? Math.round((a.shows / (a.shows + a.no_shows)) * 100) : 0,
      avg_speed_to_lead_min: avg_speed,
      today: todayStats,
    };
  });

  agents.sort((a, b) => b.appointments - a.appointments || a.agent_name.localeCompare(b.agent_name));
  return NextResponse.json({ agents });
}
