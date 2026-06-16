import {
  buildClientHealthSnapshot,
  buildHeClientHealthSnapshot,
  metricValue,
  SUCCESS_METRIC_META,
  type ClientHealthSnapshot,
  type ClientKpiBenchmarks,
  type SuccessMetricKey,
} from '@/lib/client-health';
import type { EventRow, SpendRow, TrendSpendRow } from '@/lib/metrics';
import { normalizeReportingType, type ReportingType } from '@/lib/kpi-layouts';

export type ActionLogRow = {
  id: string;
  client_id: string;
  created_at: string;
  title: string;
  success_metric: string | null;
  baseline_value: number | null;
  target_value: number | null;
  baseline_snapshot_id: string | null;
  review_date: string | null;
  status: string;
  outcome_value: number | null;
  outcome_recorded_at: string | null;
};

export type OutcomeEvaluation = {
  outcome_value: number;
  status: 'succeeded' | 'failed' | 'measuring';
  summary: string;
  window_start: string;
  window_end: string;
  insufficient_volume: boolean;
};

function ymdFromIso(iso: string): string {
  return iso.split('T')[0];
}

function shiftDays(date: string, n: number): string {
  const ms = new Date(`${date}T00:00:00.000Z`).getTime() + n * 86400000;
  return new Date(ms).toISOString().split('T')[0];
}

function inRange(iso: string, start: string, end: string): boolean {
  return iso >= `${start}T00:00:00.000Z` && iso <= `${end}T23:59:59.999Z`;
}

/** Build a health snapshot for an arbitrary date window (intervention eval). */
export function snapshotForWindow(
  events: EventRow[],
  spendRows: SpendRow[] | TrendSpendRow[],
  reportingType: ReportingType,
  benchmarks?: ClientKpiBenchmarks | null,
): ClientHealthSnapshot {
  const isHe = normalizeReportingType(reportingType) === 'HE';
  const spend: SpendRow[] = spendRows.map(r => ({ amount: r.amount, platform: 'platform' in r ? r.platform : undefined }));
  return isHe
    ? buildHeClientHealthSnapshot(events, benchmarks)
    : buildClientHealthSnapshot(events, spend, benchmarks);
}

export type SnapshotInsertPayload = {
  client_id: string;
  period_start: string;
  period_end: string;
  window_code: string;
  cpconv: number;
  cpql: number;
  cpl: number;
  conversation_yield: number;
  show_rate: number;
  booking_rate: number;
  lead_to_qual: number;
  attention_score: number;
  worst_tier: string;
  primary_constraint: string | null;
  constraint_label: string | null;
  metrics: unknown;
  created_by: string | null;
};

/** Map a computed snapshot to a DB row for client_health_snapshots. */
export function snapshotToInsert(
  clientId: string,
  periodStart: string,
  periodEnd: string,
  windowCode: string,
  snap: ClientHealthSnapshot,
  createdBy: string | null,
): SnapshotInsertPayload {
  const m = snap.metrics;
  return {
    client_id: clientId,
    period_start: periodStart,
    period_end: periodEnd,
    window_code: windowCode,
    cpconv: snap.cpconv,
    cpql: snap.cpql,
    cpl: m.cpl,
    conversation_yield: snap.conversation_yield,
    show_rate: m.net_show_pct,
    booking_rate: m.appt_booking_rate,
    lead_to_qual: snap.lead_to_qualified_pct,
    attention_score: snap.attention_score,
    worst_tier: snap.worst_tier,
    primary_constraint: snap.constraint,
    constraint_label: snap.constraint_label,
    metrics: m,
    created_by: createdBy,
  };
}

function minVolumeForMetric(key: SuccessMetricKey, snap: ClientHealthSnapshot): boolean {
  const m = snap.metrics;
  switch (key) {
    case 'cpconv':
      return m.live_transfers + m.claimed + m.shows >= 5;
    case 'cpql':
      return m.qualified_leads >= 3;
    case 'cpl':
      return m.new_leads >= 5;
    case 'show_rate':
      return m.shows + m.no_shows >= 10;
    case 'booking_rate':
    case 'hand_raise_rate':
      return m.qualified_leads >= 5;
    case 'lead_to_qual':
      return m.new_leads >= 5;
    case 'conversation_yield':
      return m.qualified_leads >= 5;
    default:
      return true;
  }
}

function meetsTarget(
  outcome: number,
  baseline: number,
  target: number | null,
  lowerIsBetter: boolean,
): boolean {
  if (target != null) {
    return lowerIsBetter ? outcome <= target : outcome >= target;
  }
  return lowerIsBetter ? outcome < baseline : outcome > baseline;
}

