import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers } from '@/lib/api-auth';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service
    .from('dial_examples')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq('id', id)
    .is('deleted_at', null);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
