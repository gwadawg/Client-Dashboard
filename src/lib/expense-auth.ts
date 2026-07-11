import { NextResponse } from 'next/server';
import { requireClientRevenue, type AuthContext } from '@/lib/api-auth';
import { hasPermission } from '@/lib/permissions';

/** CEO Business view or Expenses view + revenue capability. */
export function requireExpenseAccess(ctx: AuthContext): NextResponse | null {
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  if (!hasPermission('expenses', subject) && !hasPermission('ceo', subject)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return requireClientRevenue(ctx);
}
