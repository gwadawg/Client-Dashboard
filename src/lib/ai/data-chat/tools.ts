import type { AuthContext } from '../../api-auth';
import { calculateMetrics } from '../../metrics';
import { fetchCombinedSpendForMetrics } from '../../spend';
import {
  getLiveClientIds,
  liveClientFilter,
} from '../../db-helpers';
import { computeDialAnalytics } from '../../dial-analytics';
import {
  emptyOutcomeCounts,
  fetchEnrichedBookingsInRange,
  grossShowRate,
  summarizeOutcomesByAgent,
} from '../../agent-appointment-stats';
import { buildRosterMatcher } from '../../agent-roster';
import { fetchAgentEventsInRange } from '../../agent-event-fetch';
import { computeSpeedToLead, type SpeedToLeadEventRow } from '../../speed-to-lead';
import { TOOLS_BY_SCOPE, type DataChatFilters, type DataChatScope } from './scopes';

export type { DataChatFilters, DataChatScope };

const METRICS_EVENT_SELECT =
  'client_id, event_type, ghl_contact_id, lead_phone, lead_email, lead_name, phone_number_used, agent_name, occurred_at, occurred_at_has_time, lead_created_at, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state';

const DIAL_EVENT_SELECT =
  'agent_name, client_id, event_type, is_pickup, is_conversation, is_qualified, speed_to_lead_seconds, occurred_at, occurred_at_has_time, lead_created_at, dial_source, ghl_contact_id, lead_phone, lead_name, phone_number_used';

function resolveClientScope(filters: DataChatFilters, overrideClientId?: string) {
  const client_id = overrideClientId || filters.client_id || null;
  const live_only = !client_id && !!filters.live_only;
  return { client_id, live_only };
}

async function fetchFulfillmentMetrics(ctx: AuthContext, filters: DataChatFilters, overrideClientId?: string) {
  const { client_id, live_only } = resolveClientScope(filters, overrideClientId);
  const { start_date, end_date } = filters;

  let scopedClientIds: string[] | null = null;
  if (live_only) {
    scopedClientIds = await getLiveClientIds(ctx.service);
  }

  let eventsQuery = ctx.service.from('events').select(METRICS_EVENT_SELECT);
  if (client_id) eventsQuery = eventsQuery.eq('client_id', client_id);
  else if (scopedClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(scopedClientIds));
  eventsQuery = eventsQuery
    .gte('occurred_at', `${start_date}T00:00:00.000Z`)
    .lte('occurred_at', `${end_date}T23:59:59.999Z`)
    .limit(100000);

  const [{ data: events, error: eventsError }, spendRows, { data: availability, error: availabilityError }] =
    await Promise.all([
      eventsQuery,
      fetchCombinedSpendForMetrics(ctx.service, {
        client_id: client_id ?? undefined,
        client_ids: scopedClientIds,
        start_date,
        end_date,
      }).then(
        rows => ({ data: rows, error: null as Error | null }),
        (error: Error) => ({ data: null, error }),
      ),
      ctx.service.from('setter_availability').select('weekday, time_start, time_end, is_live'),
    ]);

  if (eventsError) throw new Error(eventsError.message);
  if (spendRows.error) throw new Error(spendRows.error.message);
  if (availabilityError) throw new Error(availabilityError.message);

  const m = calculateMetrics(events ?? [], spendRows.data ?? [], availability ?? []);

  // Trim to the KPIs the model needs — keep tokens low.
  return {
    range: { start_date, end_date },
    scope: client_id ? { client_id } : live_only ? { live_only: true } : { all_clients: true },
    funnel: {
      new_leads: m.new_leads,
      qualified_leads: m.qualified_leads,
      qualified_rate: m.qualified_rate,
      hot_leads: m.hot_leads,
      booked_appointments: m.booked_appointments,
      unique_booked_appointments: m.unique_booked_appointments,
      appt_booking_rate: m.appt_booking_rate,
      shows: m.shows,
      no_shows: m.no_shows,
      show_pct: m.show_pct,
      net_show_pct: m.net_show_pct,
      lo_bailed: m.lo_bailed,
      lo_bail_rate: m.lo_bail_rate,
      live_transfers: m.live_transfers,
      claimed: m.claimed,
      unique_conversations: m.unique_conversations,
      conversation_rate: m.conversation_rate,
      hand_raise_rate: m.hand_raise_rate,
      closed: m.closed,
      funded_loans: m.funded_loans,
    },
    cost: {
      ad_spend: m.ad_spend,
      cpl: m.cpl,
      cp_qualified: m.cp_qualified,
      cp_conversation: m.cp_conversation,
      cp_appt: m.cp_appt,
      cps: m.cps,
    },
    dials: {
      outbound_dials: m.outbound_dials,
      dials_per_lead: m.dials_per_lead,
      pickups: m.pickups,
      pickup_pct: m.pickup_pct,
      conversations: m.conversations,
      conversation_pct: m.conversation_pct,
      speed_to_lead_min: m.speed_to_lead_min,
      speed_to_lead_sample_size: m.speed_to_lead_sample_size,
    },
  };
}

