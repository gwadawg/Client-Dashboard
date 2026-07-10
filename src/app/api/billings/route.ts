import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import { computeNextBillingDate, deriveStatus, balanceOf, recordedState, type BillingRow } from '@/lib/billing';
import { VOIDED_BILLING_STATUS } from '@/lib/billing-query';
import {
  BILLING_LEDGER_FIELDS,
  loadClientBillingProbes,
  logBillingEvent,
  resolveRevenueDefaults,
} from '@/lib/billing-revenue';
import {
  canViewClientRevenue,
  redactBillingRow,
  redactBillingRows,
  redactClientMoneyFields,
} from '@/lib/client-revenue-access';

const CLIENT_BILLING_FIELDS =
  'id, name, reporting_type, is_live, lifecycle_status, billing_paused, billing_paused_at, billing_paused_note, billing_model, pay_per_show, pay_per_bailed, mrr, billing_type, billing_day, launch_date, date_signed, contract_end_date, contract_term_months, daily_adspend, performance_terms, source';

const BILLING_FIELDS = BILLING_LEDGER_FIELDS;

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

    const lastRealBilling = (rows.find(r => r.status !== 'scheduled') as BillingRow | undefined) ?? null;
    const nextBillingDate = computeNextBillingDate(c, lastRealBilling);
    const nextBillingStatus = deriveStatus(nextBillingDate, new Date());
    const suggestedNextDate = nextBillingDate;

    if (includeRevenue && c.is_live && typeof c.mrr === 'number') activeMrr += c.mrr;

    const clientRow = includeRevenue ? c : redactClientMoneyFields(c);
    const billingRows = includeRevenue ? rows : redactBillingRows(rows);
    const lastRow = includeRevenue ? lastRealBilling : (lastRealBilling ? redactBillingRow(lastRealBilling as unknown as Record<string, unknown>) : null);

    return {
      ...clientRow,
      next_billing_date: nextBillingDate,
      next_billing_status: nextBillingStatus,
      suggested_next_date: suggestedNextDate,
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

  const base = Number(body.base_amount ?? body.amount);
  if (Number.isNaN(base))
    return NextResponse.json({ error: 'base_amount (or amount) is required' }, { status: 400 });
  const performance = Number(body.performance_amount) || 0;
  const lateFee = Number(body.late_fee) || 0;
  const discount = Number(body.discount) || 0;
  const amount = base + performance + lateFee - discount;

  const EXPLICIT_STATUSES = new Set(['scheduled', 'paid', 'failed', 'refunded', 'voided']);
  const wantsPaid = body.status === 'paid' || body.markPaid === true;
  const isScheduled = body.status === 'scheduled';
  const amountPaid = (wantsPaid && !isScheduled) ? amount : (isScheduled ? 0 : Number(body.amount_paid) || 0);
  let status: string = body.status ?? 'pending';
  if (!body.status || !EXPLICIT_STATUSES.has(body.status)) {
    if (amount > 0 && amountPaid >= amount) status = 'paid';
    else if (amountPaid > 0) status = 'partial';
    else status = 'pending';
  }

  const dueDate = body.due_date || billed_on;
  const willBePaid = status === 'paid' || amountPaid > 0;

  const { data: client, error: clientErr } = await ctx.service
    .from('clients')
    .select('id, billing_type, source, contract_term_months')
    .eq('id', client_id)
    .single();
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 404 });

  let probes;
  try {
    probes = await loadClientBillingProbes(ctx.service, client_id);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to load billings' }, { status: 500 });
  }

  const revenue = resolveRevenueDefaults({
    client,
    existingBillings: probes,
    input: body,
    willBePaid,
  });
  if (revenue.error) return NextResponse.json({ error: revenue.error }, { status: 400 });
  if (!revenue.revenue_type) {
    return NextResponse.json(
      { error: 'revenue_type is required (mrr | pif | performance | passthrough | upsell | one_off)' },
      { status: 400 },
    );
  }

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
    revenue_type: revenue.revenue_type,
    revenue_segment: revenue.revenue_segment,
    term_months: revenue.term_months,
    processing_fee: revenue.processing_fee,
    passthrough_amount: revenue.passthrough_amount,
    lead_source: revenue.lead_source,
    is_first_payment: revenue.is_first_payment,
  };
  if (revenue.method) insert.method = revenue.method;
  if (revenue.stripe_invoice_id) insert.stripe_invoice_id = revenue.stripe_invoice_id;
  if (revenue.stripe_payment_intent_id) insert.stripe_payment_intent_id = revenue.stripe_payment_intent_id;
  if (status === 'paid' && !body.paid_on) insert.paid_on = billed_on;
  for (const k of ['period_start', 'period_end', 'paid_on', 'invoice_ref', 'note'] as const) {
    if (k in body && body[k] !== '') insert[k] = body[k];
  }
  // method may also come from body when resolve left it null
  if (!insert.method && body.method) insert.method = body.method;

  const { data, error } = await ctx.service
    .from('client_billings')
    .insert(insert)
    .select(BILLING_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logBillingEvent(ctx.service, {
    billingId: data.id,
    clientId: client_id,
    eventType: 'created',
    actorId: ctx.userId,
    payload: { after: data },
  });
  if (willBePaid) {
    await logBillingEvent(ctx.service, {
      billingId: data.id,
      clientId: client_id,
      eventType: 'payment',
      actorId: ctx.userId,
      payload: { amount_paid: amountPaid, status },
    });
  }

  return NextResponse.json({ billing: data });
}
