import {
  buildClientHealthSnapshot,
  buildHeClientHealthSnapshot,
  metricValue,
  withOptinRate,
  type ClientKpiBenchmarks,
  type SuccessMetricKey,
} from '@/lib/client-health';
import {
  baselineWindowForChange,
  snapshotToInsert,
} from '@/lib/client-health-interventions';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import { usesCallCenterKpiLayout } from '@/lib/reporting-types';
import { fetchCombinedSpendForMetrics, fetchMetaClicksSum } from '@/lib/spend';
import type { EventRow } from '@/lib/metrics';
import type { createServiceClient } from '@/lib/supabase';
import {
  isWorkType,
  parseWorkType,
  resolveWorkLogDates,
  shouldFreezeBaseline,
  type WorkType,
} from '@/lib/client-work-log';

type Service = ReturnType<typeof createServiceClient>;

export type CreateActionLogInput = {
  client_id: string;
  title: string;
  work_type?: unknown;
  layer?: string | null;
  constraint_label?: string | null;
  change_description?: string | null;
  hypothesis?: string | null;
  success_metric?: string | null;
  target_value?: number | null;
  baseline_value?: number | null;
  status?: string;
  review_date?: string | null;
  change_date?: string | null;
  planned_date?: string | null;
  ai_generated?: boolean;
  period_start?: string | null;
  period_end?: string | null;
};

export type FrozenBaseline = {
  baseline_snapshot_id: string | null;
  baseline_value: number | null;
};

export async function freezeInterventionBaseline(
  service: Service,
  opts: {
    clientId: string;
    successMetric: string | null;
    changeDate: string;
    userId: string | null;
    periodStart?: string | null;
    periodEnd?: string | null;
    explicitBaseline?: number | null;
  },
): Promise<FrozenBaseline> {
  const { data: client, error: clientError } = await service
    .from('clients')
    .select('id, reporting_type, kpi_benchmarks')
    .eq('id', opts.clientId)
    .single();

  if (clientError || !client) {
    throw new Error(clientError?.message ?? 'Client not found');
  }

  const reporting_type = normalizeReportingType(client.reporting_type);
  const benchmarks = (client.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;
  const isHe = usesCallCenterKpiLayout(reporting_type);
  const baselineWindow = baselineWindowForChange(opts.changeDate);
  const baselineStart = opts.periodStart ?? baselineWindow.start;
  const baselineEnd = opts.periodEnd ?? baselineWindow.end;

  let baseline_snapshot_id: string | null = null;
  let baseline_value: number | null =
    opts.explicitBaseline != null ? Number(opts.explicitBaseline) : null;

  const [{ data: events, error: eventsError }, spend, metaClicks] = await Promise.all([
    service
      .from('events')
      .select(
        'occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state, ghl_contact_id, lead_phone, lead_email, lead_name, client_id',
      )
      .eq('client_id', opts.clientId)
      .gte('occurred_at', `${baselineStart}T00:00:00.000Z`)
      .lte('occurred_at', `${baselineEnd}T23:59:59.999Z`)
      .limit(200000),
    isHe
      ? Promise.resolve([])
      : fetchCombinedSpendForMetrics(service, {
          client_id: opts.clientId,
          start_date: baselineStart,
          end_date: baselineEnd,
        }),
    isHe
      ? Promise.resolve(0)
      : fetchMetaClicksSum(service, {
          client_id: opts.clientId,
          start_date: baselineStart,
          end_date: baselineEnd,
        }),
  ]);

  if (eventsError) throw new Error(eventsError.message);

  let snap = isHe
    ? buildHeClientHealthSnapshot((events ?? []) as EventRow[], benchmarks)
    : buildClientHealthSnapshot((events ?? []) as EventRow[], spend, benchmarks);
  if (!isHe) snap = withOptinRate(snap, metaClicks);

  const metricKey = (opts.successMetric as SuccessMetricKey) ?? 'cpconv';
  baseline_value = metricValue(snap, metricKey, reporting_type);

  const { data: inserted, error: snapError } = await service
    .from('client_health_snapshots')
    .insert(
      snapshotToInsert(
        opts.clientId,
        baselineStart,
        baselineEnd,
        'INTERVENTION_BASELINE',
        snap,
        opts.userId,
      ),
    )
    .select('id')
    .single();

  if (snapError) throw new Error(snapError.message);
  baseline_snapshot_id = inserted?.id ?? null;

  return { baseline_snapshot_id, baseline_value };
}

export async function createClientActionLog(
  service: Service,
  userId: string | null,
  body: CreateActionLogInput,
): Promise<{ action: Record<string, unknown> }> {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  if (!body.client_id || !title) {
    throw new Error('client_id and title are required');
  }

  const workType: WorkType = parseWorkType(body.work_type, 'bet');
  if (body.work_type != null && body.work_type !== '' && !isWorkType(body.work_type)) {
    throw new Error('invalid work_type');
  }
  const status =
    typeof body.status === 'string' && body.status.trim()
      ? body.status.trim()
      : 'in_progress';
  const today = new Date().toISOString().split('T')[0];
  const dates = resolveWorkLogDates({
    workType,
    status,
    changeDate: typeof body.change_date === 'string' ? body.change_date : null,
    plannedDate: typeof body.planned_date === 'string' ? body.planned_date : null,
    today,
  });

  let baseline_snapshot_id: string | null = null;
  let baseline_value: number | null =
    body.baseline_value != null ? Number(body.baseline_value) : null;

  const freeze = shouldFreezeBaseline(workType, dates.changeDate, status);
  if (freeze && dates.changeDate) {
    const frozen = await freezeInterventionBaseline(service, {
      clientId: body.client_id,
      successMetric: body.success_metric ?? null,
      changeDate: dates.changeDate,
      userId,
      periodStart: body.period_start ?? null,
      periodEnd: body.period_end ?? null,
      explicitBaseline: baseline_value,
    });
    baseline_snapshot_id = frozen.baseline_snapshot_id;
    baseline_value = frozen.baseline_value;
  }

  const reviewDate =
    workType === 'bet' ? (typeof body.review_date === 'string' ? body.review_date || null : null) : null;
  const successMetric = workType === 'bet' ? (body.success_metric ?? null) : null;
  const hypothesis = workType === 'bet' ? (body.hypothesis ?? null) : body.hypothesis ?? null;
  const targetValue =
    workType === 'bet' && body.target_value != null ? Number(body.target_value) : null;

  const { data, error } = await service
    .from('client_action_logs')
    .insert({
      client_id: body.client_id,
      created_by: userId,
      title,
      work_type: workType,
      layer: body.layer ?? null,
      constraint_label: body.constraint_label ?? null,
      change_description: body.change_description ?? null,
      hypothesis,
      baseline_snapshot_id,
      success_metric: successMetric,
      baseline_value: freeze ? baseline_value : workType === 'bet' ? baseline_value : null,
      target_value: targetValue,
      status,
      review_date: reviewDate,
      change_date: dates.changeDate,
      planned_date: dates.plannedDate,
      ai_generated: Boolean(body.ai_generated),
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return { action: data as Record<string, unknown> };
}
