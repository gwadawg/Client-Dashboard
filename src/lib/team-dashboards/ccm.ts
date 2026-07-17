/**
 * CCM Command aggregator — floor pace, under-KPI CCM lens, day context.
 */

import {
  emptyOutcomeCounts,
  fetchEnrichedBookingsInRange,
  grossShowRate,
  summarizeOutcomesByAgent,
} from '@/lib/agent-appointment-stats';
import { fetchAgentEventsInRange } from '@/lib/agent-event-fetch';
import { buildRosterMatcher } from '@/lib/agent-roster';
import { TIER_LABEL, type HealthTier, type KpiGrade, KPI_META } from '@/lib/client-health';
import { getDateRange, ymdLocal } from '@/lib/date-presets';
import { ccmStatus, gradesForLens, TIER_WEIGHT } from '@/lib/dept-health';
import { usesCallCenterKpiLayout } from '@/lib/kpi-layouts';
import { defaultHealthGradingRange, loadClientHealthBundle } from '@/lib/load-client-health';
import { buildDayContext, type DayContext } from '@/lib/team-dashboards/ccm-playbook';
import type { createServiceClient } from '@/lib/supabase';

export type CcmFloorSnapshot = {
  today: { dials: number; bookings: number; conversations: number };
  week: {
    dials: number;
    bookings: number;
    shows: number;
    no_shows: number;
    show_rate: number | null;
  };
  dial_goal_today: number | null;
  dial_pace_pct: number | null;
  under_kpi_count: number;
  status: 'on_track' | 'behind' | 'critical' | 'unknown';
};

export type CcmAgentCard = {
  agent_name: string;
  today_dials: number;
  today_bookings: number;
  today_conversations: number;
  week_dials: number;
  week_bookings: number;
  week_show_rate: number | null;
  dial_goal: number | null;
  dial_pace_pct: number | null;
  pace_status: 'on_track' | 'behind' | 'critical' | 'unknown';
  live_status: 'pending';
};

export type CcmUnderKpiClient = {
  client_id: string;
  client_name: string;
  reporting_type: string;
  ccm_tier: HealthTier;
  ccm_tier_label: string;
  constraint: string;
  constraint_label: string;
  red_kpis: string[];
  attention_score: number;
};

export type CcmCommandPayload = {
  generated_at: string;
  today: string;
  week_period: { start: string; end: string };
  health_period: { start: string; end: string };
  floor: CcmFloorSnapshot;
  agents: CcmAgentCard[];
  underKpiClients: CcmUnderKpiClient[];
  dayContext: DayContext;
  errors: { floor?: string; agents?: string; underKpi?: string };
};

type GoalRow = {
  agent_name: string | null;
  metric: string;
  target: number;
  period: string;
};

function paceStatus(
  dials: number,
  goal: number | null,
  dayElapsed: number | null,
): { pace_pct: number | null; status: CcmAgentCard['pace_status'] } {
  if (goal == null || goal <= 0) return { pace_pct: null, status: 'unknown' };
  const dialPct = dials / goal;
  if (dayElapsed == null || dayElapsed <= 0) {
    return {
      pace_pct: Math.round(dialPct * 100),
      status: dialPct >= 1 ? 'on_track' : 'unknown',
    };
  }
  const expected = dayElapsed;
  const ratio = dialPct / expected;
  const pace_pct = Math.round(dialPct * 100);
  if (ratio >= 0.9) return { pace_pct, status: 'on_track' };
  if (ratio >= 0.7) return { pace_pct, status: 'behind' };
  return { pace_pct, status: 'critical' };
}

function redKpisForCcm(grades: KpiGrade[]): string[] {
  return gradesForLens(grades, 'ccm')
    .filter(g => g.tier === 'critical' || g.tier === 'below')
    .map(g => KPI_META[g.key]?.short ?? g.label);
}

