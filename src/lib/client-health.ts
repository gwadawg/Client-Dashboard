import { calculateMetrics, type EventRow, type MetricsResult, type SpendRow } from '@/lib/metrics';

export type HealthTier = 'critical' | 'below' | 'at' | 'above' | 'insufficient';

export type ConstraintLayer =
  | 'lead_quality'
  | 'lead_cost'
  | 'call_center'
  | 'show_rate'
  | 'data_issue'
  | 'healthy'
  | 'insufficient_data';

export type KpiKey =
  | 'lead_to_qualified'
  | 'pickup_rate'
  | 'booking_rate'
  | 'show_rate'
  | 'close_rate'
  | 'cpl'
  | 'cpql'
  | 'cps';

export type KpiGrade = {
  key: KpiKey;
  label: string;
  value: number | null;
  display: string;
  tier: HealthTier;
  tierLabel: string;
};

export type ClientHealthSnapshot = {
  metrics: MetricsResult;
  lead_to_qualified_pct: number;
  close_rate_pct: number;
  cpql: number;
  grades: KpiGrade[];
  worst_tier: HealthTier;
  attention_score: number;
  constraint: ConstraintLayer;
  constraint_label: string;
};

export type ClientHealthRow = {
  client_id: string;
  client_name: string;
  is_live: boolean;
  current: ClientHealthSnapshot;
  prior: ClientHealthSnapshot | null;
  trend: 'improved' | 'worsened' | 'stable' | 'new' | 'insufficient';
  trend_delta_score: number;
  has_activity: boolean;
};

const TIER_WEIGHT: Record<HealthTier, number> = {
  critical: 4,
  below: 3,
  at: 2,
  above: 1,
  insufficient: 0,
};

const TIER_LABEL: Record<HealthTier, string> = {
  critical: '911',
  below: 'Below KPI',
  at: 'At KPI',
  above: 'Above KPI',
  insufficient: '—',
};

export const KPI_META: Record<KpiKey, { label: string; short: string }> = {
  lead_to_qualified: { label: 'Lead-to-Qualified %', short: 'Qual %' },
  pickup_rate: { label: 'Contact / Pickup Rate', short: 'Pickup' },
  booking_rate: { label: 'Booking Rate (÷ qualified)', short: 'Booking' },
  show_rate: { label: 'Show Rate', short: 'Show' },
  close_rate: { label: 'Close Rate', short: 'Close' },
  cpl: { label: 'Cost Per Lead', short: 'CPL' },
  cpql: { label: 'Cost Per Qualified Lead', short: 'CPQL' },
  cps: { label: 'Cost Per Show (CQPCONV)', short: 'CPS' },
};

type ClientEventRow = EventRow & { client_id: string };
type ClientSpendRow = SpendRow & { client_id: string };

