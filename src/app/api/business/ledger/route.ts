import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import { VOIDED_BILLING_STATUS } from '@/lib/billing-query';
import { BILLING_LEDGER_FIELDS } from '@/lib/billing-revenue';

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthsAgoYmd(months: number): string {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/business/ledger
 * Company-wide charge ledger for Executive → Finance → Revenue.
 * Query: from, to (YYYY-MM-DD), client_id, revenue_type, revenue_segment, method, q (client name / stripe id)
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'ceo');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const url = new URL(req.url);
  const fromParam = url.searchParams.get('from');
  const toParam = url.searchParams.get('to');
  const from = fromParam && YMD_RE.test(fromParam) ? fromParam : monthsAgoYmd(24);
  const to = toParam && YMD_RE.test(toParam) ? toParam : todayYmd();
  const clientId = url.searchParams.get('client_id');
  const revenueType = url.searchParams.get('revenue_type');
  const revenueSegment = url.searchParams.get('revenue_segment');
  const method = url.searchParams.get('method');
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();

  let query = ctx.service
    .from('client_billings')
    .select(`${BILLING_LEDGER_FIELDS}, clients!inner(id, name)`)
    .neq('status', VOIDED_BILLING_STATUS)
    .gte('billed_on', from)
    .lte('billed_on', to)
    .order('billed_on', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(2000);

  if (clientId) query = query.eq('client_id', clientId);
  if (revenueType) query = query.eq('revenue_type', revenueType);
  if (revenueSegment) query = query.eq('revenue_segment', revenueSegment);
  if (method) query = query.eq('method', method);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  type Row = Record<string, unknown> & {
    clients?: { id: string; name: string } | { id: string; name: string }[] | null;
  };

  let rows: Array<Record<string, unknown> & { client_name: string }> = ((data ?? []) as Row[]).map((row) => {
    const clientRel = Array.isArray(row.clients) ? row.clients[0] : row.clients;
    const { clients: _c, ...billing } = row;
    return {
      ...billing,
      client_name: clientRel?.name ?? '—',
    };
  });

  if (q) {
    rows = rows.filter((r) => {
      const name = String(r.client_name ?? '').toLowerCase();
      const stripe = String(r.stripe_invoice_id ?? '').toLowerCase();
      const note = String(r.note ?? '').toLowerCase();
      const invoice = String(r.invoice_ref ?? '').toLowerCase();
      return (
        name.includes(q) ||
        stripe.includes(q) ||
        note.includes(q) ||
        invoice.includes(q)
      );
    });
  }

  let totalBilled = 0;
  let totalCollected = 0;
  let totalFees = 0;
  for (const r of rows) {
    totalBilled += Number(r.amount) || 0;
    totalCollected += Number(r.amount_paid) || 0;
    totalFees += Number(r.processing_fee) || 0;
  }

  return NextResponse.json({
    rows,
    totals: {
      count: rows.length,
      billed: totalBilled,
      collected: totalCollected,
      fees: totalFees,
      net: totalCollected - totalFees,
    },
    filters: { from, to, client_id: clientId, revenue_type: revenueType, revenue_segment: revenueSegment, method, q },
  });
}
