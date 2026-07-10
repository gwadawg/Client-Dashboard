import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import {
  BILLING_LEDGER_FIELDS,
  loadClientBillingProbes,
  logBillingEvent,
  resolveRevenueDefaults,
  type ResolvedRevenue,
} from '@/lib/billing-revenue';

const BILLING_FIELDS = BILLING_LEDGER_FIELDS;

// PATCH /api/billings/[id] — mark paid / record a partial payment / adjust the
// breakdown / extend the due date / re-disposition a billing row.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const { id } = await params;
  const body = await req.json();

  const { data: current, error: loadErr } = await ctx.service
    .from('client_billings')
    .select(BILLING_FIELDS)
    .eq('id', id)
    .single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });

  const updates: Record<string, unknown> = {};

  for (const k of ['billed_on', 'due_date', 'period_start', 'period_end', 'invoice_ref', 'note'] as const) {
    if (k in body) updates[k] = body[k];
  }

  const touchesBreakdown = ['base_amount', 'performance_amount', 'late_fee', 'discount'].some(k => k in body) || 'amount' in body;
  const base = 'base_amount' in body ? Number(body.base_amount)
    : Number(current.base_amount ?? current.amount) || 0;
  const performance = 'performance_amount' in body ? Number(body.performance_amount)
    : Number(current.performance_amount) || 0;
  const lateFee = 'late_fee' in body ? Number(body.late_fee)
    : Number(current.late_fee) || 0;
  const discount = 'discount' in body ? Number(body.discount)
    : Number(current.discount) || 0;
  let amount = Number(current.amount) || 0;
  if (touchesBreakdown) {
    amount = base + performance + lateFee - discount;
    updates.base_amount = base;
    updates.performance_amount = performance;
    updates.late_fee = lateFee;
    updates.discount = discount;
    updates.amount = amount;
  }

  const wantsPaid = body.status === 'paid' || body.markPaid === true;
  let amountPaid = Number(current.amount_paid) || 0;
  if (wantsPaid) {
    amountPaid = amount;
    updates.amount_paid = amountPaid;
  } else if ('amount_paid' in body) {
    amountPaid = Number(body.amount_paid) || 0;
    updates.amount_paid = amountPaid;
  }

  if (body.status) {
    updates.status = body.status;
  } else if (wantsPaid) {
    updates.status = 'paid';
  } else if ('amount_paid' in body || touchesBreakdown) {
    if (amount > 0 && amountPaid >= amount) updates.status = 'paid';
    else if (amountPaid > 0) updates.status = 'partial';
    else updates.status = 'pending';
  }

  if ('paid_on' in body) {
    updates.paid_on = body.paid_on;
  } else if (updates.status === 'paid' && !current.paid_on) {
    updates.paid_on = new Date().toISOString().slice(0, 10);
  }

  const nextStatus = (updates.status as string | undefined) ?? current.status;
  const willBePaid =
    nextStatus === 'paid' ||
    amountPaid > 0 ||
    (Number(current.amount_paid) || 0) > 0;

  const touchesRevenue = [
    'revenue_type',
    'revenue_segment',
    'term_months',
    'processing_fee',
    'passthrough_amount',
    'lead_source',
    'method',
    'stripe_invoice_id',
    'stripe_payment_intent_id',
  ].some((k) => k in body);

  if (touchesRevenue || wantsPaid || ('amount_paid' in body && amountPaid > 0)) {
    const { data: client, error: clientErr } = await ctx.service
      .from('clients')
      .select('id, billing_type, source, contract_term_months')
      .eq('id', current.client_id)
      .single();
    if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 404 });

    let probes;
    try {
      probes = await loadClientBillingProbes(ctx.service, current.client_id);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to load billings' },
        { status: 500 },
      );
    }

    const currentRevenue: Partial<ResolvedRevenue> = {
      revenue_type: current.revenue_type,
      revenue_segment: current.revenue_segment,
      term_months: current.term_months,
      processing_fee: Number(current.processing_fee) || 0,
      passthrough_amount: Number(current.passthrough_amount) || 0,
      lead_source: current.lead_source,
      method: current.method,
      stripe_invoice_id: current.stripe_invoice_id,
      stripe_payment_intent_id: current.stripe_payment_intent_id,
    };

    const revenue = resolveRevenueDefaults({
      client,
      existingBillings: probes,
      input: body,
      willBePaid,
      excludeBillingId: id,
      current: currentRevenue,
    });
    if (revenue.error) return NextResponse.json({ error: revenue.error }, { status: 400 });

    updates.revenue_type = revenue.revenue_type;
    updates.revenue_segment = revenue.revenue_segment;
    updates.term_months = revenue.term_months;
    updates.processing_fee = revenue.processing_fee;
    updates.passthrough_amount = revenue.passthrough_amount;
    updates.lead_source = revenue.lead_source;
    updates.method = revenue.method;
    updates.stripe_invoice_id = revenue.stripe_invoice_id;
    updates.stripe_payment_intent_id = revenue.stripe_payment_intent_id;
    updates.is_first_payment = revenue.is_first_payment;
  }

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });

  const { data, error } = await ctx.service
    .from('client_billings')
    .update(updates)
    .eq('id', id)
    .select(BILLING_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const becamePaid =
    (updates.status === 'paid' || wantsPaid) && current.status !== 'paid';
  const amountPaidChanged =
    'amount_paid' in updates && Number(updates.amount_paid) !== Number(current.amount_paid);

  if (becamePaid || amountPaidChanged) {
    await logBillingEvent(ctx.service, {
      billingId: id,
      clientId: current.client_id,
      eventType: 'payment',
      actorId: ctx.userId,
      payload: { before: current, after: data },
    });
  } else if (updates.status && updates.status !== current.status) {
    await logBillingEvent(ctx.service, {
      billingId: id,
      clientId: current.client_id,
      eventType: 'status_changed',
      actorId: ctx.userId,
      payload: { before: current.status, after: updates.status },
    });
  } else {
    await logBillingEvent(ctx.service, {
      billingId: id,
      clientId: current.client_id,
      eventType: 'updated',
      actorId: ctx.userId,
      payload: { before: current, after: data },
    });
  }

  return NextResponse.json({ billing: data });
}

// DELETE /api/billings/[id] — soft-void; row stays in the ledger for audit.
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const { id } = await params;

  const { data: current, error: loadErr } = await ctx.service
    .from('client_billings')
    .select(BILLING_FIELDS)
    .eq('id', id)
    .single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });

  const { data, error } = await ctx.service
    .from('client_billings')
    .update({
      status: 'voided',
      voided_at: new Date().toISOString(),
      voided_by: ctx.userId,
    })
    .eq('id', id)
    .neq('status', 'voided')
    .select(BILLING_FIELDS)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  await logBillingEvent(ctx.service, {
    billingId: id,
    clientId: current.client_id,
    eventType: 'voided',
    actorId: ctx.userId,
    payload: { before: current, after: data },
  });

  return NextResponse.json({ billing: data, voided: true });
}
