import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildClientHealthRow,
  buildConstraintGuidance,
  getPriorPeriod,
  getRecentPriorPeriod,
  maturedWindow,
  recentWindow,
  recentWindowDaysForVerdict,
  freshCostWindow,
  type ClientKpiBenchmarks,
  type CostWindowSlice,
} from '@/lib/client-health';
import { OPEN_ACTION_STATUSES } from '@/lib/client-health-interventions';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import { fetchCombinedSpendForMetrics } from '@/lib/spend';
import type { EventRow } from '@/lib/metrics';

const EVENT_SELECT =
  'occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state';

type DatedEventRow = EventRow & { occurred_at: string };

export async function GET(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { clientId } = await params;
  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

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
  const rangeStart = [verdictPrior?.start, recentPrior?.start, freshCostPrior?.start, start_date]
    .filter(Boolean)
    .sort()[0] as string;
  const rangeEnd = freshCost.end > end_date ? freshCost.end : end_date;

  const [{ data: client, error: clientError }, { data: events, error: eventsError }, { data: actionRows }] =
    await Promise.all([
      ctx.service.from('clients').select('id, name, is_live, reporting_type, kpi_benchmarks').eq('id', clientId).single(),
      ctx.service
        .from('events')
        .select(EVENT_SELECT)
        .eq('client_id', clientId)
        .gte('occurred_at', `${rangeStart}T00:00:00.000Z`)
        .lte('occurred_at', `${rangeEnd}T23:59:59.999Z`)
        .limit(200000),
      ctx.service
        .from('client_action_logs')
        .select('id, client_id, title, review_date, status, created_at')
        .eq('client_id', clientId)
        .in('status', [...OPEN_ACTION_STATUSES])
        .order('review_date', { ascending: true }),
    ]);

  if (clientError || !client) {
    return NextResponse.json({ error: clientError?.message ?? 'Client not found' }, { status: 404 });
  }
  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const reporting_type = normalizeReportingType(
    (client as { reporting_type?: unknown }).reporting_type,
  );
  const isHe = reporting_type === 'HE';
  const benchmarks = ((client as { kpi_benchmarks?: unknown }).kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;

  const allEvents = (events ?? []) as DatedEventRow[];
  const inRange = (e: DatedEventRow, s: string, en: string) =>
    e.occurred_at >= `${s}T00:00:00.000Z` && e.occurred_at <= `${en}T23:59:59.999Z`;

  const filterSpend = async (s: string, e: string) =>
    isHe ? [] : fetchCombinedSpendForMetrics(ctx.service, { client_id: clientId, start_date: s, end_date: e });

  const [verdictSpend, priorSpend, recentSpend, recentPriorSpend, freshCostSpend, freshCostPriorSpend] =
    await Promise.all([
      filterSpend(start_date, end_date),
      verdictPrior ? filterSpend(verdictPrior.start, verdictPrior.end) : Promise.resolve([]),
      filterSpend(recent.start, recent.end),
      recentPrior ? filterSpend(recentPrior.start, recentPrior.end) : Promise.resolve([]),
      isHe ? Promise.resolve([]) : filterSpend(freshCost.start, freshCost.end),
      isHe || !freshCostPrior
        ? Promise.resolve([])
        : filterSpend(freshCostPrior.start, freshCostPrior.end),
    ]);

  const openActions = (actionRows ?? []) as { id: string; title: string; review_date: string | null; status: string }[];
  const nextAction = openActions[0]
    ? {
        id: openActions[0].id,
        title: openActions[0].title,
        review_date: openActions[0].review_date,
        status: openActions[0].status,
        overdue: !!openActions[0].review_date && openActions[0].review_date < today,
      }
    : null;

  const freshCostSlice: CostWindowSlice | null = isHe
    ? null
    : {
        start: freshCost.start,
        end: freshCost.end,
        window_days: freshCost.window_days,
        events: allEvents.filter(e => inRange(e, freshCost.start, freshCost.end)),
        spend: freshCostSpend,
      };
  const freshCostPriorSlice: CostWindowSlice | null =
    isHe || !freshCostPrior
      ? null
      : {
          start: freshCostPrior.start,
          end: freshCostPrior.end,
          window_days: freshCost.window_days,
          events: allEvents.filter(e => inRange(e, freshCostPrior.start, freshCostPrior.end)),
          spend: freshCostPriorSpend,
        };

  const row = buildClientHealthRow({
    client_id: client.id,
    client_name: client.name,
    is_live: client.is_live !== false,
    reporting_type,
    benchmarks,
    verdictEvents: allEvents.filter(e => inRange(e, start_date, end_date)),
    priorEvents: verdictPrior ? allEvents.filter(e => inRange(e, verdictPrior.start, verdictPrior.end)) : [],
    recentEvents: allEvents.filter(e => inRange(e, recent.start, recent.end)),
    recentPriorEvents: recentPrior ? allEvents.filter(e => inRange(e, recentPrior.start, recentPrior.end)) : [],
    verdictSpend,
    priorSpend,
    recentSpend,
    recentPriorSpend,
    freshCost: freshCostSlice,
    freshCostPrior: freshCostPriorSlice,
    start_date,
    end_date,
    verdictPrior,
    open_action: nextAction,
  });

  const guidance = buildConstraintGuidance(row.current, reporting_type);

  return NextResponse.json({
    client_id: client.id,
    client_name: client.name,
    is_live: client.is_live !== false,
    reporting_type,
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
    current: row.current,
    prior: row.prior,
    recent: row.recent,
    recent_prior: row.recent_prior,
    focus: row.focus,
    open_action: row.open_action,
    trend: row.trend,
    trend_delta_score: row.trend_delta_score,
    guidance,
  });
}
