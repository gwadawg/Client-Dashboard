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
  /** Cost per conversation (= ad spend ÷ (live transfers + shows + claimed)). The verdict metric. */
  cpconv: number;
  /** Conversation yield = conversations ÷ qualified leads (credits live transfers, not just shows). */
  conversation_yield: number;
  grades: KpiGrade[];
  worst_tier: HealthTier;
  attention_score: number;
  constraint: ConstraintLayer;
  constraint_label: string;
};

/** Funnel layer that owns a constraint, used for ordering and ownership. */
export type FunnelLayer = 'L1' | 'L2' | 'L3' | 'L4' | 'DATA' | 'NONE';

export type FixStep = {
  owner: string;
  action: string;
  timebox?: string;
  successMetric?: string;
};

/** Plain-English diagnosis + ordered fix steps for a client's primary constraint. */
export type ConstraintGuidance = {
  layer: FunnelLayer;
  /** One-line "biggest fallout". */
  headline: string;
  /** Plain-English explanation of what is wrong, with the actual numbers. */
  whatsWrong: string;
  fixSteps: FixStep[];
  doNotDo: string[];
  /** Human-readable CPConv arithmetic: "spend ÷ conversations = $X". */
  cpconvMath: string;
  /** Cross-check via CPQL ÷ CY. */
  crossCheck: string;
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
  /** Leading-indicator snapshot of the most recent window (early-warning instrument). */
  recent: RecentLeading | null;
};

/**
 * Leading indicators over the most recent window. These resolve fast (no
 * booking->appointment lag), so they're shown separately as an early-warning
 * "Recent" instrument rather than folded into the matured verdict.
 */
export type RecentLeading = {
  window_days: number;
  start: string;
  end: string;
  leads: number;
  qualified_leads: number;
  dials: number;
  pickup_pct: number;
  lead_to_qualified_pct: number;
  /** Live transfers + claimed + shows in the recent window. */
  conversations: number;
  booking_rate: number;
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
  show_rate: { label: 'Show Rate (true, ex-LO-bail)', short: 'Show' },
  close_rate: { label: 'Close Rate', short: 'Close' },
  cpl: { label: 'Cost Per Lead', short: 'CPL' },
  cpql: { label: 'Cost Per Qualified Lead', short: 'CPQL' },
  cps: { label: 'Cost Per Conversation (CPConv)', short: 'CPConv' },
};

export type Bands = { critical?: number; below?: number; at?: number };

export type KpiBandSpec = {
  bands: Bands;
  /** true = higher value is better (rates); false = lower is better (costs). */
  higherIsBetter: boolean;
  /** unit of the threshold values, for the editor UI. */
  unit: 'pct' | 'money';
};

/**
 * Global default bands — the single source of truth for the grader and the
 * per-client benchmark editor. Values calibrated against the live per-client
 * distribution (see docs/CLIENT-HEALTH-REDESIGN.md §8.1). Per-client overrides
 * are layered on top of these; anything not overridden falls back here.
 */
export const DEFAULT_KPI_BANDS: Record<KpiKey, KpiBandSpec> = {
  lead_to_qualified: { bands: { critical: 40, below: 50, at: 65 }, higherIsBetter: true, unit: 'pct' },
  pickup_rate:       { bands: { critical: 20, below: 30, at: 45 }, higherIsBetter: true, unit: 'pct' },
  booking_rate:      { bands: { critical: 20, below: 25, at: 30 }, higherIsBetter: true, unit: 'pct' },
  show_rate:         { bands: { critical: 55, below: 63, at: 70 }, higherIsBetter: true, unit: 'pct' },
  close_rate:        { bands: { critical: 10, below: 20, at: 35 }, higherIsBetter: true, unit: 'pct' },
  cpl:               { bands: { critical: 25, below: 20, at: 15 }, higherIsBetter: false, unit: 'money' },
  cpql:              { bands: { critical: 35, below: 30, at: 20 }, higherIsBetter: false, unit: 'money' },
  cps:               { bands: { critical: 200, below: 150, at: 100 }, higherIsBetter: false, unit: 'money' },
};

/** Minimum denominator per KPI before it can be graded (volume guard). */
const KPI_MIN_DENOMINATOR: Record<KpiKey, number> = {
  lead_to_qualified: 5,
  pickup_rate: 20,
  booking_rate: 5,
  show_rate: 10,
  close_rate: 10,
  cpl: 5,
  cpql: 3,
  cps: 5,
};

