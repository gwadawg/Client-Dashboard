/**
 * Lightweight KPI window lookup for account-plan task reviews.
 * Reuses Client Success intervention math without writing action logs.
 */

import {
  buildClientHealthSnapshot,
  buildHeClientHealthSnapshot,
  metricValue,
  SUCCESS_METRIC_META,
  withOptinRate,
  type ClientKpiBenchmarks,
  type SuccessMetricKey,
} from '@/lib/client-health';
import {
  baselineWindowForChange,
} from '@/lib/client-health-interventions';
import { normalizeReportingType, usesCallCenterKpiLayout } from '@/lib/kpi-layouts';
import type { EventRow } from '@/lib/metrics';
import { fetchCombinedSpendForMetrics, fetchMetaClicksSum } from '@/lib/spend';
import { addDaysToYmd } from '@/lib/team-meetings';
import { todayYmdInCallCenterTz } from '@/lib/time';
import type { AuthContext } from '@/lib/api-auth';

const EVENT_SELECT =
  'occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state, ghl_contact_id, lead_phone, lead_email, lead_name, client_id';

export function isSuccessMetricKey(v: unknown): v is SuccessMetricKey {
  return typeof v === 'string' && v in SUCCESS_METRIC_META;
}

export type TaskKpiCompare = {
  success_metric: SuccessMetricKey;
  label: string;
  unit: 'money' | 'pct' | 'ratio';
  lower_is_better: boolean;
  baseline_value: number | null;
  baseline_window: { start: string; end: string };
  outcome_value: number | null;
  outcome_window: { start: string; end: string };
  /** Positive means better given metric direction. Null if either side missing. */
  delta: number | null;
  direction: 'better' | 'worse' | 'flat' | 'unknown';
  change_date: string;
};

async function metricForWindow(
  service: AuthContext['service'],
  opts: {
    clientId: string;
    start: string;
    end: string;
    metric: SuccessMetricKey;
    reportingType: string;
    benchmarks: ClientKpiBenchmarks | null;
  },
): Promise<number | null> {
  const reporting_type = normalizeReportingType(opts.reportingType);
  const isHe = usesCallCenterKpiLayout(reporting_type);

  const [{ data: events, error }, spend, metaClicks] = await Promise.all([
    service
      .from('events')
      .select(EVENT_SELECT)
      .eq('client_id', opts.clientId)
      .gte('occurred_at', `${opts.start}T00:00:00.000Z`)
      .lte('occurred_at', `${opts.end}T23:59:59.999Z`)
      .limit(200000),
    isHe
      ? Promise.resolve([])
      : fetchCombinedSpendForMetrics(service, {
          client_id: opts.clientId,
          start_date: opts.start,
          end_date: opts.end,
        }),
    isHe
      ? Promise.resolve(0)
      : fetchMetaClicksSum(service, {
          client_id: opts.clientId,
          start_date: opts.start,
          end_date: opts.end,
        }),
  ]);

  if (error) throw new Error(error.message);

  let snap = isHe
    ? buildHeClientHealthSnapshot((events ?? []) as EventRow[], opts.benchmarks)
    : buildClientHealthSnapshot(
        (events ?? []) as EventRow[],
        spend,
        opts.benchmarks,
      );
  if (!isHe) snap = withOptinRate(snap, metaClicks);

  return metricValue(snap, opts.metric, reporting_type);
}

/**
 * Compare pre-change baseline vs post-complete window for one success metric.
 * changeDate = day work was marked done (or scheduled if still estimating).
 */
export async function compareTaskKpi(
  service: AuthContext['service'],
  opts: {
    clientId: string;
    successMetric: SuccessMetricKey;
    changeDate: string;
    storedBaseline?: number | null;
  },
): Promise<TaskKpiCompare> {
  const meta = SUCCESS_METRIC_META[opts.successMetric];
  const changeDate = opts.changeDate.slice(0, 10);
  const baselineWindow = baselineWindowForChange(changeDate);
  const today = todayYmdInCallCenterTz();
  const outcomeStart = changeDate;
  // Post window: from change day through min(today, change+13) — up to ~2 weeks
  const outcomeEndCap = addDaysToYmd(changeDate, 13);
  const outcomeEnd = outcomeEndCap < today ? outcomeEndCap : today;

  const { data: client } = await service
    .from('clients')
    .select('id, reporting_type, kpi_benchmarks')
    .eq('id', opts.clientId)
    .maybeSingle();

  const reportingType = (client as { reporting_type?: string } | null)?.reporting_type ?? 'RM';
  const benchmarks =
    ((client as { kpi_benchmarks?: ClientKpiBenchmarks | null } | null)
      ?.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;

  let baseline_value =
    opts.storedBaseline != null && Number.isFinite(Number(opts.storedBaseline))
      ? Number(opts.storedBaseline)
      : null;

  if (baseline_value == null) {
    baseline_value = await metricForWindow(service, {
      clientId: opts.clientId,
      start: baselineWindow.start,
      end: baselineWindow.end,
      metric: opts.successMetric,
      reportingType,
      benchmarks,
    });
  }

  let outcome_value: number | null = null;
  if (outcomeEnd >= outcomeStart) {
    outcome_value = await metricForWindow(service, {
      clientId: opts.clientId,
      start: outcomeStart,
      end: outcomeEnd,
      metric: opts.successMetric,
      reportingType,
      benchmarks,
    });
  }

  let delta: number | null = null;
  let direction: TaskKpiCompare['direction'] = 'unknown';
  if (baseline_value != null && outcome_value != null) {
    const raw = outcome_value - baseline_value;
    const betterDelta = meta.lowerIsBetter ? -raw : raw;
    delta = betterDelta;
    if (Math.abs(raw) < 1e-9) direction = 'flat';
    else if (betterDelta > 0) direction = 'better';
    else direction = 'worse';
  }

  return {
    success_metric: opts.successMetric,
    label: meta.label,
    unit: meta.unit,
    lower_is_better: meta.lowerIsBetter,
    baseline_value,
    baseline_window: baselineWindow,
    outcome_value,
    outcome_window: { start: outcomeStart, end: outcomeEnd },
    delta,
    direction,
    change_date: changeDate,
  };
}

export async function freezeBaselineForTask(
  service: AuthContext['service'],
  opts: {
    clientId: string;
    successMetric: SuccessMetricKey;
    changeDate: string;
  },
): Promise<number | null> {
  const cmp = await compareTaskKpi(service, {
    clientId: opts.clientId,
    successMetric: opts.successMetric,
    changeDate: opts.changeDate,
    storedBaseline: null,
  });
  return cmp.baseline_value;
}