export async function buildCcmCommandPayload(
  service: ReturnType<typeof createServiceClient>,
): Promise<CcmCommandPayload> {
  const today = new Date().toISOString().split('T')[0];
  const todayLocal = ymdLocal(new Date());
  const weekRange = getDateRange('last_7');
  const healthRange = defaultHealthGradingRange();
  const dayContext = buildDayContext(new Date());
  const errors: CcmCommandPayload['errors'] = {};

  let floor: CcmFloorSnapshot = {
    today: { dials: 0, bookings: 0, conversations: 0 },
    week: { dials: 0, bookings: 0, shows: 0, no_shows: 0, show_rate: null },
    dial_goal_today: null,
    dial_pace_pct: null,
    under_kpi_count: 0,
    status: 'unknown',
  };
  let agents: CcmAgentCard[] = [];
  let underKpiClients: CcmUnderKpiClient[] = [];

  const [rosterRes, goalsRes, healthResult, agentEvents, enrichedBookings] =
    await Promise.all([
      service.from('agents').select('name, phone, pay_type, active').order('name'),
      service.from('goals').select('agent_name, metric, target, period'),
      loadClientHealthBundle(service, {
        start_date: healthRange.start,
        end_date: healthRange.end,
        live_only: true,
      }).catch((e: unknown) => {
        errors.underKpi = e instanceof Error ? e.message : String(e);
        return null;
      }),
      fetchAgentEventsInRange(service, weekRange.start, weekRange.end).catch(
        (e: unknown) => {
          errors.floor = e instanceof Error ? e.message : String(e);
          return [] as Awaited<ReturnType<typeof fetchAgentEventsInRange>>;
        },
      ),
      fetchEnrichedBookingsInRange(service, weekRange.start, weekRange.end).catch(
        (e: unknown) => {
          errors.agents = e instanceof Error ? e.message : String(e);
          return [] as Awaited<ReturnType<typeof fetchEnrichedBookingsInRange>>;
        },
      ),
    ]);

  if (rosterRes.error) {
    errors.agents = rosterRes.error.message;
  }

  const roster = (rosterRes.data ?? []).filter(
    a => a.active !== false && (!a.pay_type || a.pay_type === 'call_rep'),
  );
  const callRepNames = new Set(roster.map(a => a.name));
  const resolveAgent = buildRosterMatcher(roster);
  const outcomeByAgent = summarizeOutcomesByAgent(enrichedBookings, resolveAgent);

  const goals = (goalsRes.data ?? []) as GoalRow[];
  const dialGoalByAgent = new Map<string, number>();
  let teamDialGoal = 0;
  let teamDialGoalCount = 0;
  for (const g of goals) {
    if (g.metric !== 'dials' || g.period !== 'daily') continue;
    if (g.agent_name && callRepNames.has(g.agent_name)) {
      dialGoalByAgent.set(g.agent_name, Number(g.target));
      teamDialGoal += Number(g.target);
      teamDialGoalCount++;
    }
  }

  type Acc = {
    agent_name: string;
    week_dials: number;
    week_conversations: number;
    today_dials: number;
    today_bookings: number;
    today_conversations: number;
  };
  const agentMap = new Map<string, Acc>();
  for (const name of callRepNames) {
    agentMap.set(name, {
      agent_name: name,
      week_dials: 0,
      week_conversations: 0,
      today_dials: 0,
      today_bookings: 0,
      today_conversations: 0,
    });
  }

  for (const row of agentEvents) {
    const name = resolveAgent(row.agent_name);
    if (!name || !callRepNames.has(name)) continue;
    const a = agentMap.get(name)!;
    const isToday = row.occurred_at?.startsWith(today);
    if (row.event_type === 'dial') {
      a.week_dials++;
      if (row.is_conversation) a.week_conversations++;
      if (isToday) {
        a.today_dials++;
        if (row.is_conversation) a.today_conversations++;
      }
    } else if (row.event_type === 'appointment_booked' && isToday) {
      a.today_bookings++;
    }
  }

  agents = Array.from(agentMap.values())
    .map(a => {
      const outcomes = outcomeByAgent.get(a.agent_name) ?? emptyOutcomeCounts();
      const dial_goal = dialGoalByAgent.get(a.agent_name) ?? null;
      const { pace_pct, status } = paceStatus(
        a.today_dials,
        dial_goal,
        dayContext.day_elapsed_pct,
      );
      const show_rate =
        outcomes.shows + outcomes.no_shows + outcomes.lo_bailed > 0
          ? grossShowRate(outcomes)
          : null;
      return {
        agent_name: a.agent_name,
        today_dials: a.today_dials,
        today_bookings: a.today_bookings,
        today_conversations: a.today_conversations,
        week_dials: a.week_dials,
        week_bookings: outcomes.appointments,
        week_show_rate: show_rate,
        dial_goal,
        dial_pace_pct: pace_pct,
        pace_status: status,
        live_status: 'pending' as const,
      };
    })
    .filter(
      a =>
        a.today_dials > 0 ||
        a.today_bookings > 0 ||
        a.week_dials > 0 ||
        a.week_bookings > 0 ||
        a.dial_goal != null,
    )
    .sort((a, b) => {
      const rank = (s: CcmAgentCard['pace_status']) =>
        s === 'critical' ? 0 : s === 'behind' ? 1 : s === 'unknown' ? 2 : 3;
      return (
        rank(a.pace_status) - rank(b.pace_status) ||
        (a.dial_pace_pct ?? 999) - (b.dial_pace_pct ?? 999) ||
        a.agent_name.localeCompare(b.agent_name)
      );
    });

  const teamTodayDials = agents.reduce((s, a) => s + a.today_dials, 0);
  const teamTodayBookings = agents.reduce((s, a) => s + a.today_bookings, 0);
  const teamTodayConv = agents.reduce((s, a) => s + a.today_conversations, 0);
  const teamWeekDials = agents.reduce((s, a) => s + a.week_dials, 0);
  const teamWeekBookings = agents.reduce((s, a) => s + a.week_bookings, 0);

  let teamShows = 0;
  let teamNoShows = 0;
  let teamLoBailed = 0;
  for (const a of agents) {
    const o = outcomeByAgent.get(a.agent_name) ?? emptyOutcomeCounts();
    teamShows += o.shows;
    teamNoShows += o.no_shows;
    teamLoBailed += o.lo_bailed;
  }
  const showDenom = teamShows + teamNoShows + teamLoBailed;
  const weekShowRate =
    showDenom > 0 ? Math.round((teamShows / showDenom) * 100) : null;

  const dial_goal_today = teamDialGoalCount > 0 ? teamDialGoal : null;
  const floorPace = paceStatus(
    teamTodayDials,
    dial_goal_today,
    dayContext.day_elapsed_pct,
  );

  if (healthResult) {
    underKpiClients = healthResult.clients
      .filter(r => r.is_live !== false && r.has_activity && !r.is_fresh_launch)
      .map(r => {
        const isHe = usesCallCenterKpiLayout(r.reporting_type);
        const tier = ccmStatus(r, isHe);
        return { row: r, tier, isHe };
      })
      .filter(({ tier }) => tier === 'critical' || tier === 'below')
      .map(({ row, tier }) => {
        const red_kpis = redKpisForCcm(row.current.grades);
        return {
          client_id: row.client_id,
          client_name: row.client_name,
          reporting_type: row.reporting_type,
          ccm_tier: tier,
          ccm_tier_label: TIER_LABEL[tier],
          constraint: row.current.constraint,
          constraint_label: row.current.constraint_label,
          red_kpis:
            red_kpis.length > 0
              ? red_kpis
              : [row.current.constraint_label || 'CCM KPI'],
          attention_score: row.current.attention_score,
        };
      })
      .sort(
        (a, b) =>
          TIER_WEIGHT[b.ccm_tier] - TIER_WEIGHT[a.ccm_tier] ||
          b.attention_score - a.attention_score ||
          a.client_name.localeCompare(b.client_name),
      );
  }

  floor = {
    today: {
      dials: teamTodayDials,
      bookings: teamTodayBookings,
      conversations: teamTodayConv,
    },
    week: {
      dials: teamWeekDials,
      bookings: teamWeekBookings,
      shows: teamShows,
      no_shows: teamNoShows,
      show_rate: weekShowRate,
    },
    dial_goal_today,
    dial_pace_pct: floorPace.pace_pct,
    under_kpi_count: underKpiClients.length,
    status: floorPace.status,
  };

  return {
    generated_at: new Date().toISOString(),
    today: todayLocal,
    week_period: weekRange,
    health_period: { start: healthRange.start, end: healthRange.end },
    floor,
    agents,
    underKpiClients,
    dayContext,
    errors,
  };
}
