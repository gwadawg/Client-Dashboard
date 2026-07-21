/**
 * Shared loader for client-health rows — used by /api/client-health and /api/ops-overview.
 * Keeps tier / focus / constraint math in one place (buildClientHealthRow).
 */

import {
  buildClientHealthRow,
  getPriorPeriod,
  getRecentPriorPeriod,
  groupEventsByClient,
  groupSpendByClient,
  maturedWindow,
  calendarLeadingWindow,
  isFreshLaunchClient,
  freshLaunchWindow,
  filterEventsToRange,
  type ClientEventWithDate,
  type ClientHealthRow,
  type ClientKpiBenchmarks,
  type CostWindowSlice,
  type OpenActionSummary,
  type PendingIntervention,
} from '@/lib/client-health';
import { OPEN_ACTION_STATUSES, summarizeOpenAction, type ActionLogRow } from '@/lib/client-health-interventions';
import { normalizeReportingType, usesCallCenterKpiLayout } from '@/lib/kpi-layouts';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import type { EventRow, SpendRow } from '@/lib/metrics';
import type { createServiceClient } from '@/lib/supabase';

const EVENT_SELECT =
  'client_id, occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state, ghl_contact_id, lead_phone, lead_email, lead_name';

type SpendByClientRow = {
  client_id: string;
  spend_date: string;
  amount: number;
  platform?: string;
};

type ActionRow = ActionLogRow;
type ServiceClient = ReturnType<typeof createServiceClient>;

function spendInRange(rows: SpendByClientRow[], start: string, end: string): SpendByClientRow[] {
  return rows.filter(r => r.spend_date >= start && r.spend_date <= end);
}

function pickOpenAction(actions: ActionRow[], today: string): OpenActionSummary | null {
  const open = actions.filter(a =>
    OPEN_ACTION_STATUSES.includes(a.status as (typeof OPEN_ACTION_STATUSES)[number]),
  );
  if (open.length === 0) return null;
  open.sort((a, b) => {
    const ad = a.review_date ?? '9999-12-31';
    const bd = b.review_date ?? '9999-12-31';
    return ad.localeCompare(bd);
  });
  const a = open[0];
  return {
    id: a.id,
    title: a.title,
    review_date: a.review_date,
    status: a.status,
    overdue: !!a.review_date && a.review_date < today,
  };
}

async function fetchMetaSpendByClient(
  service: ServiceClient,
  filters: { start_date: string; end_date: string; client_ids: string[] | null },
): Promise<SpendByClientRow[]> {
  let q = service.from('daily_meta_spend').select('client_id, spend_date, amount');
  if (filters.client_ids?.length) q = q.in('client_id', liveClientFilter(filters.client_ids));
  q = q.gte('spend_date', filters.start_date);
  q = q.lte('spend_date', filters.end_date);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(r => ({
    client_id: String(r.client_id),
    spend_date: String(r.spend_date),
    amount: Number(r.amount),
    platform: 'meta',
  }));
}

export type ClientHealthBundle = {
  period: { start: string; end: string };
  prior_period: { start: string; end: string } | null;
  maturity: {
    days: number;
    matured_through: string;
    clamped: boolean;
    empty: boolean;
    leading_window_days: number;
    leading_start: string;
    leading_end: string;
    leading_prior_start: string | null;
    leading_prior_end: string | null;
    recent_window_days: number;
    recent_start: string;
    recent_end: string;
    recent_prior_start: string | null;
    recent_prior_end: string | null;
  };
  summary: {
    act_now: number;
    monitor: number;
    recovering: number;
    on_track: number;
    follow_up_due: number;
    follow_up_overdue: number;
    fresh_launch_count: number;
  };
  pending_interventions: PendingIntervention[];
  clients: ClientHealthRow[];
};

