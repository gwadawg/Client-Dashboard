/**
 * Media Buyer Command — Account Pulse + Changes In Flight.
 *
 * Account pulse: one row per live ads client — budget vs delivered spend,
 * no-delivery / pacing flags, CPL momentum, Meta sync freshness.
 *
 * Changes in flight: every open ads/landing bet that is live but not yet due
 * for review, evaluated *today* against its frozen baseline so the media buyer
 * can watch a change work (or not) before the review date.
 */

import {
  SUCCESS_METRIC_META,
  computeOptinRatePct,
  type ClientHealthRow,
  type ClientKpiBenchmarks,
  type HealthTier,
  type SuccessMetricKey,
} from '@/lib/client-health';
import {
  evaluateActionOutcome,
  type ActionLogRow,
} from '@/lib/client-health-interventions';
import { mediaBuyerStatus } from '@/lib/dept-health';
import type { EventRow } from '@/lib/metrics';
import { normalizeReportingType, usesCallCenterKpiLayout } from '@/lib/reporting-types';
import { fetchCombinedSpendForMetrics, fetchMetaClicksSum } from '@/lib/spend';
import type { createServiceClient } from '@/lib/supabase';

type Service = ReturnType<typeof createServiceClient>;

// ── Shared helpers ─────────────────────────────────────────────────────────

export function shiftYmd(ymd: string, days: number): string {
  const ms = Date.parse(`${ymd}T00:00:00.000Z`) + days * 86400000;
  return new Date(ms).toISOString().slice(0, 10);
}

