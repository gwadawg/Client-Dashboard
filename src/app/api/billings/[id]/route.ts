import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireClientRevenue } from '@/lib/api-auth';

const BILLING_FIELDS =
  'id, client_id, billed_on, due_date, period_start, period_end, amount, base_amount, performance_amount, late_fee, discount, amount_paid, status, paid_on, method, invoice_ref, note, voided_at, created_at';

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

  // Load the current row so breakdown/total/status stay consistent when only a
  // subset of fields is patched.
  const { data: current, error: loadErr } = await ctx.service
    .from('client_billings')
    .select(BILLING_FIELDS)
    .eq('id', id)
    .single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 404 });

  const updates: Record<string, unknown> = {};

  for (const k of ['billed_on', 'due_date', 'period_start', 'period_end', 'method', 'invoice_ref', 'note'] as const) {
    if (k in body) updates[k] = body[k];
  }

  // Recompute the total when any breakdown piece is adjusted.
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

  // Payment handling.
  const wantsPaid = body.status === 'paid' || body.markPaid === true;
  let amountPaid = Number(current.amount_paid) || 0;
  if (wantsPaid) {
    amountPaid = amount;
    updates.amount_paid = amountPaid;
  } else if ('amount_paid' in body) {
    amountPaid = Number(body.amount_paid) || 0;
    updates.amount_paid = amountPaid;
  }

  // Status: explicit wins; otherwise derive from how much is now paid.
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

  if (Object.keys(updates).length === 0)
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400 });

  const { data, error } = await ctx.service
    .from('client_billings')
    .update(updates)
    .eq('id', id)
    .select(BILLING_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
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
  return NextResponse.json({ billing: data, voided: true });
}
