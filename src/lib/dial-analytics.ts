import { buildRosterMatcher, type RosterAgent } from "@/lib/agent-roster";
import {
  computeSpeedToLead,
  type AvailabilityWindow,
  type SpeedToLeadResult,
} from "@/lib/speed-to-lead";
import { CALL_CENTER_TIMEZONE } from "@/lib/time";

export type DialEventRow = {
  agent_name: string | null;
  client_id: string | null;
  event_type: string;
  is_pickup: boolean | null;
  is_conversation: boolean | null;
  is_qualified: boolean | null;
  speed_to_lead_seconds: number | null;
  occurred_at: string;
  dial_source: string | null;
  ghl_contact_id: string | null;
  lead_phone: string | null;
  phone_number_used: string | null;
  occurred_at_has_time: boolean | null;
  lead_created_at: string | null;
};

export type ClientRef = {
  id: string;
  name: string;
  is_live?: boolean | null;
};

export type DialAnalyticsSummary = {
  dials: number;
  pickups: number;
  pickup_rate: number;
  conversations: number;
  conversation_rate: number;
  leads: number;
  qualified_leads: number;
  dials_per_lead: number;
  appointments: number;
  booking_rate: number;
  /** Median minutes from lead to first dial (in-window, precise timestamps only). */
  avg_speed_to_lead_min: number | null;
  /** Full speed-to-lead breakdown: median, sample size, and exclusion counts. */
  speed_to_lead: SpeedToLeadResult;
  today_dials: number;
  today_pickups: number;
  period_days: number;
  avg_dials_per_day: number;
};

export type DialAnalyticsAgentRow = {
  agent_name: string;
  dials: number;
  pickups: number;
  pickup_rate: number;
  conversations: number;
  conversation_rate: number;
  appointments: number;
  avg_speed_to_lead_min: number | null;
  dials_per_day: number;
  today: { dials: number; pickups: number; appointments: number };
};

export type ClientDialFlag = "low_pickup" | "high_effort" | "low_conversion" | null;

export type DialAnalyticsClientRow = {
  client_id: string;
  client_name: string;
  is_live: boolean;
  dials: number;
  pickups: number;
  pickup_rate: number;
  leads: number;
  qualified_leads: number;
  dials_per_lead: number;
  conversations: number;
  appointments: number;
  booking_rate: number;
  flag: ClientDialFlag;
  flag_label: string | null;
};

export type DialAnalyticsTrendPoint = {
  date: string;
  dials: number;
  pickups: number;
  pickup_rate: number;
  conversations: number;
};

export type DialSourceRow = {
  source: string;
  dials: number;
  pickups: number;
  pickup_rate: number;
};

export type DialAnalyticsResult = {
  summary: DialAnalyticsSummary;
  agents: DialAnalyticsAgentRow[];
  clients: DialAnalyticsClientRow[];
  trend: DialAnalyticsTrendPoint[];
  dial_sources: DialSourceRow[];
};

type AgentAcc = {
  agent_name: string;
  dials: number;
  pickups: number;
  conversations: number;
  appointments: number;
  today: { dials: number; pickups: number; appointments: number };
};

type ClientAcc = {
  client_id: string;
  dials: number;
  pickups: number;
  conversations: number;
  leads: number;
  qualified_leads: number;
  appointments: number;
};

function periodDays(startDate: string | null, endDate: string | null): number {
  if (!startDate || !endDate) return 1;
  const start = new Date(`${startDate}T00:00:00.000Z`).getTime();
  const end = new Date(`${endDate}T00:00:00.000Z`).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 1;
  return Math.max(1, Math.floor((end - start) / 86400000) + 1);
}

function pct(num: number, den: number): number {
  return den > 0 ? Math.round((num / den) * 100) : 0;
}

