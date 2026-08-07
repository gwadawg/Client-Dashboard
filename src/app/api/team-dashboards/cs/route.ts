import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { canAccessTeamCommandApi } from '@/lib/team-dashboards/access';
import { buildCsCommandPayload } from '@/lib/team-dashboards/cs';
import { createTtlCache } from '@/lib/ttl-cache';

const csCommandCache = createTtlCache<unknown>(45_000);

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { data: linked } = await ctx.service
    .from('agents')
    .select('pay_type')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  if (
    !canAccessTeamCommandApi({
      isOwner: ctx.isOwner,
      isAdmin: ctx.isAdmin,
      allowedPermissions: ctx.allowedPermissions,
      payType: linked?.pay_type,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const cacheKey = 'cs-command';
  const cached = csCommandCache.get(cacheKey);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  }

  try {
    const payload = await buildCsCommandPayload(ctx.service);
    csCommandCache.set(cacheKey, payload);
    return NextResponse.json(payload, {
      headers: { 'Cache-Control': 'private, max-age=20' },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
