import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  emptyOutcomeCounts,
  fetchEnrichedBookingsInRange,
  grossShowRate,
  summarizeOutcomesByAgent,
} from '@/lib/agent-appointment-stats';
import { buildRosterMatcher } from '@/lib/agent-roster';
import { fetchAgentEventsInRange } from '@/lib/agent-event-fetch';
import { computeSpeedToLead, type SpeedToLeadEventRow } from '@/lib/speed-to-lead';
import {
  calendarMonthOf,
  countShowLtConversationsByAgent,
} from '@/lib/agent-show-lt-conversations';
import { createTtlCache } from '@/lib/ttl-cache';

const agentStatsCache = createTtlCache<unknown>(45_000);

type AgentAccumulator = {
  agent_name: string;
  dials: number;
  pickups: number;
  conversations: number;
  appointments: number;
  callbacks: number;
  live_transfers: number;
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
  const includeAllRoster = searchParams.get('includeAllRoster') === '1';

  const cacheKey = [startDate ?? '', endDate ?? '', includeAllRoster ? '1' : '0'].join('|');
  const cached = agentStatsCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  }

  const monthBounds = calendarMonthOf(endDate);
  const monthMatchesRange =
    startDate === monthBounds.startDate && endDate === monthBounds.endDate;

  const [
    { data: roster, error: rosterError },
    data,
    { data: availability, error: availabilityError },
    enrichedBookings,
    monthBookings,
    monthEvents,
  ] = await Promise.all([
    ctx.service.from('agents').select('name, phone, active').order('name'),
    fetchAgentEventsInRange(ctx.service, startDate, endDate),
    ctx.service.from('setter_availability').select('weekday, time_start, time_end, is_live'),
    fetchEnrichedBookingsInRange(ctx.service, startDate, endDate),
    monthMatchesRange
      ? Promise.resolve(null)
      : fetchEnrichedBookingsInRange(
          ctx.service,
          monthBounds.startDate,
          monthBounds.endDate,
        ),
    monthMatchesRange
      ? Promise.resolve(null)
      : fetchAgentEventsInRange(ctx.service, monthBounds.startDate, monthBounds.endDate),
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (availabilityError) return NextResponse.json({ error: availabilityError.message }, { status: 500 });

  const activeRoster = (roster ?? []).filter(a => a.active !== false);
  const resolveAgent = buildRosterMatcher(activeRoster);
  const outcomeByAgent = summarizeOutcomesByAgent(enrichedBookings, resolveAgent);

  const showLtSourceBookings = monthMatchesRange ? enrichedBookings : (monthBookings ?? []);
  const showLtSourceEvents = monthMatchesRange ? data : (monthEvents ?? []);
  const liveTransfers = showLtSourceEvents.filter(r => r.event_type === 'live_transfer');
  const showLtByAgent = countShowLtConversationsByAgent(
    showLtSourceBookings,
    liveTransfers,
    resolveAgent,
  );

  const speed = computeSpeedToLead(
    data as SpeedToLeadEventRow[],
    availability ?? [],
    undefined,
    resolveAgent,
  );
  const agentMap = new Map<string, AgentAccumulator>();
  for (const agent of activeRoster) {
    agentMap.set(agent.name, emptyAccumulator(agent.name));
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const todayMap = new Map<string, TodayStats>();
  for (const agent of activeRoster) {
    todayMap.set(agent.name, emptyToday());
  }

  for (const row of data) {
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
    }
  }

  function hasActivity(
    a: AgentAccumulator,
    outcomes: ReturnType<typeof emptyOutcomeCounts>,
    today: TodayStats,
    showLt: number,
  ) {
    return (
      a.dials > 0 ||
      a.appointments > 0 ||
      a.callbacks > 0 ||
      a.live_transfers > 0 ||
      outcomes.shows > 0 ||
      outcomes.no_shows > 0 ||
      outcomes.lo_bailed > 0 ||
      outcomes.pending > 0 ||
      today.dials > 0 ||
      today.appointments > 0 ||
      today.live_transfers > 0 ||
      showLt > 0
    );
  }

  const agents = Array.from(agentMap.values())
    .filter(a => {
      if (includeAllRoster) return true;
      const outcomes = outcomeByAgent.get(a.agent_name) ?? emptyOutcomeCounts();
      const showLt = showLtByAgent.get(a.agent_name) ?? 0;
      return hasActivity(a, outcomes, todayMap.get(a.agent_name) ?? emptyToday(), showLt);
    })
    .map(a => {
      const todayStats = todayMap.get(a.agent_name) ?? emptyToday();
      const outcomes = outcomeByAgent.get(a.agent_name) ?? emptyOutcomeCounts();
      const avg_speed = speed.by_agent[a.agent_name]?.median_min ?? null;
      return {
        agent_name: a.agent_name,
        dials: a.dials,
        pickups: a.pickups,
        pickup_rate: a.dials > 0 ? Math.round((a.pickups / a.dials) * 100) : 0,
        conversations: a.conversations,
        conversation_rate: a.dials > 0 ? Math.round((a.conversations / a.dials) * 100) : 0,
        show_lt_conversations: showLtByAgent.get(a.agent_name) ?? 0,
        appointments: outcomes.appointments,
        callbacks: a.callbacks,
        live_transfers: a.live_transfers,
        shows: outcomes.shows,
        no_shows: outcomes.no_shows,
        lo_bailed: outcomes.lo_bailed,
        pending: outcomes.pending,
        cancelled: outcomes.cancelled,
        show_rate: grossShowRate(outcomes),
        avg_speed_to_lead_min: avg_speed,
        today: todayStats,
      };
    });

  agents.sort((a, b) => b.appointments - a.appointments || a.agent_name.localeCompare(b.agent_name));

  const activeCount = agents.length || 1;
  const teamOutcomeTotals = agents.reduce(
    (acc, a) => ({
      appointments: acc.appointments + a.appointments,
      shows: acc.shows + a.shows,
      no_shows: acc.no_shows + a.no_shows,
      lo_bailed: acc.lo_bailed + a.lo_bailed,
      dials: acc.dials + a.dials,
      pickups: acc.pickups + a.pickups,
      live_transfers: acc.live_transfers + a.live_transfers,
    }),
    { appointments: 0, shows: 0, no_shows: 0, lo_bailed: 0, dials: 0, pickups: 0, live_transfers: 0 },
  );

  const team_averages = {
    dials: Math.round(teamOutcomeTotals.dials / activeCount),
    pickups: Math.round(teamOutcomeTotals.pickups / activeCount),
    appointments: Math.round(teamOutcomeTotals.appointments / activeCount),
    live_transfers: Math.round(teamOutcomeTotals.live_transfers / activeCount),
    shows: Math.round(teamOutcomeTotals.shows / activeCount),
    pickup_rate:
      teamOutcomeTotals.dials > 0
        ? Math.round((teamOutcomeTotals.pickups / teamOutcomeTotals.dials) * 100)
        : 0,
    show_rate:
      teamOutcomeTotals.shows + teamOutcomeTotals.no_shows + teamOutcomeTotals.lo_bailed > 0
        ? Math.round(
            (teamOutcomeTotals.shows /
              (teamOutcomeTotals.shows + teamOutcomeTotals.no_shows + teamOutcomeTotals.lo_bailed)) *
              100,
          )
        : 0,
  };

  const payload = {
    agents,
    team_averages,
    goal_month: monthBounds.month,
  };
  agentStatsCache.set(cacheKey, payload);
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=20' },
  });
}
