import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildClientHealthRow,
  getPriorPeriod,
  getRecentPriorPeriod,
  groupEventsByClient,
  groupSpendByClient,
  maturedWindow,
  recentWindow,
  recentWindowDaysForVerdict,
  freshCostWindow,
  type ClientEventWithDate,
  type ClientKpiBenchmarks,
  type CostWindowSlice,
  type OpenActionSummary,
} from '@/lib/client-health';
import { OPEN_ACTION_STATUSES } from '@/lib/client-health-interventions';
import { normalizeReportingType, usesCallCenterKpiLayout } from '@/lib/kpi-layouts';
import { getLiveClientIds, liveClientFilter } from '@/lib/db-helpers';
import type { EventRow, SpendRow } from '@/lib/metrics';

const EVENT_SELECT =
  'client_id, occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state';

type SpendByClientRow = {
  client_id: string;
  spend_date: string;
  amount: number;
  platform?: string;
};

type ActionRow = {
  id: string;
  client_id: string;
  title: string;
  review_date: string | null;
  status: string;
  created_at: string;
};

function spendInRange(rows: SpendByClientRow[], start: string, end: string): SpendByClientRow[] {
  return rows.filter(r => r.spend_date >= start && r.spend_date <= end);
}

function pickOpenAction(
  actions: ActionRow[],
  today: string,
): OpenActionSummary | null {
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

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const live_only = searchParams.get('live_only') === 'true';

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  const today = new Date().toISOString().split('T')[0];
  const matured = maturedWindow(start_date, end_date);
  const verdictPrior = getPriorPeriod(start_date, end_date);
  const verdictDays =
    Math.floor(
      (new Date(`${end_date}T00:00:00.000Z`).getTime() -
        new Date(`${start_date}T00:00:00.000Z`).getTime()) /
        86400000,
    ) + 1;
  const recentDays = recentWindowDaysForVerdict(verdictDays);
  const recent = recentWindow(start_date, end_date, recentDays);
  const recentPrior = getRecentPriorPeriod(recent.start, recent.end);
  const freshCost = freshCostWindow();
  const freshCostPrior = getPriorPeriod(freshCost.start, freshCost.end);

  let clientQuery = ctx.service
    .from('clients')
    .select('id, name, is_live, reporting_type, kpi_benchmarks')
    .order('name');

  if (live_only) clientQuery = clientQuery.eq('is_live', true);

  let liveClientIds: string[] | null = null;
  if (live_only) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  const rangeStart = [verdictPrior?.start, recentPrior?.start, freshCostPrior?.start, start_date]
    .filter(Boolean)
    .sort()[0] as string;
  const rangeEnd = freshCost.end > end_date ? freshCost.end : end_date;

  let eventsQuery = ctx.service.from('events').select(EVENT_SELECT);
  if (liveClientIds) eventsQuery = eventsQuery.in('client_id', liveClientFilter(liveClientIds));
  eventsQuery = eventsQuery.gte('occurred_at', `${rangeStart}T00:00:00.000Z`);
  eventsQuery = eventsQuery.lte('occurred_at', `${rangeEnd}T23:59:59.999Z`);
  eventsQuery = eventsQuery.limit(200000);

  const spendFilters = {
    start_date: rangeStart,
    end_date: rangeEnd,
    client_ids: liveClientIds,
  };

  let actionsQuery = ctx.service
    .from('client_action_logs')
    .select('id, client_id, title, review_date, status, created_at')
    .in('status', [...OPEN_ACTION_STATUSES]);
  if (liveClientIds?.length) {
    actionsQuery = actionsQuery.in('client_id', liveClientFilter(liveClientIds));
  }

  const [
    { data: clients, error: clientsError },
    { data: events, error: eventsError },
    { data: actionRows, error: actionsError },
    metaSpend,
  ] = await Promise.all([
    clientQuery,
    eventsQuery,
    actionsQuery,
    fetchMetaSpendByClient(ctx, spendFilters),
  ]);

  if (clientsError || eventsError) {
    return NextResponse.json(
      { error: clientsError?.message ?? eventsError?.message },
      { status: 500 },
    );
  }
  if (actionsError) {
    return NextResponse.json({ error: actionsError.message }, { status: 500 });
  }

  const allEvents = (events ?? []) as ClientEventWithDate[];
  const inRange = (e: ClientEventWithDate, s: string, en: string) =>
    e.occurred_at >= `${s}T00:00:00.000Z` && e.occurred_at <= `${en}T23:59:59.999Z`;

  const verdictEvents = allEvents.filter(e => inRange(e, start_date, end_date));
  const priorEvents = verdictPrior
    ? allEvents.filter(e => inRange(e, verdictPrior.start, verdictPrior.end))
    : [];
  const recentEvents = allEvents.filter(e => inRange(e, recent.start, recent.end));
  const recentPriorEvents = recentPrior
    ? allEvents.filter(e => inRange(e, recentPrior.start, recentPrior.end))
    : [];

  const spendRows = [...metaSpend];
  const verdictSpend = spendInRange(spendRows, start_date, end_date);
  const priorSpend = verdictPrior
    ? spendInRange(spendRows, verdictPrior.start, verdictPrior.end)
    : [];
  const recentSpend = spendInRange(spendRows, recent.start, recent.end);
  const recentPriorSpend = recentPrior
    ? spendInRange(spendRows, recentPrior.start, recentPrior.end)
    : [];
  const freshCostEvents = allEvents.filter(e => inRange(e, freshCost.start, freshCost.end));
  const freshCostPriorEvents = freshCostPrior
    ? allEvents.filter(e => inRange(e, freshCostPrior.start, freshCostPrior.end))
    : [];
  const freshCostSpend = spendInRange(spendRows, freshCost.start, freshCost.end);
  const freshCostPriorSpend = freshCostPrior
    ? spendInRange(spendRows, freshCostPrior.start, freshCostPrior.end)
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

  const freshCostByClient = groupEventsByClient(freshCostEvents);
  const freshCostPriorByClient = groupEventsByClient(freshCostPriorEvents);
  const freshCostSpendByClient = spendByClient(freshCostSpend);
  const freshCostPriorSpendByClient = spendByClient(freshCostPriorSpend);

  const actionsByClient = new Map<string, ActionRow[]>();
  for (const a of actionRows ?? []) {
    const list = actionsByClient.get(a.client_id) ?? [];
    list.push(a as ActionRow);
    actionsByClient.set(a.client_id, list);
  }

  const rows = (clients ?? []).map(c => {
    const benchmarks = (c.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;
    const reporting_type = normalizeReportingType(c.reporting_type);
    const isHe = usesCallCenterKpiLayout(reporting_type);
    const toCostSlice = (
      events: EventRow[],
      spend: SpendRow[],
      win: { start: string; end: string; window_days: number },
    ): CostWindowSlice => ({
      start: win.start,
      end: win.end,
      window_days: win.window_days,
      events: events ?? [],
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
            freshCost,
          ),
      freshCostPrior:
        isHe || !freshCostPrior
          ? null
          : toCostSlice(
              freshCostPriorByClient.get(c.id) ?? [],
              freshCostPriorSpendByClient.get(c.id) ?? [],
              { ...freshCostPrior, window_days: freshCost.window_days },
            ),
      start_date,
      end_date,
      verdictPrior,
      open_action: pickOpenAction(actionsByClient.get(c.id) ?? [], today),
    });
  });

  const follow_up_due = rows.filter(r => r.open_action?.review_date).length;
  const follow_up_overdue = rows.filter(r => r.open_action?.overdue).length;

  return NextResponse.json({
    period: { start: start_date, end: end_date },
    prior_period: verdictPrior,
    maturity: {
      days: matured.maturity_days,
      matured_through: matured.matured_through,
      clamped: matured.clamped,
      empty: matured.empty,
      recent_window_days: recent.window_days,
      recent_start: recent.start,
      recent_end: recent.end,
      recent_prior_start: recentPrior?.start ?? null,
      recent_prior_end: recentPrior?.end ?? null,
      fresh_cost_window_days: freshCost.window_days,
      fresh_cost_start: freshCost.start,
      fresh_cost_end: freshCost.end,
    },
    summary: {
      act_now: rows.filter(r => r.focus.focus === 'act_now' && r.has_activity).length,
      monitor: rows.filter(r => r.focus.focus === 'monitor' && r.has_activity).length,
      recovering: rows.filter(r => r.focus.focus === 'recovering' && r.has_activity).length,
      on_track: rows.filter(r => r.focus.focus === 'on_track' && r.has_activity).length,
      follow_up_due,
      follow_up_overdue,
    },
    clients: rows,
  });
}

async function fetchMetaSpendByClient(
  ctx: { service: ReturnType<typeof import('@/lib/supabase').createServiceClient> },
  filters: { start_date: string; end_date: string; client_ids: string[] | null },
): Promise<SpendByClientRow[]> {
  let q = ctx.service.from('daily_meta_spend').select('client_id, spend_date, amount');
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
