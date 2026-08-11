import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  emptyOutcomeCounts,
  fetchEnrichedBookingsInRange,
  grossShowRate,
  summarizeOutcomesByAgent,
} from '@/lib/agent-appointment-stats';
import {
  countCallRepCreditsByAgent,
  emptyCallRepCreditCounts,
  showEventsPayWindowOrFilter,
  type CallRepCreditEvent,
} from '@/lib/agent-call-rep-credits';
import { buildRosterMatcher } from '@/lib/agent-roster';
import { fetchAgentEventsInRange } from '@/lib/agent-event-fetch';
import { computeSpeedToLead, type SpeedToLeadEventRow } from '@/lib/speed-to-lead';
import {
  calendarMonthOf,
  countShowLtConversationsByAgent,
} from '@/lib/agent-show-lt-conversations';
import { isCallCenterFloorPayType } from '@/lib/employee-positions';
import { createTtlCache } from '@/lib/ttl-cache';
import { hydrateOutcomeAgentsFromBookings } from '@/lib/appointments';
import { needsAgentCredit } from '@/lib/credit-queue-eligibility';
import { filterShowsOncePerLead, fetchPaidShowLeadKeys } from '@/lib/payroll-show-once';
import { showPayDate } from '@/lib/agent-commissions';
import { computeVerticalEffort } from '@/lib/agent-vertical-effort';
import { todayYmdInCallCenterTz, ymdInTimeZone } from '@/lib/time';

const agentStatsCache = createTtlCache<unknown>(45_000);

const SHOW_EVENT_SELECT =
  'id, client_id, event_type, agent_name, occurred_at, scheduled_at, external_id, lead_name, lead_phone, lead_email, ghl_contact_id, raw';

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