function tierFromBands(
  value: number,
  bands: { critical?: number; below?: number; at?: number; above?: number },
  higherIsBetter: boolean,
  minDenominator: number,
  denominator: number,
): HealthTier {
  if (denominator < minDenominator) return 'insufficient';
  if (higherIsBetter) {
    if (bands.critical != null && value < bands.critical) return 'critical';
    if (bands.below != null && value < bands.below) return 'below';
    if (bands.at != null && value < bands.at) return 'at';
    return 'above';
  }
  if (bands.critical != null && value > bands.critical) return 'critical';
  if (bands.below != null && value > bands.below) return 'below';
  if (bands.at != null && value > bands.at) return 'at';
  return 'above';
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function formatMoney(n: number): string {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

export function buildClientHealthSnapshot(
  events: EventRow[],
  spendRows: SpendRow[],
): ClientHealthSnapshot {
  const metrics = calculateMetrics(events, spendRows);
  const lead_to_qualified_pct =
    metrics.new_leads > 0 ? (metrics.qualified_leads / metrics.new_leads) * 100 : 0;
  const close_rate_pct =
    metrics.shows > 0 ? (metrics.closed / metrics.shows) * 100 : 0;
  const cpql =
    metrics.qualified_leads > 0 ? metrics.ad_spend / metrics.qualified_leads : 0;

  const grades: KpiGrade[] = [
    gradeKpi(
      'lead_to_qualified',
      lead_to_qualified_pct,
      formatPct(lead_to_qualified_pct),
      tierFromBands(lead_to_qualified_pct, { critical: 40, below: 50, at: 65 }, true, 5, metrics.new_leads),
    ),
    gradeKpi(
      'pickup_rate',
      metrics.pickup_pct,
      formatPct(metrics.pickup_pct),
      tierFromBands(metrics.pickup_pct, { critical: 20, below: 30, at: 45 }, true, 20, metrics.outbound_dials),
    ),
    gradeKpi(
      'booking_rate',
      metrics.appt_booking_rate,
      formatPct(metrics.appt_booking_rate),
      tierFromBands(metrics.appt_booking_rate, { critical: 20, below: 25, at: 30 }, true, 5, metrics.qualified_leads),
    ),
    gradeKpi(
      'show_rate',
      metrics.show_pct,
      formatPct(metrics.show_pct),
      tierFromBands(metrics.show_pct, { critical: 51, below: 56, at: 70 }, true, 3, metrics.booked_appointments),
    ),
    gradeKpi(
      'close_rate',
      close_rate_pct,
      formatPct(close_rate_pct),
      tierFromBands(close_rate_pct, { critical: 10, below: 20, at: 35 }, true, 3, metrics.shows),
    ),
    gradeKpi(
      'cpl',
      metrics.cpl,
      formatMoney(metrics.cpl),
      tierFromBands(metrics.cpl, { critical: 25, below: 20, at: 15 }, false, 5, metrics.new_leads),
    ),
    gradeKpi(
      'cpql',
      cpql,
      formatMoney(cpql),
      tierFromBands(cpql, { critical: 35, below: 30, at: 20 }, false, 3, metrics.qualified_leads),
    ),
    gradeKpi(
      'cps',
      metrics.cps,
      formatMoney(metrics.cps),
      tierFromBands(metrics.cps, { critical: 225, below: 150, at: 80 }, false, 1, metrics.shows),
    ),
  ];

  const graded = grades.filter(g => g.tier !== 'insufficient');
  const worst_tier: HealthTier =
    graded.length === 0
      ? 'insufficient'
      : graded.reduce(
          (worst, g) => (TIER_WEIGHT[g.tier] > TIER_WEIGHT[worst] ? g.tier : worst),
          'above' as HealthTier,
        );

  const attention_score = graded.reduce((sum, g) => sum + TIER_WEIGHT[g.tier], 0);
  const { constraint, constraint_label } = inferConstraint(metrics, grades, lead_to_qualified_pct, cpql);

  return {
    metrics,
    lead_to_qualified_pct,
    close_rate_pct,
    cpql,
    grades,
    worst_tier,
    attention_score,
    constraint,
    constraint_label,
  };
}

function gradeKpi(
  key: KpiKey,
  value: number,
  display: string,
  tier: HealthTier,
): KpiGrade {
  return {
    key,
    label: KPI_META[key].label,
    value,
    display,
    tier,
    tierLabel: TIER_LABEL[tier],
  };
}

function tierAtOrBetter(tier: HealthTier, target: HealthTier): boolean {
  return TIER_WEIGHT[tier] <= TIER_WEIGHT[target];
}

function inferConstraint(
  metrics: MetricsResult,
  grades: KpiGrade[],
  leadToQual: number,
  cpql: number,
): { constraint: ConstraintLayer; constraint_label: string } {
  const byKey = Object.fromEntries(grades.map(g => [g.key, g])) as Record<KpiKey, KpiGrade>;
  const hasData = metrics.new_leads > 0 || metrics.booked_appointments > 0;
  if (!hasData) {
    return { constraint: 'insufficient_data', constraint_label: 'No activity in period' };
  }

  const cpqlOk =
    byKey.cpql != null &&
    byKey.cpql.tier !== 'insufficient' &&
    (byKey.cpql.tier === 'at' || byKey.cpql.tier === 'above');
  const bookingBad =
    byKey.booking_rate?.tier === 'critical' || byKey.booking_rate?.tier === 'below';
  const pickupBad = byKey.pickup_rate?.tier === 'critical' || byKey.pickup_rate?.tier === 'below';
  const showBad = byKey.show_rate?.tier === 'critical' || byKey.show_rate?.tier === 'below';
  const qualBad =
    byKey.lead_to_qualified?.tier === 'critical' || byKey.lead_to_qualified?.tier === 'below';
  const cplBad = byKey.cpl?.tier === 'critical' || byKey.cpl?.tier === 'below';
  const cpqlBad = byKey.cpql?.tier === 'critical' || byKey.cpql?.tier === 'below';
  const cpsBad = byKey.cps?.tier === 'critical' || byKey.cps?.tier === 'below';

  const individualOk =
    grades.filter(g => g.tier !== 'insufficient').every(g => tierAtOrBetter(g.tier, 'at')) &&
    grades.some(g => g.tier !== 'insufficient');

  if (individualOk && cpsBad) {
    return { constraint: 'data_issue', constraint_label: 'Check attribution — metrics OK but CPS high' };
  }
  if (qualBad && leadToQual < 50) {
    return { constraint: 'lead_quality', constraint_label: 'Lead quality — targeting / messaging' };
  }
  if (cplBad && cpqlBad) {
    return { constraint: 'lead_cost', constraint_label: 'Lead cost — ads / audience' };
  }
  if (cpqlOk && (bookingBad || pickupBad)) {
    return { constraint: 'call_center', constraint_label: 'Call center — dial / script / booking' };
  }
  if (!bookingBad && showBad && metrics.booked_appointments >= 3) {
    return { constraint: 'show_rate', constraint_label: 'Show rate — confirmations / LO prep' };
  }
  if (grades.every(g => g.tier === 'insufficient')) {
    return { constraint: 'insufficient_data', constraint_label: 'Not enough volume to grade' };
  }
  return { constraint: 'healthy', constraint_label: 'Within KPI range — monitor' };
}

export function compareHealthTrend(
  current: ClientHealthSnapshot,
  prior: ClientHealthSnapshot | null,
): { trend: ClientHealthRow['trend']; trend_delta_score: number } {
  if (!prior || (!prior.metrics.new_leads && !prior.metrics.booked_appointments)) {
    return { trend: 'new', trend_delta_score: 0 };
  }
  const delta = current.attention_score - prior.attention_score;
  if (current.attention_score === 0 && prior.attention_score === 0) {
    return { trend: 'insufficient', trend_delta_score: 0 };
  }
  if (delta <= -2) return { trend: 'improved', trend_delta_score: delta };
  if (delta >= 2) return { trend: 'worsened', trend_delta_score: delta };
  return { trend: 'stable', trend_delta_score: delta };
}

export function computePriorityScore(row: ClientHealthRow): number {
  if (!row.has_activity) return -1;
  const spendBoost = Math.min(3, Math.log10(Math.max(1, row.current.metrics.ad_spend)) / 2);
  const criticalBonus = row.current.grades.filter(g => g.tier === 'critical').length * 2;
  return row.current.attention_score + spendBoost + criticalBonus;
}

export function getPriorPeriod(start: string, end: string): { start: string; end: string } | null {
  if (!start || !end) return null;
  const startMs = new Date(`${start}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
  if (endMs < startMs) return null;
  const days = Math.floor((endMs - startMs) / 86400000) + 1;
  const priorEndMs = startMs - 86400000;
  const priorStartMs = priorEndMs - (days - 1) * 86400000;
  return {
    start: new Date(priorStartMs).toISOString().split('T')[0],
    end: new Date(priorEndMs).toISOString().split('T')[0],
  };
}

export function groupEventsByClient(events: ClientEventRow[]): Map<string, EventRow[]> {
  const map = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = map.get(e.client_id) ?? [];
    const { client_id: _cid, ...row } = e;
    list.push(row);
    map.set(e.client_id, list);
  }
  return map;
}

export function groupSpendByClient(rows: ClientSpendRow[]): Map<string, SpendRow[]> {
  const map = new Map<string, SpendRow[]>();
  for (const r of rows) {
    const list = map.get(r.client_id) ?? [];
    list.push({ amount: r.amount, platform: r.platform });
    map.set(r.client_id, list);
  }
  return map;
}

export function filterEventsToRange<T extends { occurred_at: string }>(
  events: T[],
  start: string,
  end: string,
): T[] {
  const startIso = `${start}T00:00:00.000Z`;
  const endIso = `${end}T23:59:59.999Z`;
  return events.filter(e => e.occurred_at >= startIso && e.occurred_at <= endIso);
}

export type ClientEventWithDate = ClientEventRow & { occurred_at: string };

export { TIER_LABEL };