async function listClients(ctx: AuthContext, search?: string) {
  let query = ctx.service
    .from('clients')
    .select('id, name, is_live')
    .order('name')
    .limit(100);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (!search?.trim()) return { clients: rows };

  const q = search.trim().toLowerCase();
  return {
    clients: rows.filter(c => (c.name ?? '').toLowerCase().includes(q)),
  };
}

async function fetchDialPerformance(ctx: AuthContext, filters: DataChatFilters, overrideClientId?: string) {
  const { client_id, live_only } = resolveClientScope(filters, overrideClientId);
  const startDate = filters.start_date;
  const endDate = filters.end_date;

  let liveClientIds: string[] | null = null;
  if (live_only) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  let eventsQuery = ctx.service.from('events').select(DIAL_EVENT_SELECT);
  if (client_id) eventsQuery = eventsQuery.eq('client_id', client_id);
  else if (liveClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(liveClientIds));
  eventsQuery = eventsQuery
    .gte('occurred_at', `${startDate}T00:00:00.000Z`)
    .lte('occurred_at', `${endDate}T23:59:59.999Z`)
    .limit(100000);

  const [
    { data: roster, error: rosterError },
    { data: clients, error: clientsError },
    { data: events, error: eventsError },
    { data: availability, error: availabilityError },
  ] = await Promise.all([
    ctx.service.from('agents').select('name, phone').order('name'),
    ctx.service.from('clients').select('id, name, is_live').order('name'),
    eventsQuery,
    ctx.service.from('setter_availability').select('weekday, time_start, time_end, is_live'),
  ]);

  if (rosterError) throw new Error(rosterError.message);
  if (clientsError) throw new Error(clientsError.message);
  if (eventsError) throw new Error(eventsError.message);
  if (availabilityError) throw new Error(availabilityError.message);

  const result = computeDialAnalytics(
    events ?? [],
    clients ?? [],
    roster ?? [],
    startDate,
    endDate,
    availability ?? [],
  );

  const { summary, agents, clients: clientRows, trend, dial_sources } = result;

  return {
    range: { start_date: startDate, end_date: endDate },
    scope: client_id ? { client_id } : live_only ? { live_only: true } : { all_clients: true },
    summary: {
      dials: summary.dials,
      pickups: summary.pickups,
      pickup_rate: summary.pickup_rate,
      conversations: summary.conversations,
      conversation_rate: summary.conversation_rate,
      leads: summary.leads,
      qualified_leads: summary.qualified_leads,
      dials_per_lead: summary.dials_per_lead,
      appointments: summary.appointments,
      booking_rate: summary.booking_rate,
      avg_speed_to_lead_min: summary.avg_speed_to_lead_min,
      period_days: summary.period_days,
      avg_dials_per_day: summary.avg_dials_per_day,
      today_dials: summary.today_dials,
      today_pickups: summary.today_pickups,
    },
    agents: agents.slice(0, 25).map(a => ({
      agent_name: a.agent_name,
      dials: a.dials,
      pickups: a.pickups,
      pickup_rate: a.pickup_rate,
      conversations: a.conversations,
      conversation_rate: a.conversation_rate,
      appointments: a.appointments,
      avg_speed_to_lead_min: a.avg_speed_to_lead_min,
      dials_per_day: a.dials_per_day,
    })),
    flagged_clients: clientRows
      .filter(c => c.flag)
      .slice(0, 15)
      .map(c => ({
        client_name: c.client_name,
        client_id: c.client_id,
        dials: c.dials,
        pickup_rate: c.pickup_rate,
        dials_per_lead: c.dials_per_lead,
        booking_rate: c.booking_rate,
        flag: c.flag,
        flag_label: c.flag_label,
      })),
    top_clients_by_dials: clientRows.slice(0, 10).map(c => ({
      client_name: c.client_name,
      dials: c.dials,
      pickups: c.pickups,
      pickup_rate: c.pickup_rate,
      appointments: c.appointments,
      booking_rate: c.booking_rate,
    })),
    trend_tail: trend.slice(-14),
    dial_sources: dial_sources.slice(0, 10),
  };
}

