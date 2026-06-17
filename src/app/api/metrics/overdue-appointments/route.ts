import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { getLiveClientIds } from '@/lib/db-helpers';
import { countOverdueUndispositioned } from '@/lib/appointments';

// Count of past-due, un-dispositioned appointments for the dashboard. Scoped by
// client (or live set) but intentionally NOT by date — it always reflects the
// full backlog regardless of the dashboard's date filter.
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['dashboard', 'agents']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const live_only = searchParams.get('live_only') === 'true';

  let liveClientIds: string[] | null = null;
  if (live_only && !client_id) {
    liveClientIds = await getLiveClientIds(ctx.service);
  }

  try {
    const count = await countOverdueUndispositioned(ctx.service, {
      clientId: client_id,
      liveClientIds,
    });
    return NextResponse.json({ count });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to count overdue appointments';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
