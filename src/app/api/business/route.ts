import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import { VOIDED_BILLING_STATUS } from '@/lib/billing-query';
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

const HISTORY_FIELDS =
  'client_id, previous_status, new_status, reason_code, note, mrr_at_change, changed_at';

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

  const billingCutoff = (() => {
    const d = new Date();
    d.setUTCMonth(d.getUTCMonth() - 36);
    return d.toISOString().slice(0, 10);
  })();

  const [clientsRes, historyRes, billingsRes, metricsRes] = await Promise.all([
    ctx.service.from('clients').select(CLIENT_FIELDS),
    ctx.service.from('client_status_history').select(HISTORY_FIELDS),
    ctx.service
      .from('client_billings')
      .select(BILLING_FIELDS)
      .neq('status', VOIDED_BILLING_STATUS)
      .gte('billed_on', billingCutoff),
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

  const monthStart = `${month}-01`;
  const monthEndDate = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  const monthEnd = monthEndDate.toISOString().slice(0, 10);

  const [acqClosesRes, acqSpendRes] = await Promise.all([
    ctx.service
      .from('acquisition_closes')
      .select('id', { count: 'exact', head: true })
      .gte('closed_at', `${monthStart}T00:00:00.000Z`)
      .lte('closed_at', `${monthEnd}T23:59:59.999Z`),
    ctx.service
      .from('acquisition_meta_ad_insights')
      .select('spend')
      .gte('insight_date', monthStart)
      .lte('insight_date', monthEnd),
  ]);

  const acqCloseCount = acqClosesRes.count ?? 0;
  const acqSpend = (acqSpendRes.data ?? []).reduce(
    (s, r) => s + Number((r as { spend: number }).spend ?? 0),
    0,
  );
  if (acqCloseCount > 0 && acqSpend > 0) {
    const pipelineCac = acqSpend / acqCloseCount;
    metrics.unitEconomics.acquisition_pipeline_cac = pipelineCac;
    metrics.unitEconomics.acquisition_ad_spend = acqSpend;
    if (metrics.unitEconomics.marketing_spend == null) {
      metrics.unitEconomics.marketing_spend = acqSpend;
      metrics.unitEconomics.cac = pipelineCac;
    }
  }

  return NextResponse.json(metrics);
}