function improvedVsBaseline(
  outcome: number,
  baseline: number,
  lowerIsBetter: boolean,
): boolean {
  return lowerIsBetter ? outcome < baseline : outcome > baseline;
}

/**
 * Evaluate an intervention over the post-change window [created_at → review_end].
 * Uses the same metric definitions as the grader (via metricValue).
 */
export function evaluateActionOutcome(
  action: ActionLogRow,
  events: (EventRow & { occurred_at?: string })[],
  spendRows: SpendRow[] | TrendSpendRow[],
  reportingType: ReportingType,
  benchmarks?: ClientKpiBenchmarks | null,
  today: string = new Date().toISOString().split('T')[0],
): OutcomeEvaluation | null {
  const metricKey = action.success_metric as SuccessMetricKey | null;
  if (!metricKey || !SUCCESS_METRIC_META[metricKey]) return null;
  if (action.baseline_value == null) return null;

  const meta = SUCCESS_METRIC_META[metricKey];
  const createdDate = ymdFromIso(action.created_at);
  const reviewEnd = action.review_date && action.review_date <= today ? action.review_date : today;
  if (reviewEnd < createdDate) return null;

  const windowEvents = events.filter(
    e => e.occurred_at && inRange(e.occurred_at, createdDate, reviewEnd),
  ) as EventRow[];

  const snap = snapshotForWindow(windowEvents, spendRows, reportingType, benchmarks);
  const outcomeValue = metricValue(snap, metricKey, reportingType);
  const insufficient = !minVolumeForMetric(metricKey, snap);

  if (insufficient) {
    return {
      outcome_value: outcomeValue,
      status: 'measuring',
      summary: `Not enough volume in ${createdDate} → ${reviewEnd} to judge ${meta.label} yet.`,
      window_start: createdDate,
      window_end: reviewEnd,
      insufficient_volume: true,
    };
  }

  const baseline = action.baseline_value;
  const target = action.target_value;
  const hit = meetsTarget(outcomeValue, baseline, target, meta.lowerIsBetter);
  const improved = improvedVsBaseline(outcomeValue, baseline, meta.lowerIsBetter);

  let status: OutcomeEvaluation['status'] = 'measuring';
  if (hit) status = 'succeeded';
  else if (!improved) status = 'failed';

  const targetNote =
    target != null
      ? ` (target ${meta.unit === 'money' ? '$' + Math.round(target) : target + (meta.unit === 'pct' ? '%' : '')})`
      : '';

  const summary =
    status === 'succeeded'
      ? `${meta.label} moved from ${formatVal(metricKey, baseline)} → ${formatVal(metricKey, outcomeValue)}${targetNote} — on track.`
      : status === 'failed'
        ? `${meta.label} did not improve (${formatVal(metricKey, baseline)} → ${formatVal(metricKey, outcomeValue)})${targetNote}.`
        : `${meta.label} changed (${formatVal(metricKey, baseline)} → ${formatVal(metricKey, outcomeValue)}) — still measuring${targetNote}.`;

  return {
    outcome_value: outcomeValue,
    status,
    summary,
    window_start: createdDate,
    window_end: reviewEnd,
    insufficient_volume: false,
  };
}

function formatVal(key: SuccessMetricKey, v: number): string {
  const meta = SUCCESS_METRIC_META[key];
  if (meta.unit === 'money') return `$${Math.round(v)}`;
  if (meta.unit === 'pct') return `${v.toFixed(1)}%`;
  return v.toFixed(3);
}

/** Default review date from playbook timebox string (e.g. "7 days", "5 business days"). */
export function defaultReviewDateFromTimebox(timebox?: string): string {
  const days = timebox?.match(/(\d+)/)?.[1];
  const n = days ? Math.min(90, Math.max(3, parseInt(days, 10))) : 14;
  return shiftDays(new Date().toISOString().split('T')[0], n);
}

export const OPEN_ACTION_STATUSES = ['planned', 'in_progress', 'measuring'] as const;

export type OpenActionSummary = {
  id: string;
  client_id: string;
  client_name?: string;
  title: string;
  review_date: string | null;
  status: string;
  overdue: boolean;
  success_metric: string | null;
};

export function summarizeOpenAction(
  action: ActionLogRow & { client_name?: string },
  today: string = new Date().toISOString().split('T')[0],
): OpenActionSummary {
  return {
    id: action.id,
    client_id: action.client_id,
    client_name: action.client_name,
    title: action.title,
    review_date: action.review_date,
    status: action.status,
    overdue: !!action.review_date && action.review_date < today && OPEN_ACTION_STATUSES.includes(action.status as (typeof OPEN_ACTION_STATUSES)[number]),
    success_metric: action.success_metric,
  };
}
