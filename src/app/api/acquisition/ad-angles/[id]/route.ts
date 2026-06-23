import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if ('label' in body) {
    const label = cleanString(body.label);
    if (!label) return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
    updates.label = label;
  }
  if ('sort_order' in body && typeof body.sort_order === 'number') {
    updates.sort_order = body.sort_order;
  }
  if ('is_active' in body && typeof body.is_active === 'boolean') {
    updates.is_active = body.is_active;
  }

  if (!Object.keys(updates).length) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('acquisition_ad_angles')
    .update(updates)
    .eq('id', id)
    .select('id, label, sort_order, is_active, created_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An angle with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Angle not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { id } = await params;
  const { data, error } = await ctx.service
    .from('acquisition_ad_angles')
    .update({ is_active: false })
    .eq('id', id)
    .select('id')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Angle not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
