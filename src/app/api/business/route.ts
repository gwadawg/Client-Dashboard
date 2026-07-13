import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import { DISMISSED_CLOSE_STATUS } from '@/lib/acquisition-close-filter';
import { VOIDED_BILLING_STATUS } from '@/lib/billing-query';
import {
  addMonths,
  computeBusinessMetrics,
  currentMonth,
  resolveBusinessPeriod,
  type BusinessBilling,
  type BusinessClient,
  type BusinessMetricRow,
  type ClientMonthlySnapshot,
  type PeriodGranularity,
  type StatusHistoryRow,
} from '@/lib/business-metrics';

const CLIENT_FIELDS =
  'id, name, mrr, lifecycle_status, date_signed, churned_at, launch_date, offer, reporting_type, contract_end_date';

const HISTORY_FIELDS =
  'client_id, previous_status, new_status, reason_code, note, mrr_at_change, changed_at';

const BILLING_FIELDS =
  'client_id, billed_on, due_date, paid_on, amount, amount_paid, status, revenue_type, revenue_segment, lead_source, processing_fee, passthrough_amount';

const BUSINESS_METRIC_FIELDS = 'metric_key, period_date, value_numeric';

const SNAPSHOT_FIELDS = 'client_id, period_month, lifecycle_status, mrr, is_active';

const MONTH_RE = /^\d{4}-\d{2}$/;
const QUARTER_RE = /^\d{4}-Q[1-4]$/i;
const YEAR_RE = /^\d{4}$/;

function parseGranularity(raw: string | null): PeriodGranularity {
  if (raw === 'quarter' || raw === 'ytd' || raw === 'month') return raw;
  return 'month';
}

function lastDayOfMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}

// GET /api/business?granularity=month|quarter|ytd&period=YYYY-MM|YYYY-QN|YYYY&trend_months=12
// Legacy: ?month=YYYY-MM (implies granularity=month)
// Agency-wide CEO KPIs aggregated across the whole client book.
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'ceo');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const url = new URL(req.url);
  const granularity = parseGranularity(url.searchParams.get('granularity'));
  const periodParam =
    url.searchParams.get('period') ??
    url.searchParams.get('month') ??
    null;

  let periodKey = periodParam;
  if (granularity === 'month' && periodKey && !MONTH_RE.test(periodKey)) {
    periodKey = currentMonth();
  }
  if (granularity === 'quarter' && periodKey && !QUARTER_RE.test(periodKey) && !MONTH_RE.test(periodKey)) {
    periodKey = null;
  }
  if (granularity === 'ytd' && periodKey && !YEAR_RE.test(periodKey) && !MONTH_RE.test(periodKey)) {
    periodKey = null;
  }

  const period = resolveBusinessPeriod(granularity, periodKey);
  const endMonth = period.endMonth;
  const trendParam = Number(url.searchParams.get('trend_months'));
  const trendMonths = Number.isFinite(trendParam) && trendParam > 0 && trendParam <= 36 ? trendParam : 12;

  // Cash is attributed by paid_on; also keep open (unpaid) rows for AR.
  const paidFrom = `${addMonths(endMonth, -(trendMonths + 2))}-01`;
  const snapshotFrom = `${addMonths(endMonth, -(trendMonths + 1))}-01`;
  const insightFrom = `${addMonths(period.startMonth, 0)}-01`;
  const insightTo = lastDayOfMonth(endMonth);

  const [clientsRes, historyRes, paidBillingsRes, openBillingsRes, metricsRes, snapshotsRes, closesRes, acqSpendRes] =
    await Promise.all([
      ctx.service.from('clients').select(CLIENT_FIELDS),
      ctx.service.from('client_status_history').select(HISTORY_FIELDS),
      ctx.service
        .from('client_billings')
        .select(BILLING_FIELDS)
        .neq('status', VOIDED_BILLING_STATUS)
        .gte('paid_on', paidFrom),
      ctx.service
        .from('client_billings')
        .select(BILLING_FIELDS)
        .neq('status', VOIDED_BILLING_STATUS)
        .is('paid_on', null),
      ctx.service.from('business_metrics').select(BUSINESS_METRIC_FIELDS),
      ctx.service
        .from('client_monthly_snapshots')
        .select(SNAPSHOT_FIELDS)
        .gte('period_month', snapshotFrom),
      ctx.service
        .from('acquisition_closes')
        .select('closed_at')
        .neq('mapping_status', DISMISSED_CLOSE_STATUS)
        .is('deleted_at', null)
        .gte('closed_at', `${paidFrom}T00:00:00.000Z`),
      ctx.service
        .from('acquisition_meta_ad_insights')
        .select('spend, insight_date')
        .gte('insight_date', insightFrom)
        .lte('insight_date', insightTo),
    ]);

  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });
  if (historyRes.error) return NextResponse.json({ error: historyRes.error.message }, { status: 500 });
  if (paidBillingsRes.error) {
    return NextResponse.json({ error: paidBillingsRes.error.message }, { status: 500 });
  }
  if (openBillingsRes.error) {
    return NextResponse.json({ error: openBillingsRes.error.message }, { status: 500 });
  }
  if (metricsRes.error) return NextResponse.json({ error: metricsRes.error.message }, { status: 500 });
  if (snapshotsRes.error) {
    return NextResponse.json({ error: snapshotsRes.error.message }, { status: 500 });
  }
  if (closesRes.error) return NextResponse.json({ error: closesRes.error.message }, { status: 500 });
  if (acqSpendRes.error) {
    return NextResponse.json({ error: acqSpendRes.error.message }, { status: 500 });
  }

  const billings = [
    ...((paidBillingsRes.data ?? []) as BusinessBilling[]),
    ...((openBillingsRes.data ?? []) as BusinessBilling[]),
  ];

  const signedClosesByMonth: Record<string, number> = {};
  for (const row of closesRes.data ?? []) {
    const closedAt = (row as { closed_at: string | null }).closed_at;
    if (!closedAt) continue;
    const m = closedAt.slice(0, 7);
    if (!MONTH_RE.test(m)) continue;
    signedClosesByMonth[m] = (signedClosesByMonth[m] ?? 0) + 1;
  }

  const metrics = computeBusinessMetrics({
    clients: (clientsRes.data ?? []) as BusinessClient[],
    statusHistory: (historyRes.data ?? []) as StatusHistoryRow[],
    billings,
    businessMetrics: (metricsRes.data ?? []) as BusinessMetricRow[],
    snapshots: (snapshotsRes.data ?? []) as ClientMonthlySnapshot[],
    signedClosesByMonth,
    period,
    trendMonths,
  });

  const monthsSet = new Set(period.months);
  // Informational Meta spend for the selected period (does not override expense CAC).
  const acqSpend = (acqSpendRes.data ?? []).reduce((s, r) => {
    const row = r as { spend: number; insight_date: string };
    const m = row.insight_date?.slice(0, 7);
    if (!m || !monthsSet.has(m)) return s;
    return s + Number(row.spend ?? 0);
  }, 0);
  metrics.unitEconomics.acquisition_ad_spend = acqSpend > 0 ? acqSpend : null;

  // When expense rollup has not written marketing_spend yet, fall back to Meta
  // spend so CAC still lights up — denominator stays signed closes.
  if (metrics.unitEconomics.marketing_spend == null && acqSpend > 0) {
    const closes = metrics.unitEconomics.cac_closes;
    metrics.unitEconomics.marketing_spend = acqSpend;
    metrics.unitEconomics.cac = closes > 0 ? acqSpend / closes : null;
  }

  return NextResponse.json(metrics);
}
