import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import {
  computeBusinessMetrics,
  currentMonth,
  type BusinessBilling,
  type BusinessClient,
  type BusinessMetricRow,
  type StatusHistoryRow,
} from '@/lib/business-metrics';

const CLIENT_FIELDS =
  'id, name, mrr, lifecycle_status, date_signed, churned_at, launch_date, offer, reporting_type, contract_end_date';

const HISTORY_FIELDS = 'client_id, previous_status, new_status, mrr_at_change, changed_at';

const BILLING_FIELDS =
  'client_id, billed_on, due_date, paid_on, amount, amount_paid, status, revenue_type, revenue_segment, lead_source, processing_fee, passthrough_amount';

const BUSINESS_METRIC_FIELDS = 'metric_key, period_date, value_numeric';

const MONTH_RE = /^\d{4}-\d{2}$/;

// GET /api/business?month=YYYY-MM&trend_months=12
// Agency-wide CEO KPIs aggregated across the whole client book.
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'ceo');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const url = new URL(req.url);
  const monthParam = url.searchParams.get('month');
  const month = monthParam && MONTH_RE.test(monthParam) ? monthParam : currentMonth();
  const trendParam = Number(url.searchParams.get('trend_months'));
  const trendMonths = Number.isFinite(trendParam) && trendParam > 0 && trendParam <= 36 ? trendParam : 12;

  const [clientsRes, historyRes, billingsRes, metricsRes] = await Promise.all([
    ctx.service.from('clients').select(CLIENT_FIELDS),
    ctx.service.from('client_status_history').select(HISTORY_FIELDS),
    ctx.service.from('client_billings').select(BILLING_FIELDS),
    ctx.service.from('business_metrics').select(BUSINESS_METRIC_FIELDS),
  ]);

  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });
  if (historyRes.error) return NextResponse.json({ error: historyRes.error.message }, { status: 500 });
  if (billingsRes.error) return NextResponse.json({ error: billingsRes.error.message }, { status: 500 });
  if (metricsRes.error) return NextResponse.json({ error: metricsRes.error.message }, { status: 500 });

  const metrics = computeBusinessMetrics({
    clients: (clientsRes.data ?? []) as BusinessClient[],
    statusHistory: (historyRes.data ?? []) as StatusHistoryRow[],
    billings: (billingsRes.data ?? []) as BusinessBilling[],
    businessMetrics: (metricsRes.data ?? []) as BusinessMetricRow[],
    month,
    trendMonths,
  });

  return NextResponse.json(metrics);
}
