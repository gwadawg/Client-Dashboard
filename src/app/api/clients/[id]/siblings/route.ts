import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { canViewClientRevenue, redactClientMoneyFields } from '@/lib/client-revenue-access';
import {
  getAccountGroupForClient,
  getEngagementHistory,
  getSiblingClients,
} from '@/lib/client-account-groups';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;

  try {
    const [accountGroup, siblings, engagements] = await Promise.all([
      getAccountGroupForClient(ctx.service, id),
      getSiblingClients(ctx.service, id),
      getAccountGroupForClient(ctx.service, id).then(async group => {
        if (!group) return [];
        return getEngagementHistory(ctx.service, group.id);
      }),
    ]);

    const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
    const includeRevenue = canViewClientRevenue(subject);
    const redactedSiblings = includeRevenue
      ? siblings
      : siblings.map(s => redactClientMoneyFields(s));

    return NextResponse.json({
      account_group: accountGroup,
      siblings: redactedSiblings,
      engagements,
      can_view_revenue: includeRevenue,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
