import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';
import {
  computeObjectionDeadline,
  computePerformanceAmount,
  deriveCycleStatus,
} from '@/lib/billing-model';
import {
  BILLING_LEDGER_FIELDS,
  loadClientBillingProbes,
  logBillingEvent,
  resolveRevenueDefaults,
} from '@/lib/billing-revenue';

const CYCLE_FIELDS =
  'id, client_id, period_start, period_end, base_amount, show_count, bailed_count, pay_per_show, pay_per_bailed, performance_amount, discount, status, report_sent_at, objection_deadline_at, dispute_note, billing_id, note, created_at, updated_at';

const BILLING_FIELDS = BILLING_LEDGER_FIELDS;

function recomputePerformance(row: {
  show_count: number;
  bailed_count: number;
  pay_per_show: number;
  pay_per_bailed: number;
}) {
  return computePerformanceAmount(
    { show_count: row.show_count, bailed_count: row.bailed_count },
    { pay_per_show: row.pay_per_show, pay_per_bailed: row.pay_per_bailed },
  );
}

// PATCH /api/billing-cycles/[id] — update counts, mark report sent, dispute, resolve
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
    .from('client_billing_cycles')
    .select(CYCLE_FIELDS)
    .eq('id', id)
    .single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });

  if (current.status === 'billed' || current.status === 'voided') {
    return NextResponse.json({ error: 'Cannot edit a billed or voided cycle' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  const showCount = 'show_count' in body ? Math.max(0, Number(body.show_count) || 0) : Number(current.show_count) || 0;
  const bailedCount = 'bailed_count' in body ? Math.max(0, Number(body.bailed_count) || 0) : Number(current.bailed_count) || 0;
  const payPerShow = 'pay_per_show' in body ? Number(body.pay_per_show) || 0 : Number(current.pay_per_show) || 0;
  const payPerBailed = 'pay_per_bailed' in body ? Number(body.pay_per_bailed) || 0 : Number(current.pay_per_bailed) || 0;
  const baseAmount = 'base_amount' in body ? Number(body.base_amount) || 0 : Number(current.base_amount) || 0;
  const discount = 'discount' in body ? Number(body.discount) || 0 : Number(current.discount) || 0;

  if (
    'show_count' in body ||
    'bailed_count' in body ||
    'pay_per_show' in body ||
    'pay_per_bailed' in body ||
    'base_amount' in body ||
    'discount' in body
  ) {
    updates.show_count = showCount;
    updates.bailed_count = bailedCount;
    updates.pay_per_show = payPerShow;
    updates.pay_per_bailed = payPerBailed;
    updates.base_amount = baseAmount;
    updates.discount = discount;
    updates.performance_amount = recomputePerformance({
      show_count: showCount,
      bailed_count: bailedCount,
      pay_per_show: payPerShow,
      pay_per_bailed: payPerBailed,
    });
  }

  for (const k of ['period_start', 'period_end', 'note'] as const) {
    if (k in body) updates[k] = body[k] || null;
  }

  if (body.action === 'mark_report_sent') {
    const sentAt = new Date();
    const deadline = computeObjectionDeadline(sentAt);
    updates.status = 'report_sent';
    updates.report_sent_at = sentAt.toISOString();
    updates.objection_deadline_at = deadline.toISOString();
    updates.dispute_note = null;
  } else if (body.action === 'mark_disputed') {
    if (current.status !== 'report_sent') {
      return NextResponse.json({ error: 'Can only dispute during the objection window' }, { status: 400 });
    }
    updates.status = 'disputed';
    updates.dispute_note = typeof body.dispute_note === 'string' ? body.dispute_note.trim() || null : null;
  } else if (body.action === 'resolve_dispute') {
    if (current.status !== 'disputed') {
      return NextResponse.json({ error: 'Cycle is not disputed' }, { status: 400 });
    }
    updates.status = 'ready_to_bill';
  } else if (body.action === 'void') {
    updates.status = 'voided';
  } else if (body.status === 'ready_to_bill' && current.status === 'draft') {
    // Manual skip of objection window (admin override)
    updates.status = 'ready_to_bill';
  }

  const { data, error } = await ctx.service
    .from('client_billing_cycles')
    .update(updates)
    .eq('id', id)
    .select(CYCLE_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const effectiveStatus = deriveCycleStatus({
    status: data.status,
    report_sent_at: data.report_sent_at,
    objection_deadline_at: data.objection_deadline_at,
  });

  return NextResponse.json({ cycle: { ...data, effective_status: effectiveStatus } });
}

// DELETE /api/billing-cycles/[id] — void cycle
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;

  const { id } = await params;
  const { data, error } = await ctx.service
    .from('client_billing_cycles')
    .update({ status: 'voided', updated_at: new Date().toISOString() })
    .eq('id', id)
    .neq('status', 'billed')
    .select(CYCLE_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cycle: data, voided: true });
}

// POST /api/billing-cycles/[id]/bill — create ledger row and close cycle
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_billing');
  if (denied) return denied;
  const revenueDenied = requireClientRevenue(ctx);
  if (revenueDenied) return revenueDenied;

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const { data: cycle, error: loadErr } = await ctx.service
    .from('client_billing_cycles')
    .select(CYCLE_FIELDS)
    .eq('id', id)
    .single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });

  const effective = deriveCycleStatus({
    status: cycle.status,
    report_sent_at: cycle.report_sent_at,
    objection_deadline_at: cycle.objection_deadline_at,
  });
  if (
    effective !== 'ready_to_bill' &&
    cycle.status !== 'ready_to_bill' &&
    cycle.status !== 'disputed'
  ) {
    return NextResponse.json({ error: 'Cycle is not ready to bill yet' }, { status: 400 });
  }
  if (cycle.status === 'billed') {
    return NextResponse.json({ error: 'Cycle already billed' }, { status: 400 });
  }

  const base = Number(cycle.base_amount) || 0;
  const performance = Number(cycle.performance_amount) || 0;
  const discount = Number(cycle.discount) || 0;
  const amount = base + performance - discount;
  const billedOn = typeof body.billed_on === 'string' ? body.billed_on : new Date().toISOString().slice(0, 10);
  const wantsPaid = body.markPaid === true || body.status === 'paid';

  const { data: client, error: clientErr } = await ctx.service
    .from('clients')
    .select('id, billing_type, source, contract_term_months')
    .eq('id', cycle.client_id)
    .single();
  if (clientErr) return NextResponse.json({ error: clientErr.message }, { status: 404 });

  let probes;
  try {
    probes = await loadClientBillingProbes(ctx.service, cycle.client_id);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load billings' },
      { status: 500 },
    );
  }

  const revenue = resolveRevenueDefaults({
    client,
    existingBillings: probes,
    input: {
      revenue_type: 'performance',
      revenue_segment: body.revenue_segment,
      method: body.method,
      note: body.note,
      processing_fee: body.processing_fee,
      stripe_invoice_id: body.stripe_invoice_id,
      stripe_payment_intent_id: body.stripe_payment_intent_id,
      lead_source: body.lead_source,
    },
    willBePaid: wantsPaid,
  });
  if (revenue.error) return NextResponse.json({ error: revenue.error }, { status: 400 });

  const billingInsert = {
    client_id: cycle.client_id,
    billed_on: billedOn,
    due_date: body.due_date || billedOn,
    period_start: cycle.period_start,
    period_end: cycle.period_end,
    base_amount: base,
    performance_amount: performance,
    late_fee: 0,
    discount,
    amount,
    amount_paid: wantsPaid ? amount : 0,
    status: wantsPaid ? 'paid' : 'pending',
    paid_on: wantsPaid ? (body.paid_on || billedOn) : null,
    method: revenue.method || body.method || null,
    note: body.note || cycle.note || null,
    revenue_type: 'performance',
    revenue_segment: revenue.revenue_segment ?? 'back_end',
    term_months: revenue.term_months,
    processing_fee: revenue.processing_fee,
    passthrough_amount: revenue.passthrough_amount,
    lead_source: revenue.lead_source,
    stripe_invoice_id: revenue.stripe_invoice_id,
    stripe_payment_intent_id: revenue.stripe_payment_intent_id,
    is_first_payment: revenue.is_first_payment,
    created_by: ctx.userId,
  };

  const { data: billing, error: billErr } = await ctx.service
    .from('client_billings')
    .insert(billingInsert)
    .select(BILLING_FIELDS)
    .single();
  if (billErr) return NextResponse.json({ error: billErr.message }, { status: 500 });

  await logBillingEvent(ctx.service, {
    billingId: billing.id,
    clientId: cycle.client_id,
    eventType: 'created',
    actorId: ctx.userId,
    payload: { after: billing, source: 'performance_cycle', cycle_id: id },
  });
  if (wantsPaid) {
    await logBillingEvent(ctx.service, {
      billingId: billing.id,
      clientId: cycle.client_id,
      eventType: 'payment',
      actorId: ctx.userId,
      payload: { amount_paid: amount, status: 'paid' },
    });
  }

  const { data: updated, error: cycleErr } = await ctx.service
    .from('client_billing_cycles')
    .update({
      status: 'billed',
      billing_id: billing.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(CYCLE_FIELDS)
    .single();
  if (cycleErr) return NextResponse.json({ error: cycleErr.message }, { status: 500 });

  return NextResponse.json({ cycle: updated, billing });
}
