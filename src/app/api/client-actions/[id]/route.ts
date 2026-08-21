import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { freezeInterventionBaseline } from '@/lib/client-action-log-write';
import { defaultReviewDateFromTimebox } from '@/lib/client-health-interventions';
import {
  betRequiresLoom,
  isWorkType,
  normalizeLoomUrl,
  parseBetCategory,
  shouldFreezeBaseline,
} from '@/lib/client-work-log';

const MUTABLE_STATUSES = ['planned', 'in_progress', 'measuring', 'succeeded', 'failed', 'abandoned'];

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await ctx.service
    .from('client_action_logs')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
  if (body.planned_date !== undefined) update.planned_date = body.planned_date || null;
  if (body.work_type != null) {
    if (!isWorkType(body.work_type)) {
      return NextResponse.json({ error: 'invalid work_type' }, { status: 400 });
    }
    update.work_type = body.work_type;
  }
  if (body.bet_category !== undefined) {
    if (body.bet_category === null || body.bet_category === '') {
      update.bet_category = null;
    } else {
      const cat = parseBetCategory(body.bet_category);
      if (!cat) {
        return NextResponse.json({ error: 'invalid bet_category' }, { status: 400 });
      }
      update.bet_category = cat;
    }
  }
  if (body.loom_url !== undefined) {
    if (body.loom_url === null || body.loom_url === '') {
      update.loom_url = null;
    } else {
      const loom = normalizeLoomUrl(body.loom_url);
      if (!loom) {
        return NextResponse.json({ error: 'loom_url must be a valid loom.com link' }, { status: 400 });
      }
      update.loom_url = loom;
    }
  }

  const promoting =
    body.promote === true ||
    (existing.work_type === 'finding' && (body.work_type === 'bet' || body.promote === true));

  if (promoting) {
    update.work_type = 'bet';
    update.status = typeof body.status === 'string' ? body.status : 'in_progress';
    if (body.hypothesis !== undefined) update.hypothesis = body.hypothesis;
    if (body.success_metric !== undefined) update.success_metric = body.success_metric;
    const today = new Date().toISOString().split('T')[0];
    update.change_date =
      typeof body.change_date === 'string' && body.change_date.trim()
        ? body.change_date.trim()
        : existing.change_date || today;
    update.review_date =
      typeof body.review_date === 'string' && body.review_date.trim()
        ? body.review_date.trim()
        : existing.review_date || defaultReviewDateFromTimebox('7 days');
    if (body.target_value !== undefined) {
      update.target_value = body.target_value != null ? Number(body.target_value) : null;
    }
    const promoteCat = parseBetCategory(body.bet_category) ?? parseBetCategory(existing.bet_category);
    if (!promoteCat) {
      return NextResponse.json({ error: 'bet_category is required to promote to a bet' }, { status: 400 });
    }
    update.bet_category = promoteCat;
  }

  const nextStatus = (update.status as string | undefined) ?? existing.status;
  const nextWorkType = (update.work_type as string | undefined) ?? existing.work_type ?? 'bet';
  let nextChangeDate =
    (update.change_date as string | null | undefined) !== undefined
      ? (update.change_date as string | null)
      : existing.change_date;

  const goingLive =
    existing.status === 'planned' &&
    nextStatus !== 'planned' &&
    nextWorkType === 'bet';
  if (goingLive && !nextChangeDate) {
    nextChangeDate = new Date().toISOString().split('T')[0];
    update.change_date = nextChangeDate;
    update.status = nextStatus === 'planned' ? 'in_progress' : nextStatus;
  }

  const nextLoom =
    (update.loom_url as string | null | undefined) !== undefined
      ? (update.loom_url as string | null)
      : (existing.loom_url as string | null);
  const nextCategory =
    (update.bet_category as string | null | undefined) !== undefined
      ? (update.bet_category as string | null)
      : (existing.bet_category as string | null);

  if (nextWorkType === 'bet') {
    if (!parseBetCategory(nextCategory)) {
      return NextResponse.json({ error: 'bet_category is required for bets' }, { status: 400 });
    }
    if (betRequiresLoom(nextChangeDate) && !nextLoom) {
      return NextResponse.json(
        { error: 'loom_url is required when a bet goes live' },
        { status: 400 },
      );
    }
  }

  const needsFreeze =
    !existing.baseline_snapshot_id &&
    shouldFreezeBaseline(
      isWorkType(nextWorkType) ? nextWorkType : 'bet',
      nextChangeDate,
      nextStatus,
    );

  if (needsFreeze && nextChangeDate) {
    try {
      const frozen = await freezeInterventionBaseline(ctx.service, {
        clientId: existing.client_id,
        successMetric:
          (update.success_metric as string | null | undefined) ?? existing.success_metric,
        changeDate: nextChangeDate,
        userId: ctx.userId,
      });
      update.baseline_snapshot_id = frozen.baseline_snapshot_id;
      update.baseline_value = frozen.baseline_value;
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to freeze baseline' },
        { status: 500 },
      );
    }
  }

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
