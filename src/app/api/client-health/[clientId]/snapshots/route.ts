import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

const FIELDS =
  'id, period_start, period_end, window_code, cpconv, cpql, cpl, conversation_yield, show_rate, booking_rate, lead_to_qual, attention_score, worst_tier, primary_constraint, constraint_label, ai_diagnosis, created_at, created_by';

// GET /api/client-health/[clientId]/snapshots — frozen health verdict history.
export async function GET(req: Request, { params }: { params: Promise<{ clientId: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { clientId } = await params;
  const limitParam = Number(new URL(req.url).searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100 ? limitParam : 20;

  const { data, error } = await ctx.service
    .from('client_health_snapshots')
    .select(FIELDS)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ snapshots: data ?? [] });
}
