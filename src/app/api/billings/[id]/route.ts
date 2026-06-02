import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';

const BILLING_FIELDS =
  'id, client_id, billed_on, period_start, period_end, amount, status, paid_on, method, invoice_ref, note, created_at';

// PATCH /api/billings/[id] — mark paid / edit a billing row
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { id } = await params;
  const body = await req.json();

  const allowed = [
    'billed_on', 'period_start', 'period_end', 'amount',
    'status', 'paid_on', 'method', 'invoice_ref', 'note',
  ];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in body) updates[k] = k === 'amount' ? Number(body[k]) : body[k];
  }

  // Convenience: marking paid stamps today's date unless one is supplied.
  if (updates.status === 'paid' && !('paid_on' in updates)) {
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

// DELETE /api/billings/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { id } = await params;
  const { error } = await ctx.service.from('client_billings').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
