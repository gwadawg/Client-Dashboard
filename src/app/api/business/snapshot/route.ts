import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';

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

// POST /api/business/snapshot — secret-guarded; called by an external scheduler
// (monthly). Freezes one client_monthly_snapshots row per client for the period
// so MRR-over-time, expansion/contraction, and cohort retention become exact
// going forward. Idempotent via the (client_id, period_month) unique index.
//
// Body (optional JSON): { "month": "YYYY-MM" } to backfill a specific month.
export async function POST(req: Request) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let month: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.month === 'string') month = body.month;
  } catch {
    // No body / not JSON — default to the current month.
  }

  const period_month = periodMonth(month);
  const service = createServiceClient();

  const { data: clients, error } = await service.from('clients').select(SNAPSHOT_CLIENT_FIELDS);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

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
    return NextResponse.json({ period_month, captured: 0 });
  }

  const { error: upsertError } = await service
    .from('client_monthly_snapshots')
    .upsert(rows, { onConflict: 'client_id,period_month' });

  if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });

  return NextResponse.json({ period_month, captured: rows.length });
}
