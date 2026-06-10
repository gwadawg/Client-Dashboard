import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateSchedulerSecret } from '@/lib/api-auth';

const SNAPSHOT_CLIENT_FIELDS =
  'id, lifecycle_status, mrr, daily_adspend, cs_status, client_stage';

const MONTH_RE = /^\d{4}-\d{2}$/;

/** First day of a YYYY-MM (or the current month) as a YYYY-MM-DD date. */
function periodMonth(month: string | null): string {
  if (month && MONTH_RE.test(month)) return `${month}-01`;
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
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
  const currentPeriod = periodMonth(null);
  const hasCurrentMonth = months.some((m) => m.period_month === currentPeriod);

  return NextResponse.json({
    current_period: currentPeriod,
    has_current_month: hasCurrentMonth,
    latest_period: latest?.period_month ?? null,
    latest_captured_at: latest?.captured_at ?? null,
    recent_months: months,
    healthy: hasCurrentMonth,
    hint: hasCurrentMonth
      ? 'Monthly snapshots are current.'
      : 'Schedule GET /api/business/snapshot?run=1 on the 1st of each month.',
  });
}

// POST /api/business/snapshot — secret-guarded; called by an external scheduler
// (monthly). Freezes one client_monthly_snapshots row per client for the period
// so MRR-over-time, expansion/contraction, and cohort retention become exact
// going forward. Idempotent via the (client_id, period_month) unique index.
//
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
    // No body / not JSON — default to the current month.
  }

  try {
    const result = await captureMonthlySnapshot(month);
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Snapshot failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