type ShowEventRow = {
  id: string;
  event_type: string;
  agent_name: string | null;
  occurred_at: string | null;
  scheduled_at: string | null;
  external_id: string | null;
  raw: { recorded_at?: string } | null;
  client_id: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  lead_email: string | null;
  ghl_contact_id: string | null;
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

async function fetchShowEventsForPayWindow(
  service: Parameters<typeof hydrateOutcomeAgentsFromBookings>[0],
  startDate: string,
  endDate: string,
): Promise<ShowEventRow[]> {
  const rows: ShowEventRow[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    const { data, error } = await service
      .from('events')
      .select(SHOW_EVENT_SELECT)
      .eq('event_type', 'show')
      .or(showEventsPayWindowOrFilter(startDate, endDate))
      .range(from, from + page - 1);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    rows.push(...(data as ShowEventRow[]));
    if (data.length < page) break;
  }
  return rows;
}

/**
 * Hydrate null show agents from bookings + payroll once-per-lead filter
 * (in-period dupes + already-paid lead keys — same as call-rep payroll build).
 */
async function preparePayShows(
  service: Parameters<typeof hydrateOutcomeAgentsFromBookings>[0],
  showRows: ShowEventRow[],
  resolveAgent: (raw: string | null | undefined) => string | null,
  startDate: string,
  endDate: string,
  paidLeadKeys: Set<string>,
): Promise<ShowEventRow[]> {
  let hydrated = showRows;
  if (showRows.some(row => needsAgentCredit(row.agent_name))) {
    try {
      const result = await hydrateOutcomeAgentsFromBookings(service, showRows, {
        persist: false,
      });
      hydrated = result.rows;
    } catch (e) {
      console.error('[agent-stats] hydrate show agents failed', e);
    }
  }

  const filtered = filterShowsOncePerLead(hydrated, {
    resolveAgent,
    startDate,
    endDate,
    paidLeadKeys,
  });

  const allowedIds = new Set(filtered.allowed.map(r => r.id));
  return hydrated.filter(row => {
    if (!allowedIds.has(row.id)) return false;
    const d = showPayDate({
      scheduled_at: row.scheduled_at,
      occurred_at: row.occurred_at,
      raw: row.raw ? { recorded_at: row.raw.recorded_at ?? undefined } : null,
    });
    return Boolean(d && d >= startDate && d <= endDate);
  });
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

  const cacheKey = [
    startDate ?? '',
    endDate ?? '',
    includeAllRoster ? '1' : '0',
    // Period-scoped show/LT (no silent month window); manager floor fields
    'manager-floor-v2',
  ].join('|');
  const cached = agentStatsCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  }

  // goal_month is only for loading monthly conversation goals — not a second data window
  const monthBounds = calendarMonthOf(endDate);
  const hasRange = Boolean(startDate && endDate);

  const [
    { data: roster, error: rosterError },
    data,
    { data: availability, error: availabilityError },
    { data: clients, error: clientsError },
    enrichedBookings,
    rangeShowEvents,
  ] = await Promise.all([
    ctx.service.from('agents').select('name, phone, active, pay_type').order('name'),
    fetchAgentEventsInRange(ctx.service, startDate, endDate),
    ctx.service.from('setter_availability').select('weekday, time_start, time_end, is_live'),
    ctx.service.from('clients').select('id, name, reporting_type').order('name'),
    fetchEnrichedBookingsInRange(ctx.service, startDate, endDate),
    hasRange
      ? fetchShowEventsForPayWindow(ctx.service, startDate!, endDate!)
      : Promise.resolve([] as ShowEventRow[]),
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (availabilityError) return NextResponse.json({ error: availabilityError.message }, { status: 500 });
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });

  const activeRoster = (roster ?? []).filter(
    a => a.active !== false && isCallCenterFloorPayType(a.pay_type),
  );
  const resolveAgent = buildRosterMatcher(activeRoster);
  // Booking dispositions still power no-show / pending / cancelled coaching stats.
  const outcomeByAgent = summarizeOutcomesByAgent(enrichedBookings, resolveAgent);

  let payShowsForRange: ShowEventRow[] = [];
  if (hasRange) {
    let paidLeadKeys = new Set<string>();
    try {
      paidLeadKeys = await fetchPaidShowLeadKeys(ctx.service);
    } catch (e) {
      console.error('[agent-stats] fetchPaidShowLeadKeys failed', e);
    }

    payShowsForRange = await preparePayShows(
      ctx.service,
      rangeShowEvents,
      resolveAgent,
      startDate!,
      endDate!,
      paidLeadKeys,
    );
  }

  const creditEvents = data.filter(
    r => r.event_type === 'appointment_booked' || r.event_type === 'live_transfer',
  ) as CallRepCreditEvent[];

  const creditsByAgent =
    hasRange
      ? countCallRepCreditsByAgent(
          creditEvents,
          payShowsForRange,
          resolveAgent,
          startDate!,
          endDate!,
        )
      : new Map();

  // Show/LT conversations match the selected period (same window as dials / pay credits)
  const liveTransfersForShowLt = data.filter(r => r.event_type === 'live_transfer');
  const showLtByAgent = countShowLtConversationsByAgent(
    payShowsForRange,
    liveTransfersForShowLt,
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

  const todayStr = todayYmdInCallCenterTz();
  const todayMap = new Map<string, TodayStats>();
  for (const agent of activeRoster) {
    todayMap.set(agent.name, emptyToday());
  }

  for (const row of data) {
    const name = resolveAgent(row.agent_name);
    if (!name) continue;

    const a = agentMap.get(name)!;
    const t = todayMap.get(name)!;
    const isToday = row.occurred_at
      ? ymdInTimeZone(new Date(row.occurred_at)) === todayStr
      : false;

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

  // Vertical dial effort from the same period dials (client_id → reporting_type).
  // Not roster-filtered: counts every dial attributed to a client.
  const vertical_effort = computeVerticalEffort(data, clients ?? []);

  function hasActivity(
    a: AgentAccumulator,
    outcomes: ReturnType<typeof emptyOutcomeCounts>,
    credits: ReturnType<typeof emptyCallRepCreditCounts>,
    today: TodayStats,
    showLt: number,
  ) {
    return (
      a.dials > 0 ||
      a.appointments > 0 ||
      a.callbacks > 0 ||
      a.live_transfers > 0 ||
      credits.bookings > 0 ||
      credits.shows > 0 ||
      credits.live_transfers > 0 ||
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
      const credits = creditsByAgent.get(a.agent_name) ?? emptyCallRepCreditCounts();
      const showLt = showLtByAgent.get(a.agent_name) ?? 0;
      return hasActivity(a, outcomes, credits, todayMap.get(a.agent_name) ?? emptyToday(), showLt);
    })
    .map(a => {
      const todayStats = todayMap.get(a.agent_name) ?? emptyToday();
      const outcomes = outcomeByAgent.get(a.agent_name) ?? emptyOutcomeCounts();
      const credits = creditsByAgent.get(a.agent_name) ?? emptyCallRepCreditCounts();
      const avg_speed = speed.by_agent[a.agent_name]?.median_min ?? null;

      // Headline Appts / Shows / Transfers match payroll call-rep credits.
      const appointments = credits.bookings;
      const shows = credits.shows;
      const live_transfers = credits.live_transfers;

      // True Show quality on booking dispositions (no-show / LO bail / cancel still from slots).
      // Numerator uses pay-credited shows so the card doesn't disagree with payroll.
      const dispositioned =
        shows + outcomes.no_shows + outcomes.lo_bailed + outcomes.cancelled;
      const show_rate =
        dispositioned > 0
          ? Math.round((shows / dispositioned) * 100)
          : grossShowRate(outcomes);

      return {
        agent_name: a.agent_name,
        dials: a.dials,
        pickups: a.pickups,
        pickup_rate: a.dials > 0 ? Math.round((a.pickups / a.dials) * 100) : 0,
        conversations: a.conversations,
        conversation_rate: a.dials > 0 ? Math.round((a.conversations / a.dials) * 100) : 0,
        show_lt_conversations: showLtByAgent.get(a.agent_name) ?? 0,
        appointments,
        callbacks: a.callbacks,
        live_transfers,
        shows,
        no_shows: outcomes.no_shows,
        lo_bailed: outcomes.lo_bailed,
        pending: outcomes.pending,
        cancelled: outcomes.cancelled,
        rescheduled: outcomes.rescheduled,
        show_rate,
        avg_speed_to_lead_min: avg_speed,
        today: todayStats,
      };
    });

  agents.sort((a, b) => b.appointments - a.appointments || a.agent_name.localeCompare(b.agent_name));

  const teamOutcomeTotals = agents.reduce(
    (acc, a) => ({
      appointments: acc.appointments + a.appointments,
      shows: acc.shows + a.shows,
      no_shows: acc.no_shows + a.no_shows,
      lo_bailed: acc.lo_bailed + a.lo_bailed,
      cancelled: acc.cancelled + a.cancelled,
      dials: acc.dials + a.dials,
      pickups: acc.pickups + a.pickups,
      conversations: acc.conversations + a.conversations,
      live_transfers: acc.live_transfers + a.live_transfers,
      callbacks: acc.callbacks + a.callbacks,
      show_lt_conversations: acc.show_lt_conversations + (a.show_lt_conversations ?? 0),
    }),
    {
      appointments: 0,
      shows: 0,
      no_shows: 0,
      lo_bailed: 0,
      cancelled: 0,
      dials: 0,
      pickups: 0,
      conversations: 0,
      live_transfers: 0,
      callbacks: 0,
      show_lt_conversations: 0,
    },
  );

  const teamDispositioned =
    teamOutcomeTotals.shows +
    teamOutcomeTotals.no_shows +
    teamOutcomeTotals.lo_bailed +
    teamOutcomeTotals.cancelled;

  const teamPickupRate =
    teamOutcomeTotals.dials > 0
      ? Math.round((teamOutcomeTotals.pickups / teamOutcomeTotals.dials) * 100)
      : 0;
  // Ops KPI: conversations ÷ pickups (docs/KPIS.md).
  const teamConversationRate =
    teamOutcomeTotals.pickups > 0
      ? Math.round((teamOutcomeTotals.conversations / teamOutcomeTotals.pickups) * 100)
      : 0;
  const teamShowRate =
    teamDispositioned > 0
      ? Math.round((teamOutcomeTotals.shows / teamDispositioned) * 100)
      : 0;

  const team_totals = {
    dials: teamOutcomeTotals.dials,
    pickups: teamOutcomeTotals.pickups,
    conversations: teamOutcomeTotals.conversations,
    appointments: teamOutcomeTotals.appointments,
    live_transfers: teamOutcomeTotals.live_transfers,
    shows: teamOutcomeTotals.shows,
    no_shows: teamOutcomeTotals.no_shows,
    lo_bailed: teamOutcomeTotals.lo_bailed,
    cancelled: teamOutcomeTotals.cancelled,
    callbacks: teamOutcomeTotals.callbacks,
    show_lt_conversations: teamOutcomeTotals.show_lt_conversations,
    pickup_rate: teamPickupRate,
    conversation_rate: teamConversationRate,
    show_rate: teamShowRate,
  };

  const team_today = agents.reduce(
    (acc, a) => ({
      dials: acc.dials + a.today.dials,
      pickups: acc.pickups + a.today.pickups,
      appointments: acc.appointments + a.today.appointments,
      live_transfers: acc.live_transfers + a.today.live_transfers,
    }),
    { dials: 0, pickups: 0, appointments: 0, live_transfers: 0 },
  );
  const team_today_with_rate = {
    ...team_today,
    pickup_rate:
      team_today.dials > 0 ? Math.round((team_today.pickups / team_today.dials) * 100) : 0,
  };

  // Per-rep averages over active floor only (dials or any credit outcome in range).
  const activeAgents = agents.filter(
    a =>
      a.dials > 0 ||
      a.appointments > 0 ||
      a.shows > 0 ||
      a.live_transfers > 0 ||
      a.callbacks > 0 ||
      (a.show_lt_conversations ?? 0) > 0 ||
      a.today.dials > 0,
  );
  const activeCount = activeAgents.length || 1;
  const activeSum = activeAgents.reduce(
    (acc, a) => ({
      dials: acc.dials + a.dials,
      pickups: acc.pickups + a.pickups,
      appointments: acc.appointments + a.appointments,
      live_transfers: acc.live_transfers + a.live_transfers,
      shows: acc.shows + a.shows,
      show_lt: acc.show_lt + (a.show_lt_conversations ?? 0),
      callbacks: acc.callbacks + a.callbacks,
      conversations: acc.conversations + a.conversations,
    }),
    {
      dials: 0,
      pickups: 0,
      appointments: 0,
      live_transfers: 0,
      shows: 0,
      show_lt: 0,
      callbacks: 0,
      conversations: 0,
    },
  );

  const team_averages = {
    dials: Math.round(activeSum.dials / activeCount),
    pickups: Math.round(activeSum.pickups / activeCount),
    appointments: Math.round(activeSum.appointments / activeCount),
    live_transfers: Math.round(activeSum.live_transfers / activeCount),
    shows: Math.round(activeSum.shows / activeCount),
    show_lt_conversations: Math.round(activeSum.show_lt / activeCount),
    callbacks: Math.round(activeSum.callbacks / activeCount),
    conversations: Math.round(activeSum.conversations / activeCount),
    pickup_rate: teamPickupRate,
    conversation_rate: teamConversationRate,
    show_rate: teamShowRate,
    active_rep_count: activeAgents.length,
  };

  const payload = {
    agents,
    team_totals,
    team_today: team_today_with_rate,
    team_averages,
    vertical_effort,
    goal_month: monthBounds.month,
    // Echo the window used so the UI can label honestly
    period: {
      start_date: startDate,
      end_date: endDate,
    },
  };
  agentStatsCache.set(cacheKey, payload);
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'private, max-age=20' },
  });
}
