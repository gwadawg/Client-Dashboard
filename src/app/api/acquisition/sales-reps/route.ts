import { NextRequest, NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers } from '@/lib/api-auth';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { data: reps, error } = await ctx.service
    .from('sales_reps')
    .select('*, sales_rep_compensation_versions(*)')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reps: reps ?? [] });
}

export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body?.action) return NextResponse.json({ error: 'action required' }, { status: 400 });

  if (body.action === 'create_rep') {
    const { data, error } = await ctx.service
      .from('sales_reps')
      .insert({
        name: String(body.name).trim(),
        role: body.role ?? 'setter',
        is_active: body.is_active !== false,
      })
      .select('id')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (body.action === 'add_compensation_version') {
    const repId = body.sales_rep_id;
    if (!repId) return NextResponse.json({ error: 'sales_rep_id required' }, { status: 400 });
    const effectiveFrom = body.effective_from ?? new Date().toISOString().slice(0, 10);

    await ctx.service
      .from('sales_rep_compensation_versions')
      .update({ effective_to: effectiveFrom })
      .eq('sales_rep_id', repId)
      .is('effective_to', null);

    const { data, error } = await ctx.service
      .from('sales_rep_compensation_versions')
      .insert({
        sales_rep_id: repId,
        effective_from: effectiveFrom,
        rates: body.rates ?? {},
        note: body.note ?? null,
        created_by: ctx.userId,
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true, id: data.id });
  }

  if (body.action === 'update_rep') {
    const { error } = await ctx.service
      .from('sales_reps')
      .update({
        name: body.name,
        role: body.role,
        is_active: body.is_active,
      })
      .eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
