import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requireExpenseAccess } from '@/lib/expense-auth';
import { isCeoBucket, type CeoBucket } from '@/lib/expenses';

const FIELDS =
  'id, occurred_on, amount, currency, account_id, source, merchant_raw, merchant_normalized, memo, external_id, ceo_bucket, subcategory, exclude_from_pnl, categorized_by, rule_id, payroll_run_id, client_id, created_at, updated_at';

type Ctx = Exclude<Awaited<ReturnType<typeof getAuthContext>>, NextResponse>;

async function loadExpense(ctx: Ctx, id: string) {
  return ctx.service.from('business_expenses').select(FIELDS).eq('id', id).maybeSingle();
}

// PATCH /api/expenses/[id] — recategorize / edit
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { data: existing, error: findErr } = await loadExpense(ctx, id);
  if (findErr) return NextResponse.json({ error: findErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.occurred_on === 'string' && /^\d{4}-\d{2}-\d{2}/.test(body.occurred_on)) {
    patch.occurred_on = body.occurred_on.slice(0, 10);
  }
  if (body.amount != null) {
    const n = Number(body.amount);
    if (!Number.isFinite(n) || n === 0) {
      return NextResponse.json({ error: 'amount must be a non-zero number' }, { status: 400 });
    }
    patch.amount = Math.abs(n);
  }
  if (typeof body.merchant_raw === 'string') {
    patch.merchant_raw = body.merchant_raw.trim() || null;
    const { normalizeMerchant } = await import('@/lib/expenses');
    patch.merchant_normalized = normalizeMerchant(body.merchant_raw) || null;
  }
  if (typeof body.memo === 'string') patch.memo = body.memo.trim() || null;
  if (body.account_id === null) patch.account_id = null;
  else if (typeof body.account_id === 'string') patch.account_id = body.account_id;

  if (isCeoBucket(body.ceo_bucket)) {
    patch.ceo_bucket = body.ceo_bucket as CeoBucket;
    patch.categorized_by = 'user';
    patch.rule_id = null;
    if (
      body.ceo_bucket === 'personal' ||
      body.ceo_bucket === 'owner_draw' ||
      body.ceo_bucket === 'passthrough'
    ) {
      if (body.exclude_from_pnl === undefined) patch.exclude_from_pnl = true;
    }
  }
  if (typeof body.subcategory === 'string') patch.subcategory = body.subcategory.trim() || null;
  if (typeof body.exclude_from_pnl === 'boolean') patch.exclude_from_pnl = body.exclude_from_pnl;

  const { data, error } = await ctx.service
    .from('business_expenses')
    .update(patch)
    .eq('id', id)
    .select(FIELDS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ expense: data });
}

// DELETE /api/expenses/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const blocked = requireExpenseAccess(ctx);
  if (blocked) return blocked;

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const { error } = await ctx.service.from('business_expenses').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
