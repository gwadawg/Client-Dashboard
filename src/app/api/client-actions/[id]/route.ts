import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

const MUTABLE_STATUSES = ['planned', 'in_progress', 'measuring', 'succeeded', 'failed', 'abandoned'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();

  const update: Record<string, unknown> = {};
  if (body.status != null) {
    if (!MUTABLE_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'invalid status' }, { status: 400 });
    }
    update.status = body.status;
  }
  if (body.outcome_value !== undefined) {
    update.outcome_value = body.outcome_value != null ? Number(body.outcome_value) : null;
    update.outcome_recorded_at = new Date().toISOString();
  }
  if (body.outcome_notes !== undefined) update.outcome_notes = body.outcome_notes;
  if (body.title !== undefined) update.title = body.title;
  if (body.change_description !== undefined) update.change_description = body.change_description;
  if (body.hypothesis !== undefined) update.hypothesis = body.hypothesis;
  if (body.success_metric !== undefined) update.success_metric = body.success_metric;
  if (body.target_value !== undefined) {
    update.target_value = body.target_value != null ? Number(body.target_value) : null;
  }
  if (body.review_date !== undefined) update.review_date = body.review_date;
  if (body.change_date !== undefined) update.change_date = body.change_date;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'no updatable fields provided' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('client_action_logs')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from('client_action_logs').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
