import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agents');
  if (denied) return denied;

  const { id } = await params;
  const { phone, name } = await req.json();
  if (!phone && !name) {
    return NextResponse.json({ error: 'phone or name is required' }, { status: 400 });
  }
  const updates: Record<string, string> = {};
  if (phone) updates.phone = phone.trim();
  if (name) updates.name = name.trim();

  const { data, error } = await ctx.service
    .from('agents')
    .update(updates)
    .eq('id', id)
    .select('id, phone, name, created_at')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ agent: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agents');
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from('agents').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
