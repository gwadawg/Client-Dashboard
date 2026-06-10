import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import { computeNextBillingDate, deriveStatus, balanceOf, recordedState, type BillingRow } from '@/lib/billing';
import { VOIDED_BILLING_STATUS } from '@/lib/billing-query';
import {
  canViewClientRevenue,
  redactBillingRow,
  redactBillingRows,
  redactClientMoneyFields,
} from '@/lib/client-revenue-access';

const CLIENT_BILLING_FIELDS =
  'id, name, is_live, lifecycle_status, mrr, billing_type, billing_day, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend, performance_terms';

const BILLING_FIELDS =
  'id, client_id, billed_on, due_date, period_start, period_end, amount, base_amount, performance_amount, late_fee, discount, amount_paid, status, paid_on, method, invoice_ref, note, created_at';

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

  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);

  const clientId = new URL(req.url).searchParams.get('client_id');

  if (clientId) {
    const { data, error } = await ctx.service
      .from('client_billings')
      .select(BILLING_FIELDS)
      .neq('status', VOIDED_BILLING_STATUS)
      .eq('client_id', clientId)
      .order('billed_on', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const billings = includeRevenue ? (data ?? []) : redactBillingRows(data);
    return NextResponse.json({ billings, can_view_revenue: includeRevenue });
  }

  const [clientsRes, billingsRes] = await Promise.all([
    ctx.service.from('clients').select(CLIENT_BILLING_FIELDS).order('name'),
    ctx.service
      .from('client_billings')
      .select(BILLING_FIELDS)
      .neq('status', VOIDED_BILLING_STATUS)
      .order('billed_on', { ascending: false }),
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

  const now = new Date();
  let activeMrr = 0;
  let billedThisMonth = 0;
  let overdueTotal = 0;
  let openTotal = 0;

  const enriched = clients.map(c => {
    const rows = byClient.get(c.id) ?? [];
    const lastBilling = (rows[0] as BillingRow | undefined) ?? null;
    const nextBillingDate = computeNextBillingDate(c, lastBilling);
    const nextBillingStatus = deriveStatus(nextBillingDate, new Date());

    if (includeRevenue && c.is_live && typeof c.mrr === 'number') activeMrr += c.mrr;

    const clientRow = includeRevenue ? c : redactClientMoneyFields(c);
    const billingRows = includeRevenue ? rows : redactBillingRows(rows);
    const lastRow = includeRevenue ? lastBilling : (lastBilling ? redactBillingRow(lastBilling as unknown as Record<string, unknown>) : null);

    return {
      ...clientRow,
      next_billing_date: nextBillingDate,
      next_billing_status: nextBillingStatus,
      last_billing: lastRow,
      billings: billingRows,
    };
  });

  if (includeRevenue) {
    for (const b of billings) {
      const amount = Number(b.amount) || 0;
      if (b.billed_on >= monthStart && b.billed_on <= today) billedThisMonth += amount;
      const state = recordedState(b, now);
      if (state === 'paid' || state === 'refunded' || state === 'voided') continue;
      const balance = balanceOf(b);
      openTotal += balance;
      if (state === 'overdue' || state === 'failed') overdueTotal += balance;
    }
  }

  return NextResponse.json({
    clients: enriched,
    totals: includeRevenue
      ? {
          active_mrr: activeMrr,
          billed_this_month: billedThisMonth,
          overdue_total: overdueTotal,
          open_total: openTotal,
        }
      : null,
    can_view_revenue: includeRevenue,
  });
}

// POST /api/billings — record a billing
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const body = await req.json();
  const { client_id, billed_on } = body;

  if (!client_id) return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  if (!billed_on) return NextResponse.json({ error: 'billed_on is required' }, { status: 400 });

  // The total due is the sum of the breakdown. Fall back to a flat `amount` so
  // older callers still work; that flat amount becomes the base.
  const base = Number(body.base_amount ?? body.amount);
  if (Number.isNaN(base))
    return NextResponse.json({ error: 'base_amount (or amount) is required' }, { status: 400 });
  const performance = Number(body.performance_amount) || 0;
  const lateFee = Number(body.late_fee) || 0;
  const discount = Number(body.discount) || 0;
  const amount = base + performance + lateFee - discount;

  // Paid-ness: an explicit "paid" status (or markPaid) settles the full amount;
  // otherwise derive paid/partial/pending from how much was collected.
  const wantsPaid = body.status === 'paid' || body.markPaid === true;
  const amountPaid = wantsPaid ? amount : Number(body.amount_paid) || 0;
  let status: string = body.status ?? 'pending';
  if (!body.status) {
    if (amount > 0 && amountPaid >= amount) status = 'paid';
    else if (amountPaid > 0) status = 'partial';
    else status = 'pending';
  }

  const dueDate = body.due_date || billed_on;

  const insert: Record<string, unknown> = {
    client_id,
    billed_on,
    due_date: dueDate,
    base_amount: base,
    performance_amount: performance,
    late_fee: lateFee,
    discount,
    amount,
    amount_paid: amountPaid,
    status,
    created_by: ctx.userId,
  };
  if (status === 'paid' && !body.paid_on) insert.paid_on = billed_on;
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