async function fetchAgentScorecards(ctx: AuthContext, filters: DataChatFilters) {
  const startDate = filters.start_date;
  const endDate = filters.end_date;

  const [
    { data: roster, error: rosterError },
    data,
    { data: availability, error: availabilityError },
    enrichedBookings,
  ] = await Promise.all([
    ctx.service.from('agents').select('name, phone').order('name'),
    fetchAgentEventsInRange(ctx.service, startDate, endDate),
    ctx.service.from('setter_availability').select('weekday, time_start, time_end, is_live'),
    fetchEnrichedBookingsInRange(ctx.service, startDate, endDate),
  ]);

  if (rosterError) throw new Error(rosterError.message);
  if (availabilityError) throw new Error(availabilityError.message);

  const resolveAgent = buildRosterMatcher(roster ?? []);
  const outcomeByAgent = summarizeOutcomesByAgent(enrichedBookings, resolveAgent);
  const speed = computeSpeedToLead(
    data as SpeedToLeadEventRow[],
    availability ?? [],
    undefined,
    resolveAgent,
  );

  type Acc = {
    agent_name: string;
    dials: number;
    pickups: number;
    conversations: number;
    appointments: number;
    callbacks: number;
    live_transfers: number;
  };

  const agentMap = new Map<string, Acc>();
  for (const agent of roster ?? []) {
    agentMap.set(agent.name, {
      agent_name: agent.name,
      dials: 0,
      pickups: 0,
      conversations: 0,
      appointments: 0,
      callbacks: 0,
      live_transfers: 0,
    });
  }

  for (const row of data) {
    const name = resolveAgent(row.agent_name);
    if (!name) continue;
    const a = agentMap.get(name);
    if (!a) continue;
    if (row.event_type === 'dial') {
      a.dials++;
      if (row.is_pickup) a.pickups++;
      if (row.is_conversation) a.conversations++;
    } else if (row.event_type === 'appointment_booked') {
      a.appointments++;
    } else if (row.event_type === 'callback_booked') {
      a.callbacks++;
    } else if (row.event_type === 'live_transfer') {
      a.live_transfers++;
    }
  }

  const agents = Array.from(agentMap.values())
    .map(a => {
      const outcomes = outcomeByAgent.get(a.agent_name) ?? emptyOutcomeCounts();
      return {
        agent_name: a.agent_name,
        dials: a.dials,
        pickups: a.pickups,
        pickup_rate: a.dials > 0 ? Math.round((a.pickups / a.dials) * 100) : 0,
        conversations: a.conversations,
        conversation_rate: a.dials > 0 ? Math.round((a.conversations / a.dials) * 100) : 0,
        appointments: outcomes.appointments,
        callbacks: a.callbacks,
        live_transfers: a.live_transfers,
        shows: outcomes.shows,
        no_shows: outcomes.no_shows,
        lo_bailed: outcomes.lo_bailed,
        pending: outcomes.pending,
        show_rate: grossShowRate(outcomes),
        avg_speed_to_lead_min: speed.by_agent[a.agent_name]?.median_min ?? null,
      };
    })
    .filter(
      a =>
        a.dials > 0 ||
        a.appointments > 0 ||
        a.callbacks > 0 ||
        a.live_transfers > 0 ||
        a.shows > 0 ||
        a.no_shows > 0,
    )
    .sort((a, b) => b.appointments - a.appointments || a.agent_name.localeCompare(b.agent_name));

  const active = agents.length || 1;
  const team = {
    agents: agents.length,
    dials: agents.reduce((s, a) => s + a.dials, 0),
    pickups: agents.reduce((s, a) => s + a.pickups, 0),
    conversations: agents.reduce((s, a) => s + a.conversations, 0),
    appointments: agents.reduce((s, a) => s + a.appointments, 0),
    shows: agents.reduce((s, a) => s + a.shows, 0),
    no_shows: agents.reduce((s, a) => s + a.no_shows, 0),
    live_transfers: agents.reduce((s, a) => s + a.live_transfers, 0),
    avg_dials_per_agent: Math.round(agents.reduce((s, a) => s + a.dials, 0) / active),
    avg_appointments_per_agent: Math.round((agents.reduce((s, a) => s + a.appointments, 0) / active) * 10) / 10,
  };

  return {
    range: { start_date: startDate, end_date: endDate },
    team,
    agents: agents.slice(0, 30),
  };
}

export async function executeDataChatTool(
  ctx: AuthContext,
  scope: DataChatScope,
  name: string,
  input: Record<string, unknown>,
  filters: DataChatFilters,
): Promise<unknown> {
  const allowed = TOOLS_BY_SCOPE[scope];
  if (!allowed.has(name)) {
    throw new Error(`Tool "${name}" is not available in the ${scope} scope.`);
  }

  const overrideClientId =
    typeof input.client_id === 'string' && input.client_id.trim()
      ? input.client_id.trim()
      : undefined;

  switch (name) {
    case 'get_fulfillment_metrics':
      return fetchFulfillmentMetrics(ctx, filters, overrideClientId);
    case 'list_clients':
      return listClients(ctx, typeof input.search === 'string' ? input.search : undefined);
    case 'get_dial_performance':
      return fetchDialPerformance(ctx, filters, overrideClientId);
    case 'get_agent_scorecards':
      return fetchAgentScorecards(ctx, filters);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
