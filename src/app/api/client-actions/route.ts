import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requirePermission } from '@/lib/api-auth';
import { type ClientKpiBenchmarks } from '@/lib/client-health';
import {
  evaluateActionOutcome,
  OPEN_ACTION_STATUSES,
  isFinalActionStatus,
  type ActionLogRow,
} from '@/lib/client-health-interventions';
import { createClientActionLog } from '@/lib/client-action-log-write';
import { isBetWorkType, LOG_WORK_PERMISSIONS } from '@/lib/client-work-log';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import { usesCallCenterKpiLayout } from '@/lib/reporting-types';
import { fetchCombinedSpendForMetrics, fetchMetaClicksSum } from '@/lib/spend';
import type { EventRow } from '@/lib/metrics';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['client_health', 'admin_clients', ...LOG_WORK_PERMISSIONS]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');
  const scopeAll = searchParams.get('scope') === 'all';

  if (!clientId && !scopeAll) {
    return NextResponse.json({ error: 'client_id or scope=all is required' }, { status: 400 });
  }

  let q = ctx.service.from('client_action_logs').select('*').order('created_at', { ascending: false });
  if (clientId) q = q.eq('client_id', clientId);
  if (scopeAll) {
    q = q.in('status', [...OPEN_ACTION_STATUSES]).eq('work_type', 'bet');
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...LOG_WORK_PERMISSIONS]);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const { action } = await createClientActionLog(ctx.service, ctx.userId, body);
    return NextResponse.json({ action });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to log work';
    const status = /not found/i.test(message)
      ? 404
      : /required|invalid/i.test(message)
        ? 400
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

/** POST body optional: { action_ids?: string[] } — evaluate due interventions. */
export async function PUT(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const today = new Date().toISOString().split('T')[0];

  let q = ctx.service
    .from('client_action_logs')
    .select('*')
    .in('status', ['planned', 'in_progress', 'measuring'])
    .eq('work_type', 'bet')
    .not('change_date', 'is', null)
    .lte('review_date', today)
    .not('review_date', 'is', null)
    .is('outcome_recorded_at', null);

  if (Array.isArray(body.action_ids) && body.action_ids.length > 0) {
    q = q.in('id', body.action_ids);
  }

  const { data: actions, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!actions?.length) {
    return NextResponse.json({ evaluated: [], message: 'No due actions to evaluate.' });
  }

  const evaluated: { id: string; status: string; summary: string }[] = [];

  for (const action of actions as ActionLogRow[]) {
    if (!isBetWorkType(action.work_type) || !action.change_date) continue;
    const result = await evaluateOneAction(ctx, action);
    if (result) evaluated.push(result);
  }

  return NextResponse.json({ evaluated });
}

async function evaluateOneAction(
  ctx: Extract<Awaited<ReturnType<typeof getAuthContext>>, { service: unknown }>,
  action: ActionLogRow,
): Promise<{ id: string; status: string; summary: string } | null> {
  if (isAuthError(ctx) || !ctx.service) return null;

  const { data: client } = await ctx.service
    .from('clients')
    .select('reporting_type, kpi_benchmarks')
    .eq('id', action.client_id)
    .single();

  const reporting_type = normalizeReportingType(client?.reporting_type);
  const benchmarks = (client?.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;
  const changeDate = action.change_date;
  if (!changeDate) return null;
  const today = new Date().toISOString().split('T')[0];
  const reviewEnd = action.review_date && action.review_date <= today ? action.review_date : today;

  const [{ data: events }, spend, metaClicks] = await Promise.all([
    ctx.service
      .from('events')
      .select(
        'occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state, ghl_contact_id, lead_phone, lead_email, lead_name, client_id',
      )
      .eq('client_id', action.client_id)
      .gte('occurred_at', `${changeDate}T00:00:00.000Z`)
      .lte('occurred_at', `${reviewEnd}T23:59:59.999Z`)
      .limit(200000),
    usesCallCenterKpiLayout(reporting_type)
      ? Promise.resolve([])
      : fetchCombinedSpendForMetrics(ctx.service, {
          client_id: action.client_id,
          start_date: changeDate,
          end_date: reviewEnd,
        }),
    usesCallCenterKpiLayout(reporting_type)
      ? Promise.resolve(0)
      : fetchMetaClicksSum(ctx.service, {
          client_id: action.client_id,
          start_date: changeDate,
          end_date: reviewEnd,
        }),
  ]);

  const evaluation = evaluateActionOutcome(
    action,
    (events ?? []) as (EventRow & { occurred_at: string })[],
    spend.map(s => ({ amount: s.amount, platform: s.platform ?? 'meta' })),
    reporting_type,
    benchmarks,
    today,
    metaClicks,
  );

  if (!evaluation) return null;

  const update: Record<string, unknown> = {
    outcome_value: evaluation.outcome_value,
    outcome_notes: evaluation.summary,
    status: evaluation.status,
  };
  if (isFinalActionStatus(evaluation.status)) {
    update.outcome_recorded_at = new Date().toISOString();
  }

  await ctx.service.from('client_action_logs').update(update).eq('id', action.id);

  return { id: action.id, status: evaluation.status, summary: evaluation.summary };
}
