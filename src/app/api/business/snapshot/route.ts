import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateSchedulerSecret } from '@/lib/api-auth';

const SNAPSHOT_CLIENT_FIELDS =
  'id, lifecycle_status, mrr, daily_adspend, cs_status, client_stage';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Previous calendar month as YYYY-MM-01 (end-of-month books frozen on the 1st). */
export function priorPeriodMonth(now: Date = new Date()): string {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-indexed current
  const prev = new Date(Date.UTC(y, m - 1, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}-01`;
}

/** First day of a YYYY-MM as YYYY-MM-DD. Defaults to the prior calendar month. */
function periodMonth(month: string | null): string {
  if (month && MONTH_RE.test(month)) return `${month}-01`;
  return priorPeriodMonth();
}

async function captureMonthlySnapshot(month: string | null) {
  const period_month = periodMonth(month);
  const service = createServiceClient();

  const { data: clients, error } = await service.from('clients').select(SNAPSHOT_CLIENT_FIELDS);
  if (error) throw new Error(error.message);

  const rows = (clients ?? []).map((c) => ({
    client_id: c.id,
    period_month,
    lifecycle_status: c.lifecycle_status ?? null,
    mrr: c.mrr ?? null,
    daily_adspend: c.daily_adspend ?? null,
    cs_status: c.cs_status ?? null,
    client_stage: c.client_stage ?? null,
    is_active: c.lifecycle_status === 'active',
    captured_at: new Date().toISOString(),
  }));

  if (rows.length === 0) {
    return { period_month, captured: 0 };
  }

  const { error: upsertError } = await service
    .from('client_monthly_snapshots')
    .upsert(rows, { onConflict: 'client_id,period_month' });

  if (upsertError) throw new Error(upsertError.message);
  return { period_month, captured: rows.length };
}

// GET /api/business/snapshot — health check; ?run=1 captures (Vercel cron uses GET).
export async function GET(req: Request) {
  if (!validateSchedulerSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get('run') === '1') {
    try {
      const month = url.searchParams.get('month');
      const result = await captureMonthlySnapshot(month);
      return NextResponse.json(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Snapshot failed';
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('client_monthly_snapshots')
    .select('period_month, captured_at')
    .order('period_month', { ascending: false })
    .limit(12);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const months = data ?? [];
  const latest = months[0] ?? null;
  const expectedPeriod = priorPeriodMonth();
  const hasPriorMonth = months.some((m) => m.period_month === expectedPeriod);

  return NextResponse.json({
    expected_period: expectedPeriod,
    has_prior_month: hasPriorMonth,
    latest_period: latest?.period_month ?? null,
    latest_captured_at: latest?.captured_at ?? null,
    recent_months: months,
    healthy: hasPriorMonth,
    hint: hasPriorMonth
      ? 'Prior-month end snapshots are current (used for MRR bridge start/end).'
      : 'Schedule GET /api/business/snapshot?run=1 on the 1st — it freezes the prior month.',
  });
}

// POST /api/business/snapshot — secret-guarded; called by an external scheduler
// (monthly). Freezes one client_monthly_snapshots row per client for the period
// so MRR-over-time, expansion/contraction, and cohort retention become exact
// going forward. Idempotent via the (client_id, period_month) unique index.
//
// Default (no body / no month): prior calendar month (end-of-month books).
// Body (optional JSON): { "month": "YYYY-MM" } to backfill a specific month.
export async function POST(req: Request) {
  if (!validateSchedulerSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let month: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.month === 'string') month = body.month;
  } catch {
    // No body / not JSON — default to the prior month.
  }

  try {
    const result = await captureMonthlySnapshot(month);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Snapshot failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
