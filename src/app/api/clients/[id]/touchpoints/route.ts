import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { CS_TOUCHPOINT_LABELS } from '@/lib/cs-touchpoints';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [
    'client_health',
    'admin_clients',
    'ops_overview',
  ]);
  if (denied) return denied;

  const { id } = await params;

  const { data, error } = await ctx.service
    .from('cs_touchpoints')
    .select(
      'id, client_id, touchpoint_type, cycle_key, status, due_at, triggered_at, completed_at, snoozed_until, trigger_source, source_ref, playbook_stage, slack_sent, slack_snippet, completion_note, created_at, updated_at',
    )
    .eq('client_id', id)
    .order('due_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  return NextResponse.json({
    open: rows.filter(r => r.status === 'open' || r.status === 'snoozed'),
    history: rows.filter(r => r.status === 'done' || r.status === 'skipped'),
    labels: CS_TOUCHPOINT_LABELS,
  });
}
