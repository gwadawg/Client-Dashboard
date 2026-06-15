import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { listPendingEventGroups, countPendingEvents } from '@/lib/pending-events';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  try {
    const [groups, total] = await Promise.all([
      listPendingEventGroups(ctx.service),
      countPendingEvents(ctx.service),
    ]);
    const { data: clients } = await ctx.service.from('clients').select('id, name, ghl_location_id');
    return NextResponse.json({ total, groups, clients: clients ?? [] });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
