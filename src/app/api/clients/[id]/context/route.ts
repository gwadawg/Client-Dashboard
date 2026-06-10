import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { fetchClientContextPackage } from '@/lib/fetch-client-package';
import {
  canViewClientRevenue,
  redactBillingRows,
  redactClientMoneyFields,
} from '@/lib/client-revenue-access';

// GET /api/clients/[id]/context — LLM-ready structured package of client CRM data.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing', 'client_health']);
  if (denied) return denied;

  const { id } = await params;
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);

  const result = await fetchClientContextPackage(ctx.service, id, {
    includeRevenue,
    redactClient: row => redactClientMoneyFields(row),
    redactBillings: rows => redactBillingRows(rows),
  });

  if ('error' in result) {
    const status = result.error.includes('PGRST116') ? 404 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json({ context: result.pkg, can_view_revenue: includeRevenue });
}