export async function loadClientHealthBundle(
  service: ServiceClient,
  opts: { start_date: string; end_date: string; live_only?: boolean },
): Promise<ClientHealthBundle> {
  const { start_date, end_date, live_only = false } = opts;
  const today = new Date().toISOString().split('T')[0];
  const matured = maturedWindow(start_date, end_date);
  const verdictPrior = getPriorPeriod(start_date, end_date);
  const leading = calendarLeadingWindow();
  const leadingPrior = getRecentPriorPeriod(leading.start, leading.end);

  let clientQuery = service
    .from('clients')
    .select('id, name, is_live, reporting_type, kpi_benchmarks, launch_date, lifecycle_status')
    .order('name');

  if (live_only) clientQuery = clientQuery.eq('is_live', true);

  let liveClientIds: string[] | null = null;
  if (live_only) {
    liveClientIds = await getLiveClientIds(service);
  }

  const { data: clients, error: clientsError } = await clientQuery;
  if (clientsError) throw new Error(clientsError.message);

  const rangeStart = [verdictPrior?.start, leadingPrior?.start, start_date]
    .concat(
      (clients ?? [])
        .filter(c => isFreshLaunchClient(c.launch_date as string | null, today))
        .map(c => c.launch_date as string),
    )
    .filter(Boolean)
    .sort()[0] as string;
  const rangeEnd = leading.end > end_date ? leading.end : end_date;

  let eventsQuery = service.from('events').select(EVENT_SELECT);
  if (liveClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(liveClientIds));
  eventsQuery = eventsQuery.gte('occurred_at', `${rangeStart}T00:00:00.000Z`);
  eventsQuery = eventsQuery.lte('occurred_at', `${rangeEnd}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(200000);

  const spendFilters = {
    start_date: rangeStart,
    end_date: rangeEnd,
    client_ids: liveClientIds,
  };

  let actionsQuery = service
    .from('client_action_logs')
    .select(
      'id, client_id, title, review_date, status, created_at, change_date, success_metric, baseline_value, target_value, baseline_snapshot_id, outcome_value, outcome_recorded_at',
    )
    .in('status', [...OPEN_ACTION_STATUSES]);
  if (liveClientIds?.length) {
    actionsQuery = actionsQuery.in('client_id', liveClientFilter(liveClientIds));
  }

  const [
    { data: events, error: eventsError },
    { data: actionRows, error: actionsError },
    metaSpend,
  ] = await Promise.all([
    eventsQuery,
    actionsQuery,
    fetchMetaSpendByClient(service, spendFilters),
  ]);

  if (eventsError) throw new Error(eventsError.message);
  if (actionsError) throw new Error(actionsError.message);

  const allEvents = (events ?? []) as ClientEventWithDate[];
  const inRange = (e: ClientEventWithDate, s: string, en: string) =>
    e.occurred_at >= `${s}T00:00:00.000Z` && e.occurred_at <= `${en}T23:59:59.999Z`;

  const verdictEvents = allEvents.filter(e => inRange(e, start_date, end_date));
  const priorEvents = verdictPrior
    ? allEvents.filter(e => inRange(e, verdictPrior.start, verdictPrior.end))
    : [];
  const recentEvents = allEvents.filter(e => inRange(e, leading.start, leading.end));
  const recentPriorEvents = leadingPrior
    ? allEvents.filter(e => inRange(e, leadingPrior.start, leadingPrior.end))
    : [];

  const spendRows = [...metaSpend];
  const verdictSpend = spendInRange(spendRows, start_date, end_date);
  const priorSpend = verdictPrior
    ? spendInRange(spendRows, verdictPrior.start, verdictPrior.end)
    : [];
  const recentSpend = spendInRange(spendRows, leading.start, leading.end);
  const recentPriorSpend = leadingPrior
    ? spendInRange(spendRows, leadingPrior.start, leadingPrior.end)
    : [];

  const currentByClient = groupEventsByClient(verdictEvents);
  const priorByClient = groupEventsByClient(priorEvents);
  const recentByClient = groupEventsByClient(recentEvents);
  const recentPriorByClient = groupEventsByClient(recentPriorEvents);

  const spendByClient = (rows: SpendByClientRow[]) =>
    groupSpendByClient(rows.map(({ client_id, amount, platform }) => ({ client_id, amount, platform })));

  const currentSpendByClient = spendByClient(verdictSpend);
  const priorSpendByClient = spendByClient(priorSpend);
  const recentSpendByClient = spendByClient(recentSpend);
  const recentPriorSpendByClient = spendByClient(recentPriorSpend);

  const freshCostByClient = groupEventsByClient(recentEvents);
  const freshCostPriorByClient = groupEventsByClient(recentPriorEvents);
  const freshCostSpendByClient = spendByClient(recentSpend);
  const freshCostPriorSpendByClient = spendByClient(recentPriorSpend);

  const actionsByClient = new Map<string, ActionRow[]>();
  for (const a of actionRows ?? []) {
    const list = actionsByClient.get(a.client_id) ?? [];
    list.push(a as ActionRow);
    actionsByClient.set(a.client_id, list);
  }

  const allEventsByClient = groupEventsByClient(allEvents);

  const rows = (clients ?? []).map(c => {
    const benchmarks = (c.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;
    const reporting_type = normalizeReportingType(c.reporting_type);
    const isHe = usesCallCenterKpiLayout(reporting_type);
    const launch_date = (c.launch_date as string | null) ?? null;
    const clientEvents = allEventsByClient.get(c.id) ?? [];
    const freshWin =
      launch_date && isFreshLaunchClient(launch_date, today)
        ? freshLaunchWindow(launch_date, today)
        : null;
    const freshLaunchEvents = freshWin
      ? filterEventsToRange(
          clientEvents as Array<EventRow & { occurred_at: string }>,
          freshWin.start,
          freshWin.end,
        )
      : [];
    const freshLaunchSpend = freshWin
      ? spendInRange(spendRows.filter(r => r.client_id === c.id), freshWin.start, freshWin.end).map(
          ({ client_id: _cid, amount, platform }) => ({ amount, platform }),
        )
      : [];
    const toCostSlice = (
      ev: EventRow[],
      spend: SpendRow[],
      win: { start: string; end: string; window_days: number },
    ): CostWindowSlice => ({
      start: win.start,
      end: win.end,
      window_days: win.window_days,
      events: ev ?? [],
      spend: spend ?? [],
    });
    return buildClientHealthRow({
      client_id: c.id,
      client_name: c.name,
      is_live: c.is_live !== false,
      reporting_type,
      benchmarks,
      verdictEvents: currentByClient.get(c.id) ?? [],
      priorEvents: priorByClient.get(c.id) ?? [],
      recentEvents: recentByClient.get(c.id) ?? [],
      recentPriorEvents: recentPriorByClient.get(c.id) ?? [],
      verdictSpend: currentSpendByClient.get(c.id) ?? [],
      priorSpend: priorSpendByClient.get(c.id) ?? [],
      recentSpend: recentSpendByClient.get(c.id) ?? [],
      recentPriorSpend: recentPriorSpendByClient.get(c.id) ?? [],
      freshCost: isHe
        ? null
        : toCostSlice(
            freshCostByClient.get(c.id) ?? [],
            freshCostSpendByClient.get(c.id) ?? [],
            leading,
          ),
      freshCostPrior:
        isHe || !leadingPrior
          ? null
          : toCostSlice(
              freshCostPriorByClient.get(c.id) ?? [],
              freshCostPriorSpendByClient.get(c.id) ?? [],
              { ...leadingPrior, window_days: leading.window_days },
            ),
      start_date,
      end_date,
      verdictPrior,
      open_action: pickOpenAction(actionsByClient.get(c.id) ?? [], today),
      launch_date,
      freshLaunchEvents,
      freshLaunchSpend,
      today,
    });
  });

  const fresh_launch_count = rows.filter(r => r.is_fresh_launch).length;
  const follow_up_due = rows.filter(r => r.open_action?.review_date).length;
  const follow_up_overdue = rows.filter(r => r.open_action?.overdue).length;

  const clientNameById = new Map((clients ?? []).map(c => [c.id, c.name]));
  const clientTypeById = new Map(
    (clients ?? []).map(c => [c.id, normalizeReportingType(c.reporting_type)]),
  );

  const pending_interventions: PendingIntervention[] = (actionRows ?? [])
    .map(a => {
      const row = a as ActionRow;
      const summary = summarizeOpenAction(row, today);
      return {
        id: row.id,
        client_id: row.client_id,
        client_name: clientNameById.get(row.client_id) ?? 'Unknown',
        reporting_type: clientTypeById.get(row.client_id) ?? 'RM',
        title: row.title,
        status: row.status,
        success_metric: row.success_metric,
        change_date: row.change_date,
        review_date: row.review_date,
        baseline_value: row.baseline_value != null ? Number(row.baseline_value) : null,
        outcome_value: row.outcome_value != null ? Number(row.outcome_value) : null,
        overdue: summary.overdue,
        review_due: !!row.review_date && row.review_date <= today,
      };
    })
    .sort((a, b) => {
      if (a.review_due !== b.review_due) return a.review_due ? -1 : 1;
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      const ad = a.review_date ?? '9999-12-31';
      const bd = b.review_date ?? '9999-12-31';
      return ad.localeCompare(bd);
    });

  return {
    period: { start: start_date, end: end_date },
    prior_period: verdictPrior,
    maturity: {
      days: matured.maturity_days,
      matured_through: matured.matured_through,
      clamped: matured.clamped,
      empty: matured.empty,
      leading_window_days: leading.window_days,
      leading_start: leading.start,
      leading_end: leading.end,
      leading_prior_start: leadingPrior?.start ?? null,
      leading_prior_end: leadingPrior?.end ?? null,
      recent_window_days: leading.window_days,
      recent_start: leading.start,
      recent_end: leading.end,
      recent_prior_start: leadingPrior?.start ?? null,
      recent_prior_end: leadingPrior?.end ?? null,
    },
    summary: {
      act_now: rows.filter(r => r.focus.focus === 'act_now' && r.has_activity && !r.is_fresh_launch).length,
      monitor: rows.filter(r => r.focus.focus === 'monitor' && r.has_activity && !r.is_fresh_launch).length,
      recovering: rows.filter(r => r.focus.focus === 'recovering' && r.has_activity && !r.is_fresh_launch).length,
      on_track: rows.filter(r => r.focus.focus === 'on_track' && r.has_activity && !r.is_fresh_launch).length,
      follow_up_due,
      follow_up_overdue,
      fresh_launch_count,
    },
    pending_interventions,
    clients: rows,
  };
}

/** Same matured 30d window Client Success uses by default (ends MATURITY_DAYS before today). */
export function defaultHealthGradingRange(maturityDays = 7, windowDays = 30): {
  start: string;
  end: string;
} {
  const end = new Date(Date.now() - maturityDays * 86400000);
  const start = new Date(end.getTime() - (windowDays - 1) * 86400000);
  const ymd = (d: Date) => d.toISOString().split('T')[0];
  return { start: ymd(start), end: ymd(end) };
}
