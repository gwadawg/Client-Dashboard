import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildClientHealthSnapshot,
  buildHeClientHealthSnapshot,
  buildConstraintGuidance,
  buildRecentLeading,
  compareHealthTrend,
  getPriorPeriod,
  maturedWindow,
  recentWindow,
  type ClientHealthSnapshot,
  type ClientKpiBenchmarks,
} from '@/lib/client-health';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import { fetchCombinedSpendForMetrics } from '@/lib/spend';
import type { EventRow } from '@/lib/metrics';

const EVENT_SELECT =
  'occurred_at, event_type, ghl_contact_id, lead_phone, lead_email, lead_name, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state';

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

  // Matched to the dashboard: grade on the EXACT selected range. Maturity is a
  // non-blocking warning only, plus a recent leading-indicator window.
  const matured = maturedWindow(start_date, end_date);
  const verdictPrior = getPriorPeriod(start_date, end_date);
  const recent = recentWindow(start_date, end_date);
  const fetchPrior = verdictPrior;
  const rangeStart = fetchPrior?.start ?? start_date;

  const [{ data: client, error: clientError }, { data: events, error: eventsError }, currentSpend, priorSpendData] =
    await Promise.all([
      ctx.service.from('clients').select('id, name, is_live, reporting_type, kpi_benchmarks').eq('id', clientId).single(),
      ctx.service
        .from('events')
        .select(EVENT_SELECT)
        .eq('client_id', clientId)
        .gte('occurred_at', `${rangeStart}T00:00:00.000Z`)
        .lte('occurred_at', `${end_date}T23:59:59.999Z`)
        .limit(200000),
      fetchCombinedSpendForMetrics(ctx.service, {
        client_id: clientId,
        start_date: start_date,
        end_date: end_date,
      }),
      verdictPrior
        ? fetchCombinedSpendForMetrics(ctx.service, {
            client_id: clientId,
            start_date: verdictPrior.start,
            end_date: verdictPrior.end,
          })
        : Promise.resolve([]),
    ]);

  if (clientError || !client) {
    return NextResponse.json({ error: clientError?.message ?? 'Client not found' }, { status: 404 });
  }
  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const allEvents = (events ?? []) as DatedEventRow[];
  const inRange = (e: DatedEventRow, s: string, en: string) =>
    e.occurred_at >= `${s}T00:00:00.000Z` && e.occurred_at <= `${en}T23:59:59.999Z`;

  const verdictEvents = allEvents.filter(e => inRange(e, start_date, end_date));
  const priorEvents = verdictPrior ? allEvents.filter(e => inRange(e, verdictPrior.start, verdictPrior.end)) : [];
  const recentEvents = allEvents.filter(e => inRange(e, recent.start, recent.end));

  const benchmarks = ((client as { kpi_benchmarks?: unknown }).kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;
  const reporting_type = normalizeReportingType(
    (client as { reporting_type?: unknown }).reporting_type,
  );
  const isHe = reporting_type === 'HE';
  const current = isHe
    ? buildHeClientHealthSnapshot(verdictEvents, benchmarks)
    : buildClientHealthSnapshot(verdictEvents, currentSpend, benchmarks);
  const priorSnapshot: ClientHealthSnapshot | null = verdictPrior
    ? isHe
      ? buildHeClientHealthSnapshot(priorEvents, benchmarks)
      : buildClientHealthSnapshot(priorEvents, priorSpendData, benchmarks)
    : null;
  const recentLeading = buildRecentLeading(
    recentEvents,
    recent.start,
    recent.end,
    recent.window_days,
    reporting_type,
  );
  const { trend, trend_delta_score } = compareHealthTrend(current, priorSnapshot);
  const guidance = buildConstraintGuidance(current, reporting_type);

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
    },
    current,
    prior: priorSnapshot,
    recent: recentLeading,
    trend,
    trend_delta_score,
    guidance,
  });
}
