import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { hasPermission } from '@/lib/permissions';
import { buildCcmCommandPayload } from '@/lib/team-dashboards/ccm';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const permitted =
    ctx.isAdmin ||
    hasPermission('team_dashboard_ccm', subject);

  if (!permitted) {
    const { data: linked } = await ctx.service
      .from('agents')
      .select('pay_type')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (linked?.pay_type !== 'ccm') {
      const denied = requirePermission(ctx, 'team_dashboard_ccm');
      if (denied) return denied;
    }
  }

  try {
    const payload = await buildCcmCommandPayload(ctx.service);
    return NextResponse.json(payload);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
