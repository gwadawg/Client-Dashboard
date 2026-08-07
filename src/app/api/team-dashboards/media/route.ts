import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, type AuthContext } from '@/lib/api-auth';
import { canAccessTeamCommandApi } from '@/lib/team-dashboards/access';
import { buildMediaBuyerCommandPayload } from '@/lib/team-dashboards/media';
import { createTtlCache } from '@/lib/ttl-cache';

const mediaCommandCache = createTtlCache<unknown>(45_000);

async function canAccess(ctx: AuthContext): Promise<boolean> {
  const { data: linked } = await ctx.service
    .from('agents')
    .select('pay_type')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  return canAccessTeamCommandApi({
    isOwner: ctx.isOwner,
    isAdmin: ctx.isAdmin,
    allowedPermissions: ctx.allowedPermissions,
    payType: linked?.pay_type,
  });
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  if (!(await canAccess(ctx))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cacheKey = 'media-command';
  const cached = mediaCommandCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  }

  try {
    const payload = await buildMediaBuyerCommandPayload(ctx.service);
    mediaCommandCache.set(cacheKey, payload);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
