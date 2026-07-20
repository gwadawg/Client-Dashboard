import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, type AuthContext } from '@/lib/api-auth';
import { hasPermission } from '@/lib/permissions';
import { buildMediaBuyerCommandPayload } from '@/lib/team-dashboards/media';

async function canAccessMediaCommand(ctx: AuthContext): Promise<boolean> {
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  if (ctx.isAdmin || hasPermission('team_dashboard_media', subject)) return true;

  const { data: linked } = await ctx.service
    .from('agents')
    .select('pay_type')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  return linked?.pay_type === 'media_buyer' || linked?.pay_type === 'operations';
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  if (!(await canAccessMediaCommand(ctx))) {
    const denied = requirePermission(ctx, 'team_dashboard_media');
    if (denied) return denied;
  }

  try {
    const payload = await buildMediaBuyerCommandPayload(ctx.service);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
