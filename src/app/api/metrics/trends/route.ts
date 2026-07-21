import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  loadMetricsBundle,
  metricsCacheHeaders,
} from '@/lib/load-metrics-bundle';

/**
 * Trends-only endpoint (kept for callers that don't need KPIs).
 * Uses the same events pull as /api/metrics?include_trends=1 so a recent
 * dashboard load can satisfy this from the process TTL cache.
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'dashboard');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';
  const reporting_type = searchParams.get('reporting_type');
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const granularity = searchParams.get('granularity');

  if (!start_date || !end_date) {
    return NextResponse.json({ error: 'start_date and end_date are required' }, { status: 400 });
  }

  const { data, error } = await loadMetricsBundle(
    ctx.service,
    { client_id, live_only, reporting_type, start_date, end_date },
    { includeTrends: true, granularity },
  );

  if (error || !data?.trends) {
    return NextResponse.json({ error: error ?? 'Trends load failed' }, { status: 500 });
  }

  return NextResponse.json(data.trends, { headers: metricsCacheHeaders() });
}