export function computeDialAnalytics(
  events: DialEventRow[],
  clients: ClientRef[],
  roster: RosterAgent[],
  startDate: string | null,
  endDate: string | null,
  availability: AvailabilityWindow[] = [],
  timeZone: string = CALL_CENTER_TIMEZONE,
): DialAnalyticsResult {
  const resolveAgent = buildRosterMatcher(roster);
  const clientById = new Map(clients.map(c => [c.id, c]));
  const days = periodDays(startDate, endDate);
  const todayStr = new Date().toISOString().split("T")[0];

  // Speed-to-lead is computed honestly via lead↔first-dial pairing: precise timestamps
  // only, in-window only, summarized as a median (see src/lib/speed-to-lead.ts).
  const speed = computeSpeedToLead(events, availability, timeZone, resolveAgent);

  const agentMap = new Map<string, AgentAcc>();
  const clientMap = new Map<string, ClientAcc>();
  const trendMap = new Map<string, { dials: number; pickups: number; conversations: number }>();
  const sourceMap = new Map<string, { dials: number; pickups: number }>();

  let summaryDials = 0;
  let summaryPickups = 0;
  let summaryConversations = 0;
  let summaryLeads = 0;
  let summaryQualified = 0;
  let summaryAppointments = 0;
  let todayDials = 0;
  let todayPickups = 0;

  for (const row of events) {
    const day = row.occurred_at?.slice(0, 10) ?? "";
    const isToday = day === todayStr;

    if (row.event_type === "lead") {
      summaryLeads++;
      if (row.is_qualified) summaryQualified++;
      if (row.client_id) {
        const c = ensureClient(clientMap, row.client_id);
        c.leads++;
        if (row.is_qualified) c.qualified_leads++;
      }
      continue;
    }

    if (row.event_type === "appointment_booked") {
      summaryAppointments++;
      const agent = resolveAgentName(resolveAgent, row.agent_name, agentMap);
      if (agent) {
        agent.appointments++;
        if (isToday) agent.today.appointments++;
      }
      if (row.client_id) ensureClient(clientMap, row.client_id).appointments++;
      continue;
    }

    if (row.event_type !== "dial") continue;

    summaryDials++;
    if (row.is_pickup) summaryPickups++;
    if (row.is_conversation) summaryConversations++;
    if (isToday) {
      todayDials++;
      if (row.is_pickup) todayPickups++;
    }

    const trend = trendMap.get(day) ?? { dials: 0, pickups: 0, conversations: 0 };
    trend.dials++;
    if (row.is_pickup) trend.pickups++;
    if (row.is_conversation) trend.conversations++;
    trendMap.set(day, trend);

    const sourceKey = (row.dial_source?.trim() || "Unknown").slice(0, 80);
    const src = sourceMap.get(sourceKey) ?? { dials: 0, pickups: 0 };
    src.dials++;
    if (row.is_pickup) src.pickups++;
    sourceMap.set(sourceKey, src);

    const agent = resolveAgentName(resolveAgent, row.agent_name, agentMap);
    if (agent) {
      agent.dials++;
      if (row.is_pickup) agent.pickups++;
      if (row.is_conversation) agent.conversations++;
      if (isToday) {
        agent.today.dials++;
        if (row.is_pickup) agent.today.pickups++;
      }
    }

    if (row.client_id) {
      const c = ensureClient(clientMap, row.client_id);
      c.dials++;
      if (row.is_pickup) c.pickups++;
      if (row.is_conversation) c.conversations++;
    }
  }

  const teamPickupRate = pct(summaryPickups, summaryDials);
  const teamDialsPerLead = summaryLeads > 0 ? summaryDials / summaryLeads : 0;
  const teamBookingRate = pct(summaryAppointments, summaryQualified > 0 ? summaryQualified : summaryLeads);

  const clientRows: DialAnalyticsClientRow[] = Array.from(clientMap.entries())
    .map(([client_id, acc]) => {
      const meta = clientById.get(client_id);
      const bookingDenom = acc.qualified_leads > 0 ? acc.qualified_leads : acc.leads;
      const pickup_rate = pct(acc.pickups, acc.dials);
      const dials_per_lead = acc.leads > 0 ? Math.round((acc.dials / acc.leads) * 10) / 10 : 0;
      const booking_rate = pct(acc.appointments, bookingDenom);

      let flag: ClientDialFlag = null;
      let flag_label: string | null = null;
      if (acc.dials >= 20 && teamPickupRate > 0 && pickup_rate < teamPickupRate * 0.7) {
        flag = "low_pickup";
        flag_label = "Low pickup vs team";
      } else if (acc.leads >= 5 && teamDialsPerLead > 0 && dials_per_lead > teamDialsPerLead * 1.5) {
        flag = "high_effort";
        flag_label = "High dial effort per lead";
      } else if (acc.leads >= 10 && booking_rate < Math.max(5, teamBookingRate * 0.5)) {
        flag = "low_conversion";
        flag_label = "Low booking rate";
      }

      return {
        client_id,
        client_name: meta?.name ?? client_id,
        is_live: meta?.is_live !== false,
        dials: acc.dials,
        pickups: acc.pickups,
        pickup_rate,
        leads: acc.leads,
        qualified_leads: acc.qualified_leads,
        dials_per_lead,
        conversations: acc.conversations,
        appointments: acc.appointments,
        booking_rate,
        flag,
        flag_label,
      };
    })
    .filter(r => r.dials > 0 || r.leads > 0)
    .sort((a, b) => b.dials - a.dials || a.client_name.localeCompare(b.client_name));

  const agents: DialAnalyticsAgentRow[] = Array.from(agentMap.values())
    .filter(a => a.dials > 0 || a.appointments > 0)
    .map(a => ({
      agent_name: a.agent_name,
      dials: a.dials,
      pickups: a.pickups,
      pickup_rate: pct(a.pickups, a.dials),
      conversations: a.conversations,
      conversation_rate: pct(a.conversations, a.dials),
      appointments: a.appointments,
      avg_speed_to_lead_min: speed.by_agent[a.agent_name]?.median_min ?? null,
      dials_per_day: Math.round((a.dials / days) * 10) / 10,
      today: a.today,
    }))
    .sort((a, b) => b.dials - a.dials || a.agent_name.localeCompare(b.agent_name));

  const trend: DialAnalyticsTrendPoint[] = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, t]) => ({
      date,
      dials: t.dials,
      pickups: t.pickups,
      pickup_rate: pct(t.pickups, t.dials),
      conversations: t.conversations,
    }));

  const dial_sources: DialSourceRow[] = Array.from(sourceMap.entries())
    .map(([source, s]) => ({
      source,
      dials: s.dials,
      pickups: s.pickups,
      pickup_rate: pct(s.pickups, s.dials),
    }))
    .sort((a, b) => b.dials - a.dials);

  return {
    summary: {
      dials: summaryDials,
      pickups: summaryPickups,
      pickup_rate: pct(summaryPickups, summaryDials),
      conversations: summaryConversations,
      conversation_rate: pct(summaryConversations, summaryDials),
      leads: summaryLeads,
      qualified_leads: summaryQualified,
      dials_per_lead: summaryLeads > 0 ? Math.round((summaryDials / summaryLeads) * 10) / 10 : 0,
      appointments: summaryAppointments,
      booking_rate: pct(summaryAppointments, summaryQualified > 0 ? summaryQualified : summaryLeads),
      avg_speed_to_lead_min: speed.median_min,
      speed_to_lead: speed,
      today_dials: todayDials,
      today_pickups: todayPickups,
      period_days: days,
      avg_dials_per_day: Math.round((summaryDials / days) * 10) / 10,
    },
    agents,
    clients: clientRows,
    trend,
    dial_sources,
  };
}

function ensureClient(map: Map<string, ClientAcc>, clientId: string): ClientAcc {
  let acc = map.get(clientId);
  if (!acc) {
    acc = {
      client_id: clientId,
      dials: 0,
      pickups: 0,
      conversations: 0,
      leads: 0,
      qualified_leads: 0,
      appointments: 0,
    };
    map.set(clientId, acc);
  }
  return acc;
}

function resolveAgentName(
  resolveAgent: (raw: string | null | undefined) => string | null,
  raw: string | null,
  map: Map<string, AgentAcc>,
): AgentAcc | null {
  const name = resolveAgent(raw) ?? raw?.trim();
  if (!name) return null;
  let acc = map.get(name);
  if (!acc) {
    acc = {
      agent_name: name,
      dials: 0,
      pickups: 0,
      conversations: 0,
      appointments: 0,
      today: { dials: 0, pickups: 0, appointments: 0 },
    };
    map.set(name, acc);
  }
  return acc;
}
