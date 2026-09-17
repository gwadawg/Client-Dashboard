import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers } from '@/lib/api-auth';
import { notifyMrWaizLogged } from '@/lib/mr-waiz-activity-notify';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;

  const { data: existing } = await ctx.service
    .from('dial_examples')
    .select('title, domain, grade')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle();

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

  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Dial example deleted', {
    item: existing?.title ? String(existing.title) : null,
    details: existing?.domain ? String(existing.domain) : null,
    status: existing?.grade ? String(existing.grade) : null,
  });

  return NextResponse.json({ ok: true });
}
