import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requirePermission } from '@/lib/api-auth';
import {
  buildClientHealthSnapshot,
  buildHeClientHealthSnapshot,
  metricValue,
  withOptinRate,
  type ClientKpiBenchmarks,
  type SuccessMetricKey,
} from '@/lib/client-health';
import {
  evaluateActionOutcome,
  OPEN_ACTION_STATUSES,
  snapshotToInsert,
  baselineWindowForChange,
  actionChangeDate,
  isFinalActionStatus,
  type ActionLogRow,
} from '@/lib/client-health-interventions';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import { usesCallCenterKpiLayout } from '@/lib/reporting-types';
import { fetchCombinedSpendForMetrics, fetchMetaClicksSum } from '@/lib/spend';
import type { EventRow } from '@/lib/metrics';

const SELECT = '*';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['client_health', 'admin_clients']);
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
    q = q.in('status', [...OPEN_ACTION_STATUSES]);
  }

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const body = await req.json();
  const {
    client_id,
    title,
    layer = null,
    constraint_label = null,
    change_description = null,
    hypothesis = null,
    success_metric = null,
    target_value = null,
    status = 'in_progress',
    review_date = null,
    change_date = null,
    ai_generated = false,
    period_start = null,
    period_end = null,
  } = body ?? {};

  if (!client_id || !title) {
    return NextResponse.json({ error: 'client_id and title are required' }, { status: 400 });
  }

  const { data: client, error: clientError } = await ctx.service
    .from('clients')
    .select('id, reporting_type, kpi_benchmarks')
    .eq('id', client_id)
    .single();

  if (clientError || !client) {
    return NextResponse.json({ error: clientError?.message ?? 'Client not found' }, { status: 404 });
  }

  const reporting_type = normalizeReportingType(client.reporting_type);
  const benchmarks = (client.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;
  const isHe = usesCallCenterKpiLayout(reporting_type);

  let baseline_snapshot_id: string | null = null;
  let baseline_value: number | null =
    body.baseline_value != null ? Number(body.baseline_value) : null;

  const today = new Date().toISOString().split('T')[0];
  const effectiveChangeDate =
    typeof change_date === 'string' && change_date.trim()
      ? change_date.trim()
      : today;
  const baselineWindow = baselineWindowForChange(effectiveChangeDate);
  const baselineStart = period_start ?? baselineWindow.start;
  const baselineEnd = period_end ?? baselineWindow.end;

  if (baselineStart && baselineEnd) {
    const [{ data: events, error: eventsError }, spend, metaClicks] = await Promise.all([
      ctx.service
        .from('events')
        .select(
          'occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state',
        )
        .eq('client_id', client_id)
        .gte('occurred_at', `${baselineStart}T00:00:00.000Z`)
        .lte('occurred_at', `${baselineEnd}T23:59:59.999Z`)
        .limit(200000),
      isHe
        ? Promise.resolve([])
        : fetchCombinedSpendForMetrics(ctx.service, {
            client_id,
            start_date: baselineStart,
            end_date: baselineEnd,
          }),
      isHe
        ? Promise.resolve(0)
        : fetchMetaClicksSum(ctx.service, {
            client_id,
            start_date: baselineStart,
            end_date: baselineEnd,
          }),
    ]);

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    let snap = isHe
      ? buildHeClientHealthSnapshot((events ?? []) as EventRow[], benchmarks)
      : buildClientHealthSnapshot((events ?? []) as EventRow[], spend, benchmarks);
    if (!isHe) snap = withOptinRate(snap, metaClicks);

    const metricKey = (success_metric as SuccessMetricKey) ?? 'cpconv';
    baseline_value = metricValue(snap, metricKey, reporting_type);

    const { data: inserted, error: snapError } = await ctx.service
      .from('client_health_snapshots')
      .insert(
        snapshotToInsert(
          client_id,
          baselineStart,
          baselineEnd,
          'INTERVENTION_BASELINE',
          snap,
          ctx.userId,
        ),
      )
      .select('id')
      .single();

    if (snapError) {
      return NextResponse.json({ error: snapError.message }, { status: 500 });
    }
    baseline_snapshot_id = inserted?.id ?? null;
  }

  const { data, error } = await ctx.service
    .from('client_action_logs')
    .insert({
      client_id,
      created_by: ctx.userId,
      title,
      layer,
      constraint_label,
      change_description,
      hypothesis,
      baseline_snapshot_id,
      success_metric,
      baseline_value,
      target_value: target_value != null ? Number(target_value) : null,
      status,
      review_date,
      change_date: effectiveChangeDate,
      ai_generated: Boolean(ai_generated),
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
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
  const changeDate = actionChangeDate(action);
  const today = new Date().toISOString().split('T')[0];
  const reviewEnd = action.review_date && action.review_date <= today ? action.review_date : today;

  const [{ data: events }, spend, metaClicks] = await Promise.all([
    ctx.service
      .from('events')
      .select(
        'occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state',
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