/**
 * Per-client manual benchmark overrides. Sparse: only the KPIs/bands a human has
 * customized are present; everything else inherits DEFAULT_KPI_BANDS. Markets and
 * client profiles differ, so a global truth is unfair — this lets each client be
 * judged against its own bar while measurement stays identical.
 */
export type ClientKpiBenchmarks = Partial<Record<KpiKey, Bands>>;

/** Merge a client's overrides over the global defaults for one KPI. */
function resolveBands(key: KpiKey, overrides?: ClientKpiBenchmarks | null): KpiBandSpec {
  const def = DEFAULT_KPI_BANDS[key];
  const ov = overrides?.[key];
  if (!ov) return def;
  return { ...def, bands: { ...def.bands, ...ov } };
}

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

/**
 * Overall verdict tier — anchored on the north-star metric, Cost per Conversation
 * (CPConv / `cps`).
 *
 * CPConv = total ad spend ÷ conversations, so it already integrates every upstream
 * cost and conversion inefficiency into one bottom-line number: pricey leads or a
 * leaky funnel necessarily show up as a higher CPConv. The practical effect is that
 * strong KPIs "carry" weak ones through the north star — a single underperforming
 * sub-metric no longer drags an otherwise-efficient account down to "Below". The
 * individual KPI tiers, the constraint, and attention_score still surface those
 * weak spots for triage; they just stop hijacking the headline.
 *
 * This replaces two earlier rules in turn: the original "worst-tier-wins" (one
 * 'below' nuked the account) and the equal-weight average across all 8 KPIs (which
 * let a few weak funnel metrics outvote a healthy north star).
 *
 * Fallback: when CPConv has too little volume to grade, there is no north-star
 * signal, so we revert to the volume-blind weighted average of the gradeable KPIs
 * (with the 911/critical override) rather than guessing.
 */
