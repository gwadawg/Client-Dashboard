import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { computeNextBillingDate, deriveStatus, type BillingRow } from '@/lib/billing';

const CLIENT_BILLING_FIELDS =
  'id, name, is_live, mrr, billing_type, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend';

const BILLING_FIELDS =
  'id, client_id, billed_on, period_start, period_end, amount, status, paid_on, method, invoice_ref, note, created_at';

const OPEN_STATUSES = ['pending', 'overdue', 'failed'];

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

// GET /api/billings            -> overview: clients with next date/status + inline ledger + totals
// GET /api/billings?client_id= -> just that client's billing rows (used after mutations)
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;

  const clientId = new URL(req.url).searchParams.get('client_id');

  if (clientId) {
    const { data, error } = await ctx.service
      .from('client_billings')
      .select(BILLING_FIELDS)
      .eq('client_id', clientId)
      .order('billed_on', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ billings: data });
  }

  const [clientsRes, billingsRes] = await Promise.all([
    ctx.service.from('clients').select(CLIENT_BILLING_FIELDS).order('name'),
    ctx.service.from('client_billings').select(BILLING_FIELDS).order('billed_on', { ascending: false }),
  ]);

  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });
  if (billingsRes.error) return NextResponse.json({ error: billingsRes.error.message }, { status: 500 });

  const clients = clientsRes.data ?? [];
  const billings = billingsRes.data ?? [];

  const byClient = new Map<string, typeof billings>();
  for (const b of billings) {
    const list = byClient.get(b.client_id) ?? [];
    list.push(b);
    byClient.set(b.client_id, list);
  }

  const today = todayYmd();
  const monthStart = today.slice(0, 8) + '01';

  let activeMrr = 0;
  let billedThisMonth = 0;
  let overdueTotal = 0;
  let openTotal = 0;

  const enriched = clients.map(c => {
    const rows = byClient.get(c.id) ?? [];
    const lastBilling = (rows[0] as BillingRow | undefined) ?? null;
    const nextBillingDate = computeNextBillingDate(c, lastBilling);
    const nextBillingStatus = deriveStatus(nextBillingDate, new Date());

    if (c.is_live && typeof c.mrr === 'number') activeMrr += c.mrr;

    return {
      ...c,
      next_billing_date: nextBillingDate,
      next_billing_status: nextBillingStatus,
      last_billing: lastBilling,
      billings: rows,
    };
  });

  for (const b of billings) {
    const amount = Number(b.amount) || 0;
    if (b.billed_on >= monthStart && b.billed_on <= today) billedThisMonth += amount;
    if (OPEN_STATUSES.includes(b.status)) {
      openTotal += amount;
      if (b.status === 'overdue' || b.billed_on < today) overdueTotal += amount;
    }
  }

  return NextResponse.json({
    clients: enriched,
    totals: {
      active_mrr: activeMrr,
      billed_this_month: billedThisMonth,
      overdue_total: overdueTotal,
      open_total: openTotal,
    },
  });
}

// POST /api/billings — record a billing
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;

  const body = await req.json();
  const { client_id, billed_on, amount } = body;

  if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  if (!billed_on) return NextResponse.json({ error: 'billed_on is required' }, { status: 400 });
  if (amount === undefined || amount === null || Number.isNaN(Number(amount)))
    return NextResponse.json({ error: 'amount is required' }, { status: 400 });

  const insert: Record<string, unknown> = {
    client_id,
    billed_on,
    amount: Number(amount),
    status: body.status ?? 'pending',
    created_by: ctx.userId,
  };
  for (const k of ['period_start', 'period_end', 'paid_on', 'method', 'invoice_ref', 'note'] as const) {
    if (k in body && body[k] !== '') insert[k] = body[k];
  }

  const { data, error } = await ctx.service
    .from('client_billings')
    .insert(insert)
    .select(BILLING_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ billing: data });
}