function daysBetweenYmd(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00.000Z`);
  const b = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((b - a) / 86400000);
}

function finite(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n);
  return Number.isFinite(v) ? v : null;
}

// ── Account pulse ──────────────────────────────────────────────────────────

export const PULSE_LOOKBACK_DAYS = 14;
/** Meta sync watermark older than this many days = sync stale. */
export const SYNC_STALE_DAYS = 2;
export const UNDER_PACING_PCT = 70;
export const OVER_PACING_PCT = 130;
export const CPL_SPIKE_PCT = 25;
const CPL_MIN_LEADS = 5;
export const LOW_OPTIN_PCT = 15;
export const OPTIN_DROP_PCT = 30;
export const OPTIN_MIN_CLICKS = 50;
export const FATIGUE_TOP_AD_SHARE = 60;
export const FATIGUE_SPEND_SHARE = 40;
/** Min 7d spend before concentration counts as fatigue. */
const FATIGUE_MIN_SPEND_7D = 50;

export type MbPulseFlag =
  | 'no_delivery'
  | 'under_pacing'
  | 'over_pacing'
  | 'cpl_spike'
  | 'no_leads'
  | 'low_optin'
  | 'fatigue'
  | 'no_budget'
  | 'red'
  | 'paused';

/** Flags that mean "act on delivery today" (excludes KPI tier + paused, which have their own surfaces). */
export const PULSE_ATTENTION_FLAGS: ReadonlySet<MbPulseFlag> = new Set<MbPulseFlag>([
  'no_delivery',
  'under_pacing',
  'over_pacing',
  'cpl_spike',
  'no_leads',
  'low_optin',
  'fatigue',
  'no_budget',
]);

export function needsPulseAttention(row: Pick<MbPulseRow, 'flags' | 'ads_paused'>): boolean {
  return !row.ads_paused && row.flags.some(f => PULSE_ATTENTION_FLAGS.has(f));
}

export const PULSE_FLAG_META: Record<MbPulseFlag, { label: string; weight: number; tone: 'red' | 'amber' | 'muted' }> = {
  no_delivery: { label: 'No delivery', weight: 6, tone: 'red' },
  cpl_spike: { label: 'CPL spike', weight: 4, tone: 'red' },
  no_leads: { label: 'Spend, no leads', weight: 4, tone: 'red' },
  fatigue: { label: 'Fatigue', weight: 3, tone: 'amber' },
  red: { label: 'Red KPI', weight: 3, tone: 'amber' },
  low_optin: { label: 'Low opt-in', weight: 2, tone: 'amber' },
  under_pacing: { label: 'Under-pacing', weight: 2, tone: 'amber' },
  over_pacing: { label: 'Over-pacing', weight: 2, tone: 'amber' },
  no_budget: { label: 'No budget set', weight: 1, tone: 'muted' },
  paused: { label: 'Ads paused', weight: 0, tone: 'muted' },
};

export type MbPulseFatigue = {
  top_ad_share: number | null;
  fatigued_spend_share: number | null;
  fatigued_ad_count: number;
};

export type MbPulseRow = {
  client_id: string;
  client_name: string;
  reporting_type: string;
  is_ads_client: boolean;
  ads_paused: boolean;
  ads_paused_at: string | null;
  ads_paused_note: string | null;
  budget_daily: number | null;
  /** Spend on the sync watermark date (most recent day with any data). */
  spend_latest: number;
  spend_7d: number;
  spend_7d_avg: number;
  spend_prior_7d: number;
  /** 7d avg ÷ daily budget × 100. */
  pacing_pct: number | null;
  /** Last day this client had spend > 0 (within lookback). */
  last_spend_date: string | null;
  days_since_spend: number | null;
  leads_7d: number | null;
  qualified_7d: number | null;
  cpl_7d: number | null;
  cpl_prior_7d: number | null;
  cpl_delta_pct: number | null;
  qual_pct_7d: number | null;
  clicks_7d: number | null;
  optin_pct_7d: number | null;
  optin_prior_pct: number | null;
  fatigue: MbPulseFatigue | null;
  momentum: 'improving' | 'slipping' | 'stable' | 'insufficient' | null;
  mb_tier: HealthTier;
  flags: MbPulseFlag[];
  attention: number;
};

export type MbAccountPulse = {
  today: string;
  /** Most recent insight_date across all clients (Meta sync watermark). */
  sync_watermark: string | null;
  sync_age_days: number | null;
  sync_stale: boolean;
  window: { start: string; end: string };
  totals: {
    clients: number;
    ads_clients: number;
    flagged: number;
    paused: number;
    no_delivery: number;
    cpl_spikes: number;
    budget_daily: number;
    spend_latest: number;
    spend_7d_avg: number;
  };
  rows: MbPulseRow[];
};

export type PulseClientInput = {
  id: string;
  name: string;
  reporting_type: string | null;
  lifecycle_status: string | null;
  is_live: boolean | null;
  daily_adspend: number | string | null;
  ads_paused: boolean | null;
  ads_paused_at: string | null;
  ads_paused_note: string | null;
};

type DailySpendRow = { client_id: string; spend_date: string; amount: number };
type DailyClicksRow = { client_id: string; insight_date: string; clicks: number };

async function fetchDailySpendByClient(
  service: Service,
  clientIds: string[],
  start: string,
  end: string,
): Promise<DailySpendRow[]> {
  if (clientIds.length === 0) return [];
  const { data, error } = await service
    .from('daily_meta_spend')
    .select('client_id, spend_date, amount')
    .in('client_id', clientIds)
    .gte('spend_date', start)
    .lte('spend_date', end);
  if (error) throw new Error(error.message);
  return (data ?? []).map(r => ({
    client_id: String(r.client_id),
    spend_date: String(r.spend_date),
    amount: Number(r.amount) || 0,
  }));
}

async function fetchDailyClicksByClient(
  service: Service,
  clientIds: string[],
  start: string,
  end: string,
): Promise<DailyClicksRow[]> {
  if (clientIds.length === 0) return [];
  const pageSize = 1000;
  let offset = 0;
  const out: DailyClicksRow[] = [];
  while (true) {
    const { data, error } = await service
      .from('meta_ad_insights')
      .select('client_id, insight_date, clicks')
      .in('client_id', clientIds)
      .gte('insight_date', start)
      .lte('insight_date', end)
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    for (const row of batch) {
      out.push({
        client_id: String(row.client_id),
        insight_date: String(row.insight_date),
        clicks: Number(row.clicks) || 0,
      });
    }
    if (batch.length < pageSize) break;
    offset += pageSize;
  }
  return out;
}

async function resolveFatigueFlags(
  service: Service,
  clientIds: string[],
  today: string,
): Promise<{
  fatigueById: Map<string, MbPulseFatigue>;
  flagIds: Set<string>;
  error: string | null;
}> {
  const fatigueById = new Map<string, MbPulseFatigue>();
  const flagIds = new Set<string>();
  if (clientIds.length === 0) return { fatigueById, flagIds, error: null };

  const startDate = shiftYmd(today, -13);
  const w7Start = shiftYmd(today, -6);
  const pageSize = 1000;
  let offset = 0;
  /** client → ad_name → { total, recent } */
  const byClient = new Map<string, Map<string, { total: number; recent: number }>>();

  try {
    while (true) {
      const { data, error } = await service
        .from('meta_ad_insights')
        .select('client_id, ad_name, insight_date, spend')
        .in('client_id', clientIds)
        .gte('insight_date', startDate)
        .lte('insight_date', today)
        .range(offset, offset + pageSize - 1);
      if (error) throw new Error(error.message);
      const batch = data ?? [];
      for (const row of batch) {
        const cid = String(row.client_id);
        const name = String(row.ad_name ?? '').trim() || '(untitled)';
        const spend = Number(row.spend) || 0;
        if (spend <= 0) continue;
        const date = String(row.insight_date);
        const ads = byClient.get(cid) ?? new Map();
        const cur = ads.get(name) ?? { total: 0, recent: 0 };
        cur.total += spend;
        if (date >= w7Start) cur.recent += spend;
        ads.set(name, cur);
        byClient.set(cid, ads);
      }
      if (batch.length < pageSize) break;
      offset += pageSize;
    }
  } catch (e) {
    return {
      fatigueById,
      flagIds,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  for (const [cid, ads] of byClient) {
    let total = 0;
    let recentTotal = 0;
    let topShare = 0;
    let topRecent = 0;
    for (const v of ads.values()) {
      total += v.total;
      recentTotal += v.recent;
      if (v.total > topShare) {
        topShare = v.total;
        topRecent = v.recent;
      }
    }
    if (total <= 0) continue;
    const top_ad_share = (topShare / total) * 100;
    const fatigued_spend_share =
      recentTotal > 0 ? (topRecent / recentTotal) * 100 : null;
    fatigueById.set(cid, {
      top_ad_share: Math.round(top_ad_share * 10) / 10,
      fatigued_spend_share:
        fatigued_spend_share != null ? Math.round(fatigued_spend_share * 10) / 10 : null,
      fatigued_ad_count: top_ad_share > FATIGUE_TOP_AD_SHARE ? 1 : 0,
    });
    if (
      recentTotal >= FATIGUE_MIN_SPEND_7D &&
      (top_ad_share > FATIGUE_TOP_AD_SHARE ||
        (fatigued_spend_share != null && fatigued_spend_share > FATIGUE_SPEND_SHARE))
    ) {
      flagIds.add(cid);
    }
  }

  return { fatigueById, flagIds, error: null };
}


export async function buildAccountPulse(
  service: Service,
  opts: {
    today: string;
    clients: PulseClientInput[];
    health: ClientHealthRow[] | null;
  },
): Promise<MbAccountPulse & { fatigue_error?: string }> {
  const { today } = opts;
  const liveClients = opts.clients.filter(
    c => c.lifecycle_status === 'active' && c.is_live !== false,
  );
  const start = shiftYmd(today, -(PULSE_LOOKBACK_DAYS - 1));
  const adsClientIds = liveClients
    .filter(c => !usesCallCenterKpiLayout(c.reporting_type))
    .map(c => c.id);

  const [spendRows, clickRows, fatigueResult] = await Promise.all([
    fetchDailySpendByClient(service, liveClients.map(c => c.id), start, today),
    fetchDailyClicksByClient(service, adsClientIds, start, today).catch(() => [] as DailyClicksRow[]),
    resolveFatigueFlags(service, adsClientIds, today).catch((e: unknown) => ({
      fatigueById: new Map<string, MbPulseFatigue>(),
      flagIds: new Set<string>(),
      error: e instanceof Error ? e.message : String(e),
    })),
  ]);

  const healthById = new Map((opts.health ?? []).map(r => [r.client_id, r]));

  let watermark: string | null = null;
  const byClient = new Map<string, Map<string, number>>();
  for (const r of spendRows) {
    if (!watermark || r.spend_date > watermark) watermark = r.spend_date;
    const m = byClient.get(r.client_id) ?? new Map<string, number>();
    m.set(r.spend_date, (m.get(r.spend_date) ?? 0) + r.amount);
    byClient.set(r.client_id, m);
  }

  const clicksByClient = new Map<string, Map<string, number>>();
  for (const r of clickRows) {
    const m = clicksByClient.get(r.client_id) ?? new Map<string, number>();
    m.set(r.insight_date, (m.get(r.insight_date) ?? 0) + r.clicks);
    clicksByClient.set(r.client_id, m);
  }

  const syncAge = watermark ? daysBetweenYmd(watermark, today) : null;
  const syncStale = watermark == null || (syncAge != null && syncAge > SYNC_STALE_DAYS);
  // Anchor 7d windows on the watermark so a late sync doesn't read as a spend drop.
  const anchor = watermark ?? today;
  const w7Start = shiftYmd(anchor, -6);
  const p7Start = shiftYmd(anchor, -13);
  const p7End = shiftYmd(anchor, -7);

  const rows: MbPulseRow[] = liveClients.map(c => {
    const reporting_type = normalizeReportingType(c.reporting_type);
    const is_ads_client = !usesCallCenterKpiLayout(reporting_type);
    const budget = finite(c.daily_adspend);
    const budget_daily = budget != null && budget > 0 ? budget : null;
    const spendMap = byClient.get(c.id) ?? new Map<string, number>();
    const clickMap = clicksByClient.get(c.id) ?? new Map<string, number>();

    let spend_7d = 0;
    let spend_prior_7d = 0;
    let last_spend_date: string | null = null;
    for (const [date, amt] of spendMap) {
      if (date >= w7Start && date <= anchor) spend_7d += amt;
      else if (date >= p7Start && date <= p7End) spend_prior_7d += amt;
      if (amt > 0 && (!last_spend_date || date > last_spend_date)) last_spend_date = date;
    }
    let clicks_7d = 0;
    let clicks_prior = 0;
    for (const [date, clicks] of clickMap) {
      if (date >= w7Start && date <= anchor) clicks_7d += clicks;
      else if (date >= p7Start && date <= p7End) clicks_prior += clicks;
    }
    const spend_latest = watermark ? spendMap.get(watermark) ?? 0 : 0;
    const spend_7d_avg = spend_7d / 7;
    const pacing_pct = budget_daily ? (spend_7d_avg / budget_daily) * 100 : null;

    const h = healthById.get(c.id) ?? null;
    const recent = h?.recent ?? null;
    const prior = h?.recent_prior ?? null;
    const leads_7d = recent ? recent.leads : null;
    const qualified_7d = recent ? recent.qualified_leads : null;
    const cpl_7d = recent && is_ads_client ? finite(recent.cpl) : null;
    const cpl_prior_7d = prior && is_ads_client ? finite(prior.cpl) : null;
    const cpl_delta_pct =
      cpl_7d != null && cpl_prior_7d != null && cpl_prior_7d > 0 && cpl_7d > 0
        ? ((cpl_7d - cpl_prior_7d) / cpl_prior_7d) * 100
        : null;
    const qual_pct_7d = recent ? finite(recent.lead_to_qualified_pct) : null;
    const optin_pct_7d =
      is_ads_client && leads_7d != null && clicks_7d > 0
        ? computeOptinRatePct(leads_7d, clicks_7d)
        : null;
    const priorLeads = prior?.leads ?? null;
    const optin_prior_pct =
      is_ads_client && priorLeads != null && clicks_prior > 0
        ? computeOptinRatePct(priorLeads, clicks_prior)
        : null;
    const mb_tier: HealthTier = h ? mediaBuyerStatus(h) : 'insufficient';
    const fatigue = fatigueResult.fatigueById.get(c.id) ?? null;

    const flags: MbPulseFlag[] = [];
    const paused = Boolean(c.ads_paused);
    if (paused) flags.push('paused');
    if (is_ads_client && !paused && watermark && !syncStale) {
      const expectsSpend = budget_daily != null || spend_prior_7d > 0;
      if (expectsSpend && spend_latest <= 0) flags.push('no_delivery');
      else if (budget_daily != null && pacing_pct != null) {
        if (pacing_pct < UNDER_PACING_PCT) flags.push('under_pacing');
        else if (pacing_pct > OVER_PACING_PCT) flags.push('over_pacing');
      }
    }
    if (
      is_ads_client &&
      cpl_delta_pct != null &&
      cpl_delta_pct > CPL_SPIKE_PCT &&
      (leads_7d ?? 0) >= CPL_MIN_LEADS
    ) {
      flags.push('cpl_spike');
    }
    if (
      is_ads_client &&
      !paused &&
      !flags.includes('no_delivery') &&
      spend_7d > 0 &&
      leads_7d === 0
    ) {
      flags.push('no_leads');
    }
    if (
      is_ads_client &&
      !paused &&
      clicks_7d >= OPTIN_MIN_CLICKS &&
      optin_pct_7d != null &&
      (optin_pct_7d < LOW_OPTIN_PCT ||
        (optin_prior_pct != null &&
          optin_prior_pct > 0 &&
          ((optin_prior_pct - optin_pct_7d) / optin_prior_pct) * 100 > OPTIN_DROP_PCT))
    ) {
      flags.push('low_optin');
    }
    if (is_ads_client && !paused && fatigueResult.flagIds.has(c.id)) {
      flags.push('fatigue');
    }
    if (is_ads_client && !paused && budget_daily == null) {
      flags.push('no_budget');
    }
    if (mb_tier === 'critical' || mb_tier === 'below') flags.push('red');

    const attention = flags.reduce((sum, f) => sum + PULSE_FLAG_META[f].weight, 0);

    return {
      client_id: c.id,
      client_name: c.name,
      reporting_type,
      is_ads_client,
      ads_paused: paused,
      ads_paused_at: c.ads_paused_at ?? null,
      ads_paused_note: c.ads_paused_note ?? null,
      budget_daily,
      spend_latest,
      spend_7d,
      spend_7d_avg,
      spend_prior_7d,
      pacing_pct,
      last_spend_date,
      days_since_spend: last_spend_date ? daysBetweenYmd(last_spend_date, today) : null,
      leads_7d,
      qualified_7d,
      cpl_7d,
      cpl_prior_7d,
      cpl_delta_pct,
      qual_pct_7d,
      clicks_7d: is_ads_client ? clicks_7d : null,
      optin_pct_7d,
      optin_prior_pct,
      fatigue,
      momentum: recent?.momentum ?? null,
      mb_tier,
      flags,
      attention,
    };
  });

  rows.sort((a, b) => {
    // Paused accounts sink to the bottom regardless of other signals.
    if (a.ads_paused !== b.ads_paused) return a.ads_paused ? 1 : -1;
    if (a.is_ads_client !== b.is_ads_client) return a.is_ads_client ? -1 : 1;
    return (
      b.attention - a.attention ||
      b.spend_7d - a.spend_7d ||
      a.client_name.localeCompare(b.client_name)
    );
  });

  const adsRows = rows.filter(r => r.is_ads_client);
  return {
    today,
    sync_watermark: watermark,
    sync_age_days: syncAge,
    sync_stale: syncStale,
    window: { start: w7Start, end: anchor },
    totals: {
      clients: rows.length,
      ads_clients: adsRows.length,
      flagged: rows.filter(needsPulseAttention).length,
      paused: rows.filter(r => r.ads_paused).length,
      no_delivery: rows.filter(r => r.flags.includes('no_delivery')).length,
      cpl_spikes: rows.filter(r => r.flags.includes('cpl_spike')).length,
      budget_daily: adsRows.reduce((s, r) => s + (r.ads_paused ? 0 : r.budget_daily ?? 0), 0),
      spend_latest: adsRows.reduce((s, r) => s + r.spend_latest, 0),
      spend_7d_avg: adsRows.reduce((s, r) => s + r.spend_7d_avg, 0),
    },
    rows,
    ...(fatigueResult.error ? { fatigue_error: fatigueResult.error } : {}),
  };
}

// ── Changes in flight ──────────────────────────────────────────────────────

/** Cap live evaluations per request (each is 3 queries). */
const MAX_LIVE_EVALUATIONS = 40;

export type MbInFlightVerdict = 'on_track' | 'off_track' | 'measuring' | 'no_data';

export type MbChangeInFlight = {
  id: string;
  client_id: string;
  client_name: string;
  title: string;
  layer: string | null;
  status: string;
  bet_category: string | null;
  change_description: string | null;
  hypothesis: string | null;
  loom_url: string | null;
  success_metric: string | null;
  success_metric_label: string | null;
  metric_unit: 'money' | 'pct' | 'ratio' | null;
  lower_is_better: boolean | null;
  change_date: string | null;
  review_date: string | null;
  planned_date: string | null;
  days_since_change: number | null;
  days_to_review: number | null;
  /** Live — change_date has passed; planned — not live yet. */
  phase: 'live' | 'planned';
  baseline_value: number | null;
  current_value: number | null;
  target_value: number | null;
  /** (current − baseline) ÷ baseline × 100, signed. */
  delta_pct: number | null;
  /** 0–100+ toward target from baseline; null when no target. */
  progress_pct: number | null;
  direction: 'improving' | 'worsening' | 'flat' | null;
  verdict: MbInFlightVerdict;
  insufficient_volume: boolean;
  summary: string | null;
  window: { start: string; end: string } | null;
};

export type InFlightActionInput = ActionLogRow & {
  layer: string | null;
  bet_category?: string | null;
  change_description?: string | null;
  hypothesis?: string | null;
  loom_url?: string | null;
  planned_date?: string | null;
};

export type InFlightClientInput = {
  id: string;
  name: string;
  reporting_type: string | null;
  kpi_benchmarks: unknown;
};

const EVENT_SELECT =
  'occurred_at, event_type, is_pickup, is_conversation, speed_to_lead_seconds, is_qualified, is_hot, is_out_of_state, ghl_contact_id, lead_phone, lead_email, lead_name, client_id';

async function evaluateLive(
  service: Service,
  action: InFlightActionInput,
  client: InFlightClientInput,
  today: string,
) {
  const changeDate = action.change_date!;
  const reporting_type = normalizeReportingType(client.reporting_type);
  const isCc = usesCallCenterKpiLayout(reporting_type);
  const benchmarks = (client.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;

  const [{ data: events, error }, spend, clicks] = await Promise.all([
    service
      .from('events')
      .select(EVENT_SELECT)
      .eq('client_id', action.client_id)
      .gte('occurred_at', `${changeDate}T00:00:00.000Z`)
      .lte('occurred_at', `${today}T23:59:59.999Z`)
      .limit(200000),
    isCc
      ? Promise.resolve([])
      : fetchCombinedSpendForMetrics(service, {
          client_id: action.client_id,
          start_date: changeDate,
          end_date: today,
        }),
    isCc
      ? Promise.resolve(0)
      : fetchMetaClicksSum(service, {
          client_id: action.client_id,
          start_date: changeDate,
          end_date: today,
        }),
  ]);
  if (error) throw new Error(error.message);

  return evaluateActionOutcome(
    action,
    (events ?? []) as (EventRow & { occurred_at: string })[],
    spend.map(s => ({ amount: s.amount, platform: s.platform ?? 'meta' })),
    reporting_type,
    benchmarks,
    today,
    clicks,
  );
}

function progressToward(
  baseline: number,
  current: number,
  target: number | null,
  lowerIsBetter: boolean,
): number | null {
  if (target == null || target === baseline) return null;
  const span = lowerIsBetter ? baseline - target : target - baseline;
  const moved = lowerIsBetter ? baseline - current : current - baseline;
  if (span <= 0) return null;
  return (moved / span) * 100;
}

function directionOf(
  baseline: number,
  current: number,
  lowerIsBetter: boolean,
): 'improving' | 'worsening' | 'flat' {
  if (baseline === 0) return current === 0 ? 'flat' : lowerIsBetter ? 'worsening' : 'improving';
  const delta = (current - baseline) / Math.abs(baseline);
  if (Math.abs(delta) < 0.02) return 'flat';
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return better ? 'improving' : 'worsening';
}

export async function buildChangesInFlight(
  service: Service,
  opts: {
    today: string;
    actions: InFlightActionInput[];
    clients: InFlightClientInput[];
  },
): Promise<{ rows: MbChangeInFlight[]; errors: string[] }> {
  const { today } = opts;
  const clientById = new Map(opts.clients.map(c => [c.id, c]));
  const errors: string[] = [];

  const base = (a: InFlightActionInput): Omit<
    MbChangeInFlight,
    | 'phase'
    | 'current_value'
    | 'delta_pct'
    | 'progress_pct'
    | 'direction'
    | 'verdict'
    | 'insufficient_volume'
    | 'summary'
    | 'window'
    | 'days_since_change'
    | 'days_to_review'
  > => {
    const key = (a.success_metric as SuccessMetricKey | null) ?? null;
    const meta = key ? SUCCESS_METRIC_META[key] : null;
    return {
      id: a.id,
      client_id: a.client_id,
      client_name: clientById.get(a.client_id)?.name ?? 'Unknown',
      title: a.title,
      layer: a.layer ?? null,
      status: a.status,
      bet_category: a.bet_category ?? null,
      change_description: a.change_description ?? null,
      hypothesis: a.hypothesis ?? null,
      loom_url: a.loom_url ?? null,
      success_metric: key,
      success_metric_label: meta?.label ?? key,
      metric_unit: meta?.unit ?? null,
      lower_is_better: meta?.lowerIsBetter ?? null,
      change_date: a.change_date?.slice(0, 10) ?? null,
      review_date: a.review_date?.slice(0, 10) ?? null,
      planned_date: a.planned_date?.slice(0, 10) ?? null,
      baseline_value: a.baseline_value != null ? Number(a.baseline_value) : null,
      target_value: a.target_value != null ? Number(a.target_value) : null,
    };
  };

  const live: InFlightActionInput[] = [];
  const planned: InFlightActionInput[] = [];
  for (const a of opts.actions) {
    const cd = a.change_date?.slice(0, 10) ?? null;
    if (cd && cd <= today) live.push(a);
    else planned.push(a);
  }

  const liveRows = await Promise.all(
    live.slice(0, MAX_LIVE_EVALUATIONS).map(async (a): Promise<MbChangeInFlight> => {
      const b = base(a);
      const client = clientById.get(a.client_id);
      const days_since_change = b.change_date ? daysBetweenYmd(b.change_date, today) : null;
      const days_to_review = b.review_date ? daysBetweenYmd(today, b.review_date) : null;
      const empty: MbChangeInFlight = {
        ...b,
        phase: 'live',
        days_since_change,
        days_to_review,
        current_value: null,
        delta_pct: null,
        progress_pct: null,
        direction: null,
        verdict: 'no_data',
        insufficient_volume: false,
        summary: null,
        window: null,
      };
      if (!client || b.baseline_value == null || !b.success_metric) return empty;

      try {
        const ev = await evaluateLive(service, a, client, today);
        if (!ev) return empty;
        const lowerIsBetter = b.lower_is_better ?? true;
        const current = ev.outcome_value;
        const baseline = b.baseline_value;
        // With too few leads a cost metric reads $0 — never present that as progress.
        const readable = !ev.insufficient_volume && Number.isFinite(current);
        const delta_pct =
          readable && baseline !== 0 ? ((current - baseline) / Math.abs(baseline)) * 100 : null;
        return {
          ...empty,
          current_value: readable ? current : null,
          delta_pct: delta_pct != null && Number.isFinite(delta_pct) ? delta_pct : null,
          progress_pct: readable
            ? progressToward(baseline, current, b.target_value, lowerIsBetter)
            : null,
          direction: readable ? directionOf(baseline, current, lowerIsBetter) : null,
          verdict: ev.insufficient_volume
            ? 'measuring'
            : ev.status === 'succeeded'
              ? 'on_track'
              : ev.status === 'failed'
                ? 'off_track'
                : 'measuring',
          insufficient_volume: ev.insufficient_volume,
          summary: ev.summary,
          window: { start: ev.window_start, end: ev.window_end },
        };
      } catch (e) {
        errors.push(`${b.client_name}: ${e instanceof Error ? e.message : String(e)}`);
        return empty;
      }
    }),
  );

  const plannedRows: MbChangeInFlight[] = planned.map(a => {
    const b = base(a);
    return {
      ...b,
      phase: 'planned',
      days_since_change: null,
      days_to_review: b.review_date ? daysBetweenYmd(today, b.review_date) : null,
      current_value: null,
      delta_pct: null,
      progress_pct: null,
      direction: null,
      verdict: 'no_data',
      insufficient_volume: false,
      summary: null,
      window: null,
    };
  });

  const VERDICT_RANK: Record<MbInFlightVerdict, number> = {
    off_track: 0,
    measuring: 1,
    on_track: 2,
    no_data: 3,
  };

  liveRows.sort(
    (a, b) =>
      VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] ||
      (a.days_to_review ?? 999) - (b.days_to_review ?? 999) ||
      a.client_name.localeCompare(b.client_name),
  );
  plannedRows.sort(
    (a, b) =>
      (a.planned_date ?? a.change_date ?? '9999').localeCompare(
        b.planned_date ?? b.change_date ?? '9999',
      ) || a.client_name.localeCompare(b.client_name),
  );

  return { rows: [...liveRows, ...plannedRows], errors };
}