function computeOverallTier(graded: KpiGrade[]): HealthTier {
  if (graded.length === 0) return 'insufficient';
  const northStar = graded.find(g => g.key === 'cps');
  if (northStar) return northStar.tier;
  if (graded.some(g => g.tier === 'critical')) return 'critical';
  const avg = graded.reduce((sum, g) => sum + TIER_WEIGHT[g.tier], 0) / graded.length;
  if (avg < 1.5) return 'above';
  if (avg < 2.5) return 'at';
  return 'below';
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
  benchmarks?: ClientKpiBenchmarks | null,
): ClientHealthSnapshot {
  const metrics = calculateMetrics(events, spendRows);
  const lead_to_qualified_pct =
    metrics.new_leads > 0 ? (metrics.qualified_leads / metrics.new_leads) * 100 : 0;
  const close_rate_pct =
    metrics.shows > 0 ? (metrics.closed / metrics.shows) * 100 : 0;
  const cpql =
    metrics.qualified_leads > 0 ? metrics.ad_spend / metrics.qualified_leads : 0;
  // CPConv = ad spend ÷ conversations (live transfers + shows + claimed). The verdict
  // metric. Previously this was shows-only (= CPS) mislabeled as CPConv; corrected to
  // the conversation-inclusive definition so the live-transfer path is credited.
  const cpconv = metrics.cp_conversation;
  // A conversation = live transfer + show + claimed. Used as the CPConv denominator and
  // for conversation yield below.
  const conversation_count = metrics.live_transfers + metrics.claimed + metrics.shows;
  // Conversation yield = conversations ÷ qualified leads (credits the live-transfer path,
  // not just shows), keeping CPQL ÷ CY == CPConv consistent.
  const conversation_yield =
    metrics.qualified_leads > 0 ? conversation_count / metrics.qualified_leads : 0;

  // Grade one KPI against its resolved (default + per-client override) bands.
  const grade = (key: KpiKey, value: number, display: string, denominator: number): KpiGrade => {
    const spec = resolveBands(key, benchmarks);
    return gradeKpi(
      key,
      value,
      display,
      tierFromBands(value, spec.bands, spec.higherIsBetter, KPI_MIN_DENOMINATOR[key], denominator),
    );
  };

  const grades: KpiGrade[] = [
    grade('lead_to_qualified', lead_to_qualified_pct, formatPct(lead_to_qualified_pct), metrics.new_leads),
    grade('pickup_rate', metrics.pickup_pct, formatPct(metrics.pickup_pct), metrics.outbound_dials),
    grade('booking_rate', metrics.appt_booking_rate, formatPct(metrics.appt_booking_rate), metrics.qualified_leads),
    // True (LO-bail-fair) show rate: shows / (shows + no_shows). Denominator is
    // resolved appointments only, so still-pending recent bookings don't deflate it.
    grade('show_rate', metrics.net_show_pct, formatPct(metrics.net_show_pct), metrics.shows + metrics.no_shows),
    grade('close_rate', close_rate_pct, formatPct(close_rate_pct), metrics.shows),
    grade('cpl', metrics.cpl, formatMoney(metrics.cpl), metrics.new_leads),
    grade('cpql', cpql, formatMoney(cpql), metrics.qualified_leads),
    // True CPConv (cost per conversation), the verdict metric.
    grade('cps', cpconv, formatMoney(cpconv), conversation_count),
  ];

  const graded = grades.filter(g => g.tier !== 'insufficient');
  const worst_tier = computeOverallTier(graded);
  const attention_score = graded.reduce((sum, g) => sum + TIER_WEIGHT[g.tier], 0);
  const { constraint, constraint_label } = inferConstraint(metrics, grades, lead_to_qualified_pct, cpql);

  return {
    metrics,
    lead_to_qualified_pct,
    close_rate_pct,
    cpql,
    cpconv,
    conversation_yield,
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

const CONSTRAINT_LAYER: Record<ConstraintLayer, FunnelLayer> = {
  lead_quality: 'L2',
  lead_cost: 'L1',
  call_center: 'L3',
  show_rate: 'L4',
  data_issue: 'DATA',
  healthy: 'NONE',
  insufficient_data: 'NONE',
};

/**
 * Turn a computed snapshot into a plain-English "what's wrong / what to do"
 * payload. The numbers come from the deterministic engine; this only frames
 * them and attaches the right levers + owners from the diagnostic playbook.
 */
export function buildConstraintGuidance(snapshot: ClientHealthSnapshot): ConstraintGuidance {
  const m = snapshot.metrics;
  const layer = CONSTRAINT_LAYER[snapshot.constraint];

  const conversationCount = m.live_transfers + m.claimed + m.shows;
  const cpconvMath =
    conversationCount > 0
      ? `${formatMoney(m.ad_spend)} spend ÷ ${conversationCount} conversation${conversationCount === 1 ? '' : 's'} (live transfers + shows + claimed) = ${formatMoney(snapshot.cpconv)} CPConv`
      : `No conversations in period — CPConv cannot be computed (${formatMoney(m.ad_spend)} spend, 0 conversations)`;

  const crossCheck =
    snapshot.conversation_yield > 0 && snapshot.cpql > 0
      ? `Cross-check: CPQL ${formatMoney(snapshot.cpql)} ÷ CY ${snapshot.conversation_yield.toFixed(3)} = ${formatMoney(
          snapshot.cpql / snapshot.conversation_yield,
        )}`
      : 'Cross-check unavailable (need qualified leads + shows).';

  const base = { layer, cpconvMath, crossCheck };

  switch (snapshot.constraint) {
    case 'lead_quality':
      return {
        ...base,
        headline: 'Lead quality — too few leads qualify',
        whatsWrong: `Only ${snapshot.lead_to_qualified_pct.toFixed(0)}% of leads qualify (target ≥ 50%). The ads are attracting the wrong people, so spend is wasted before the call center ever gets a fair shot. CPQL is ${formatMoney(
          snapshot.cpql,
        )}.`,
        fixSteps: [
          {
            owner: 'Media buyer (L1–L2)',
            action: 'Pull disqualification reasons and tighten audience/targeting toward the qualifying archetype.',
            timebox: '7 days',
            successMetric: 'Lead-to-qualified ≥ 50%',
          },
          {
            owner: 'Media buyer (L2)',
            action: 'Sharpen ad message + landing-page match so the offer self-selects qualified leads.',
            timebox: '7 days',
          },
          {
            owner: 'CSR manager (L3)',
            action: 'Confirm qualification criteria are applied consistently on calls (not too loose).',
          },
        ],
        doNotDo: [
          'Do not blame the call center yet — fix targeting first.',
          'Do not just cut budget; that lowers volume without fixing quality.',
        ],
      };
    case 'lead_cost':
      return {
        ...base,
        headline: 'Lead cost — qualified leads are too expensive',
        whatsWrong: `CPL is ${formatMoney(m.cpl)} and CPQL is ${formatMoney(
          snapshot.cpql,
        )} — both above target. Leads qualify fine, they just cost too much, which drags CPConv to ${formatMoney(
          snapshot.cpconv,
        )}.`,
        fixSteps: [
          {
            owner: 'Media buyer (L1)',
            action: 'Rotate 3–5 fresh creatives and widen the audience to lower acquisition cost.',
            timebox: '7 days',
            successMetric: `CPQL → ≤ ${formatMoney(20)}`,
          },
          {
            owner: 'Media buyer (L1)',
            action: 'Check frequency/fatigue; pause the worst-performing ad sets by CPQL.',
            timebox: '7 days',
          },
        ],
        doNotDo: [
          'Do not tighten qualification — leads already qualify; that would only cut volume.',
        ],
      };
    case 'call_center':
      return {
        ...base,
        headline: 'Call center — leads qualify but are not converting to booked appointments',
        whatsWrong: `Lead cost is healthy (CPQL ${formatMoney(
          snapshot.cpql,
        )}) but booking rate is ${m.appt_booking_rate.toFixed(
          0,
        )}% and pickup rate is ${m.pickup_pct.toFixed(0)}%. The constraint is in dialing or the booking script.`,
        fixSteps: [
          {
            owner: 'CSR manager (L3)',
            action: 'Diagnose contact vs booking split — if pickup is low, fix dial cadence/times; if booking is low, fix the script.',
            timebox: '5 business days',
            successMetric: 'Booking rate ≥ 28% of qualified leads',
          },
          {
            owner: 'CSR manager (L3)',
            action: 'Audit speed-to-lead and number of dial attempts per lead.',
            timebox: '5 business days',
          },
        ],
        doNotDo: [
          'Do not change the ad campaign — the upstream funnel is healthy (G-1).',
        ],
      };
    case 'show_rate':
      return {
        ...base,
        headline: 'Show rate — booked appointments are not showing up',
        whatsWrong: `Booking is healthy but only ${m.show_pct.toFixed(
          0,
        )}% of the ${m.booked_appointments} booked appointments showed. The fallout is between booking and the consultation.`,
        fixSteps: [
          {
            owner: 'Client success (L4)',
            action: 'Audit and strengthen the GHL reminder/confirmation sequence (SMS + call) before each appointment.',
            timebox: '5 business days',
            successMetric: 'Show rate ≥ 60%',
          },
          {
            owner: 'Client success (L4)',
            action: 'Prefer near-term slots and confirm LO pre-call prep so leads do not go cold.',
            timebox: '5 business days',
          },
        ],
        doNotDo: [
          'Do not re-diagnose ads or booking — those layers are clear.',
        ],
      };
    case 'data_issue':
      return {
        ...base,
        headline: 'Data / attribution — metrics look fine but CPConv is off',
        whatsWrong: `Every upstream metric reads At KPI, yet CPConv is ${formatMoney(
          snapshot.cpconv,
        )}. That pattern points to a tracking/disposition gap, not an operational failure.`,
        fixSteps: [
          {
            owner: 'Ops / Founder',
            action: 'Validate appointment dispositions, spend reconciliation, and show/no-show logging before any operational change.',
            timebox: 'Immediate',
          },
          {
            owner: 'Founder',
            action: 'Escalate — no funnel changes until attribution is confirmed.',
            timebox: 'Same day',
          },
        ],
        doNotDo: [
          'Do not make ads, booking, or show-rate changes until the data is trusted (G-2).',
        ],
      };
    case 'insufficient_data':
      return {
        ...base,
        headline: 'Not enough volume to grade',
        whatsWrong:
          'This account does not have enough leads/appointments in the selected period to produce a reliable verdict. Treat any tier as provisional.',
        fixSteps: [
          {
            owner: 'Client success',
            action: 'Widen the date range or wait for more volume before diagnosing.',
          },
        ],
        doNotDo: ['Do not act on a single low-volume week.'],
      };
    case 'healthy':
    default:
      return {
        ...base,
        headline: 'Healthy — within KPI range',
        whatsWrong: `CPConv is ${formatMoney(
          snapshot.cpconv,
        )} and all layers are at or above target. The funnel is working.`,
        fixSteps: [
          {
            owner: 'Client success',
            action: 'Log weekly and monitor the last-7-day trend for early slides.',
          },
        ],
        doNotDo: [
          'Do not chase CPL or pause campaigns over a single upstream metric while CPConv is healthy (G-1).',
        ],
      };
  }
}

export type SuccessMetricKey =
  | 'cpconv'
  | 'cpql'
  | 'cpl'
  | 'show_rate'
  | 'booking_rate'
  | 'lead_to_qual'
  | 'conversation_yield';

export const SUCCESS_METRIC_META: Record<
  SuccessMetricKey,
  { label: string; lowerIsBetter: boolean; unit: 'money' | 'pct' | 'ratio' }
> = {
  cpconv: { label: 'CPConv (cost / conv)', lowerIsBetter: true, unit: 'money' },
  cpql: { label: 'Cost per qualified lead', lowerIsBetter: true, unit: 'money' },
  cpl: { label: 'Cost per lead', lowerIsBetter: true, unit: 'money' },
  show_rate: { label: 'Show rate', lowerIsBetter: false, unit: 'pct' },
  booking_rate: { label: 'Booking rate', lowerIsBetter: false, unit: 'pct' },
  lead_to_qual: { label: 'Lead-to-qualified', lowerIsBetter: false, unit: 'pct' },
  conversation_yield: { label: 'Conversation yield', lowerIsBetter: false, unit: 'ratio' },
};

/** Pull a single success-metric value out of a computed snapshot. */
export function metricValue(snapshot: ClientHealthSnapshot, key: SuccessMetricKey): number {
  switch (key) {
    case 'cpconv':
      return snapshot.cpconv;
    case 'cpql':
      return snapshot.cpql;
    case 'cpl':
      return snapshot.metrics.cpl;
    case 'show_rate':
      return snapshot.metrics.show_pct;
    case 'booking_rate':
      return snapshot.metrics.appt_booking_rate;
    case 'lead_to_qual':
      return snapshot.lead_to_qualified_pct;
    case 'conversation_yield':
      return snapshot.conversation_yield;
  }
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

/**
 * Maturity cutoff (days). Lag analysis on live data showed 98.4% of appointments
 * occur within 7 days of booking, and outcome events are dated at the appointment
 * date. So lag-sensitive KPIs (CPConv, close rate, show rate) only become
 * trustworthy once a cohort is ~7 days old. The verdict window excludes the most
 * recent MATURITY_DAYS so spend and its resulting conversations/closes are aligned.
 */
export const MATURITY_DAYS = 7;

/** Window (days) for the leading-indicator "Recent" early-warning instrument. */
export const RECENT_WINDOW_DAYS = 14;

function shiftDays(date: string, n: number): string {
  const ms = new Date(`${date}T00:00:00.000Z`).getTime() + n * 86400000;
  return new Date(ms).toISOString().split('T')[0];
}

function utcToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Clamp the selected [start, end] back by `maturityDays` to get the matured
 * verdict window. `empty` is true when the selected window is too recent to have
 * any matured data (e.g. "Last 7 Days") — the verdict is then "still maturing"
 * and the Recent instrument carries the signal.
 */
export function maturedWindow(
  start: string,
  end: string,
  today: string = utcToday(),
  maturityDays: number = MATURITY_DAYS,
): { start: string; end: string; empty: boolean; clamped: boolean; matured_through: string; maturity_days: number } {
  const cutoff = shiftDays(today, -maturityDays);
  const maturedEnd = end < cutoff ? end : cutoff;
  return {
    start,
    end: maturedEnd,
    empty: maturedEnd < start,
    clamped: maturedEnd < end,
    matured_through: maturedEnd,
    maturity_days: maturityDays,
  };
}

/** The most recent slice of the selected window, clamped to its start. */
export function recentWindow(
  start: string,
  end: string,
  days: number = RECENT_WINDOW_DAYS,
): { start: string; end: string; window_days: number } {
  const candidate = shiftDays(end, -(days - 1));
  return { start: candidate > start ? candidate : start, end, window_days: days };
}

/** Build the leading-indicator summary for the recent window (spend not needed). */
export function buildRecentLeading(
  events: EventRow[],
  start: string,
  end: string,
  windowDays: number = RECENT_WINDOW_DAYS,
): RecentLeading {
  const m = calculateMetrics(events, []);
  return {
    window_days: windowDays,
    start,
    end,
    leads: m.new_leads,
    qualified_leads: m.qualified_leads,
    dials: m.outbound_dials,
    pickup_pct: m.pickup_pct,
    lead_to_qualified_pct: m.new_leads > 0 ? (m.qualified_leads / m.new_leads) * 100 : 0,
    conversations: m.live_transfers + m.claimed + m.shows,
    booking_rate: m.appt_booking_rate,
  };
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
