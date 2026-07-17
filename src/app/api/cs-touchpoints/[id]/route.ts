import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

type PatchBody = {
  action?: 'done' | 'snooze' | 'skip';
  slack_sent?: boolean;
  slack_snippet?: string;
  completion_note?: string;
  snoozed_until?: string;
};

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { id } = await params;
  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action;
  if (!action || !['done', 'snooze', 'skip'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be done | snooze | skip' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  if (action === 'done') {
    const snippet = body.slack_snippet?.trim() ?? '';
    if (!body.slack_sent || !snippet) {
      return NextResponse.json(
        { error: 'Completing requires slack_sent=true and a non-empty slack_snippet' },
        { status: 400 },
      );
    }
    updates.status = 'done';
    updates.slack_sent = true;
    updates.slack_snippet = snippet;
    updates.completion_note = body.completion_note?.trim() || null;
    updates.completed_at = now;
    updates.completed_by = ctx.userId;
    updates.snoozed_until = null;
  } else if (action === 'snooze') {
    const until = body.snoozed_until;
    if (!until || !Number.isFinite(new Date(until).getTime())) {
      return NextResponse.json(
        { error: 'snoozed_until must be a valid ISO datetime' },
        { status: 400 },
      );
    }
    updates.status = 'snoozed';
    updates.snoozed_until = new Date(until).toISOString();
  } else {
    updates.status = 'skipped';
    updates.completed_at = now;
    updates.completed_by = ctx.userId;
    updates.completion_note = body.completion_note?.trim() || null;
    updates.snoozed_until = null;
  }

  const { data, error } = await ctx.service
    .from('cs_touchpoints')
    .update(updates)
    .eq('id', id)
    .select(
      'id, client_id, touchpoint_type, cycle_key, status, due_at, completed_at, snoozed_until, slack_sent, slack_snippet, completion_note',
    )
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ row: data });
}
