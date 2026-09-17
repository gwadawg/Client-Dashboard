import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ aliasId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { aliasId } = await params;
  const { error } = await ctx.service.from('ad_library_aliases').delete().eq('id', aliasId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
