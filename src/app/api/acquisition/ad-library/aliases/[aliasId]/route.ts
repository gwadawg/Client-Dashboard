import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { notifyMrWaizLogged } from '@/lib/mr-waiz-activity-notify';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ aliasId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { aliasId } = await params;
  const { data: existing } = await ctx.service
    .from('acquisition_ad_library_aliases')
    .select('alias_name, acquisition_ad_library(ad_name)')
    .eq('id', aliasId)
    .maybeSingle();
  const { error } = await ctx.service
    .from('acquisition_ad_library_aliases')
    .delete()
    .eq('id', aliasId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const parentAd =
    existing?.acquisition_ad_library &&
    typeof existing.acquisition_ad_library === 'object' &&
    'ad_name' in existing.acquisition_ad_library
      ? String((existing.acquisition_ad_library as { ad_name: string }).ad_name)
      : null;
  void notifyMrWaizLogged(ctx.service, { userId: ctx.userId }, 'Acquisition ad alias removed', {
    item: existing?.alias_name ? String(existing.alias_name) : null,
    details: parentAd,
  });
  return NextResponse.json({ success: true });
}
