import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { notifyMrWaizLogged } from '@/lib/mr-waiz-activity-notify';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ aliasId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { aliasId } = await params;
  const { data: existing } = await ctx.service
    .from('ad_library_aliases')
    .select('alias_name, ad_library(ad_name)')
    .eq('id', aliasId)
    .maybeSingle();
  const { error } = await ctx.service.from('ad_library_aliases').delete().eq('id', aliasId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const parentAd =
    existing?.ad_library &&
    typeof existing.ad_library === 'object' &&
    'ad_name' in existing.ad_library
      ? String((existing.ad_library as { ad_name: string }).ad_name)
      : null;
  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Ad alias removed', {
    item: existing?.alias_name ? String(existing.alias_name) : null,
    details: parentAd,
  });
  return NextResponse.json({ success: true });
}
