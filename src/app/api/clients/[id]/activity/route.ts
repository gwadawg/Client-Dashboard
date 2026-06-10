import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';

const ACTIVITY_FIELDS =
  'client_id, source_id, activity_type, occurred_at, subtype, summary, source_table';

// GET /api/clients/[id]/activity — unified account timeline from v_client_activity.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing', 'client_health']);
  if (denied) return denied;

  const { id } = await params;
  const limitParam = Number(new URL(req.url).searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 500 ? limitParam : 100;

  const { data, error } = await ctx.service
    .from('v_client_activity')
    .select(ACTIVITY_FIELDS)
    .eq('client_id', id)
    .order('occurred_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ activities: data ?? [] });
}
