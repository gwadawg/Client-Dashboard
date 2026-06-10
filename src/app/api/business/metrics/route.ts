import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import { BUSINESS_METRIC_KEYS } from '@/lib/business-metrics';

const FIELDS = 'id, metric_key, period_date, value_numeric, value_text, dimension, notes, created_at';
const MONTH_RE = /^\d{4}-\d{2}$/;
const VALID_KEYS = new Set(Object.keys(BUSINESS_METRIC_KEYS));

/** Normalize a YYYY-MM (or YYYY-MM-DD) to the first-of-month YYYY-MM-DD. */
function periodDate(month: string): string | null {
  if (MONTH_RE.test(month)) return `${month}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(month)) return `${month.slice(0, 7)}-01`;
  return null;
}

// GET /api/business/metrics                 -> all rows (the full time series)
// GET /api/business/metrics?month=YYYY-MM    -> just that month's values
// Used by the Business view to read imported / hand-entered company inputs.
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'ceo');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const month = new URL(req.url).searchParams.get('month');

  let query = ctx.service.from('business_metrics').select(FIELDS).order('period_date', { ascending: true });
  if (month) {
    const pd = periodDate(month);
    if (!pd) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });
    query = query.eq('period_date', pd);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metrics: data ?? [], keys: BUSINESS_METRIC_KEYS });
}

// POST /api/business/metrics — upsert one company-wide metric value for a month.
// Body: { metric_key, month: "YYYY-MM", value_numeric, dimension?, notes? }
// Sending an empty/null value clears the metric for that month.
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'ceo');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body.metric_key !== 'string') {
    return NextResponse.json({ error: 'metric_key is required' }, { status: 400 });
  }
  if (!VALID_KEYS.has(body.metric_key)) {
    return NextResponse.json(
      { error: `Unknown metric_key. Allowed: ${Array.from(VALID_KEYS).join(', ')}` },
      { status: 400 },
    );
  }
  const pd = typeof body.month === 'string' ? periodDate(body.month) : null;
  if (!pd) return NextResponse.json({ error: 'month must be YYYY-MM' }, { status: 400 });

  const dimension: string | null = typeof body.dimension === 'string' && body.dimension ? body.dimension : null;

  // Empty value = clear the cell for that month/dimension.
  const raw = body.value_numeric;
  const isEmpty = raw === '' || raw === null || raw === undefined;
  const value = isEmpty ? null : Number(raw);
  if (!isEmpty && !Number.isFinite(value)) {
    return NextResponse.json({ error: 'value_numeric must be a number' }, { status: 400 });
  }

  if (isEmpty) {
    let del = ctx.service
      .from('business_metrics')
      .delete()
      .eq('metric_key', body.metric_key)
      .eq('period_date', pd);
    del = dimension ? del.eq('dimension', dimension) : del.is('dimension', null);
    const { error } = await del;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ cleared: true });
  }

  const row = {
    metric_key: body.metric_key,
    period_date: pd,
    value_numeric: value,
    dimension,
    notes: typeof body.notes === 'string' && body.notes ? body.notes : null,
    created_by: ctx.userId,
  };

  // The unique index is (metric_key, period_date, coalesce(dimension, '')), so a
  // null dimension can't participate in onConflict; emulate upsert manually.
  let existing = ctx.service
    .from('business_metrics')
    .select('id')
    .eq('metric_key', body.metric_key)
    .eq('period_date', pd);
  existing = dimension ? existing.eq('dimension', dimension) : existing.is('dimension', null);
  const { data: found, error: findErr } = await existing.maybeSingle();
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });

  if (found) {
    const { data, error } = await ctx.service
      .from('business_metrics')
      .update({ value_numeric: value, notes: row.notes })
      .eq('id', found.id)
      .select(FIELDS)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ metric: data });
  }

  const { data, error } = await ctx.service.from('business_metrics').insert(row).select(FIELDS).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metric: data });
}
