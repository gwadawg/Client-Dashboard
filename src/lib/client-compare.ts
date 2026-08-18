/**
 * Client Compare — peer-wall helpers. KPI math stays in metrics.ts /
 * client-health.ts; this layer nulls empty denominators, decides which
 * clients appear on which chart, and computes visible-set medians.
 */

import {
  clientHealthSnapshotFromMetrics,
  heClientHealthSnapshotFromMetrics,
  KPI_MIN_DENOMINATOR,
  type ClientKpiBenchmarks,
  type HealthTier,
  type KpiKey,
} from '@/lib/client-health';
import { worstTier } from '@/lib/dept-health';
import { usesCallCenterKpiLayout, type ReportingType } from '@/lib/kpi-layouts';
import type { MetricsResult } from '@/lib/metrics';

export type CompareOfferFilter = 'all' | ReportingType;

export type CompareKpiKey =
  | 'spend'
  | 'cpl'
  | 'cpql'
  | 'cpconv'
  | 'hand_raise'
  | 'show_rate'
  | 'leads'
  | 'conversations'
  | 'booked';

export const COST_CHART_KEYS: CompareKpiKey[] = ['spend', 'cpl', 'cpql', 'cpconv'];
export const RATE_CHART_KEYS: CompareKpiKey[] = ['hand_raise', 'show_rate'];
export const VOLUME_CHART_KEYS: CompareKpiKey[] = ['leads', 'conversations'];

export type CompareGradeMap = Partial<Record<CompareKpiKey, HealthTier>>;

export type ClientCompareRow = {
  id: string;
  name: string;
  reporting_type: ReportingType;
  lifecycle_status: string | null;
  on_default_roster: boolean;
  spend: number | null;
  spend_missing: boolean;
  leads: number;
  qualified: number;
  unique_conversations: number;
  unique_booked: number;
  booked: number;
  cpl: number | null;
  cpql: number | null;
  cpconv: number | null;
  hand_raise: number | null;
  show_rate: number | null;
  grades: CompareGradeMap;
  north_star_grade: HealthTier;
  has_custom_cpl_benchmark: boolean;
  is_call_center: boolean;
};

export type CompareMapPoint = {
  id: string;
  name: string;
  reporting_type: ReportingType;
  x: number;
  y: number;
  z: number;
  hollow: boolean;
  colorTier: HealthTier;
  row: ClientCompareRow;
};

export type CompareBar = {
  id: string;
  name: string;
  value: number;
  hollow: boolean;
  grade: HealthTier | null;
  row: ClientCompareRow;
};

const CHURNED = new Set(['churned']);

export function isDefaultRosterClient(input: {
  lifecycle_status?: string | null;
  billing_paused?: boolean | null;
}): boolean {
  if (input.billing_paused === true) return false;
  const status = (input.lifecycle_status ?? 'active').toLowerCase();
  return !CHURNED.has(status);
}

function nullIfEmptyDenom(value: number, denom: number): number | null {
  if (!(denom > 0)) return null;
  return value;
}

function gradeOf(
  grades: { key: KpiKey; tier: HealthTier }[],
  key: KpiKey,
): HealthTier {
  return grades.find(g => g.key === key)?.tier ?? 'insufficient';
}

export function compareRowFromMetrics(input: {
  id: string;
  name: string;
  reporting_type: ReportingType;
  lifecycle_status?: string | null;
  billing_paused?: boolean | null;
  metrics: MetricsResult;
  /** Per-client Client Success overrides — used only to flag the tooltip. */
  benchmarks?: ClientKpiBenchmarks | null;
}): ClientCompareRow {
  const isCc = usesCallCenterKpiLayout(input.reporting_type);
  const m = input.metrics;
  const snap = isCc
    ? heClientHealthSnapshotFromMetrics(m, null)
    : clientHealthSnapshotFromMetrics(m, null);

  const spend = isCc ? null : m.ad_spend;
  const spendMissing = false;
  const cpl = isCc ? null : nullIfEmptyDenom(m.cpl, m.new_leads);
  const cpql = isCc ? null : nullIfEmptyDenom(m.cp_qualified, m.qualified_leads);
  const cpconv = isCc ? null : nullIfEmptyDenom(m.cp_conversation, m.unique_conversations);
  const handRaise = isCc
    ? nullIfEmptyDenom(m.lead_hand_raise_rate, m.new_leads)
    : nullIfEmptyDenom(m.hand_raise_rate, m.qualified_leads);
  const showRate = nullIfEmptyDenom(m.booked_to_conversation_rate, m.unique_booked_appointments);

  const grades: CompareGradeMap = {
    hand_raise: gradeOf(snap.grades, 'hand_raise_rate'),
    show_rate: gradeOf(snap.grades, 'show_rate'),
  };
  if (!isCc) {
    grades.cpl = gradeOf(snap.grades, 'cpl');
    grades.cpql = gradeOf(snap.grades, 'cpql');
    grades.cpconv = gradeOf(snap.grades, 'cps');
  }

  const northStar: HealthTier = isCc
    ? worstTier(grades.hand_raise ?? 'insufficient', grades.show_rate ?? 'insufficient')
    : grades.cpconv ?? 'insufficient';

  return {
    id: input.id,
    name: input.name,
    reporting_type: input.reporting_type,
    lifecycle_status: input.lifecycle_status ?? null,
    on_default_roster: isDefaultRosterClient(input),
    spend,
    spend_missing: spendMissing,
    leads: m.new_leads,
    qualified: m.qualified_leads,
    unique_conversations: m.unique_conversations,
    unique_booked: m.unique_booked_appointments,
    booked: m.booked_appointments,
    cpl,
    cpql,
    cpconv,
    hand_raise: handRaise,
    show_rate: showRate,
    grades,
    north_star_grade: northStar,
    has_custom_cpl_benchmark: Boolean(input.benchmarks?.cpl),
    is_call_center: isCc,
  };
}

export function rosterIdsForOffer(
  rows: ClientCompareRow[],
  offer: CompareOfferFilter,
): string[] {
  return rows
    .filter(r => r.on_default_roster)
    .filter(r => offer === 'all' || r.reporting_type === offer)
    .map(r => r.id);
}

export function rowsByIds(
  rows: ClientCompareRow[],
  ids: string[],
): ClientCompareRow[] {
  const want = new Set(ids);
  return rows.filter(r => want.has(r.id));
}

export function visibleChartKeys(rows: ClientCompareRow[]): CompareKpiKey[] {
  if (rows.length === 0) return [];
  const allCc = rows.every(r => r.is_call_center);
  const anyPaid = rows.some(r => !r.is_call_center);
  const keys: CompareKpiKey[] = [];
  if (anyPaid) keys.push(...COST_CHART_KEYS);
  keys.push(...RATE_CHART_KEYS, ...VOLUME_CHART_KEYS);
  if (allCc) keys.push('booked');
  return keys;
}

export function costChartsCaption(rows: ClientCompareRow[]): string | null {
  const anyPaid = rows.some(r => !r.is_call_center);
  const anyCc = rows.some(r => r.is_call_center);
  if (anyPaid && anyCc) return 'Call Center accounts excluded.';
  return null;
}

export function valueFor(row: ClientCompareRow, key: CompareKpiKey): number | null {
  switch (key) {
    case 'spend':
      return row.spend;
    case 'cpl':
      return row.cpl;
    case 'cpql':
      return row.cpql;
    case 'cpconv':
      return row.cpconv;
    case 'hand_raise':
      return row.hand_raise;
    case 'show_rate':
      return row.show_rate;
    case 'leads':
      return row.leads;
    case 'conversations':
      return row.unique_conversations;
    case 'booked':
      return row.booked;
  }
}

function denomFor(row: ClientCompareRow, key: CompareKpiKey): number {
  switch (key) {
    case 'spend':
      return 1;
    case 'cpl':
      return row.leads;
    case 'cpql':
      return row.qualified;
    case 'cpconv':
      return row.unique_conversations;
    case 'hand_raise':
      return row.is_call_center ? row.leads : row.qualified;
    case 'show_rate':
      return row.unique_booked;
    case 'leads':
    case 'conversations':
    case 'booked':
      return 1;
  }
}

function minDenomFor(row: ClientCompareRow, key: CompareKpiKey): number {
  switch (key) {
    case 'cpl':
      return KPI_MIN_DENOMINATOR.cpl;
    case 'cpql':
      return KPI_MIN_DENOMINATOR.cpql;
    case 'cpconv':
      return KPI_MIN_DENOMINATOR.cps;
    case 'hand_raise':
      return row.is_call_center
        ? KPI_MIN_DENOMINATOR.lead_booking_rate
        : KPI_MIN_DENOMINATOR.hand_raise_rate;
    case 'show_rate':
      return KPI_MIN_DENOMINATOR.show_rate;
    default:
      return 0;
  }
}

export function isHollowBar(row: ClientCompareRow, key: CompareKpiKey): boolean {
  const min = minDenomFor(row, key);
  if (min <= 0) return false;
  return denomFor(row, key) < min;
}

function lowerIsWorse(key: CompareKpiKey): boolean {
  return key === 'hand_raise' || key === 'show_rate' || key === 'leads' || key === 'conversations' || key === 'booked';
}

export function barsForChart(rows: ClientCompareRow[], key: CompareKpiKey): CompareBar[] {
  const cost = (COST_CHART_KEYS as string[]).includes(key);
  const eligible = rows.filter(r => {
    if (cost && r.is_call_center) return false;
    return valueFor(r, key) != null;
  });
  const bars: CompareBar[] = eligible.map(row => ({
    id: row.id,
    name: row.name,
    value: valueFor(row, key) as number,
    hollow: isHollowBar(row, key),
    grade: row.grades[key] ?? null,
    row,
  }));
  const asc = lowerIsWorse(key);
  bars.sort((a, b) => (asc ? a.value - b.value : b.value - a.value));
  return bars;
}

export function medianOf(values: number[]): number | null {
  const nums = values.filter(n => Number.isFinite(n)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const mid = Math.floor(nums.length / 2);
  if (nums.length % 2 === 1) return nums[mid];
  return (nums[mid - 1] + nums[mid]) / 2;
}

export function medianForBars(bars: CompareBar[]): number | null {
  return medianOf(bars.filter(b => !b.hollow).map(b => b.value));
}

function costMapHollow(row: ClientCompareRow): boolean {
  return (
    row.unique_conversations < KPI_MIN_DENOMINATOR.cps
    || (row.is_call_center ? row.leads : row.qualified) < KPI_MIN_DENOMINATOR.hand_raise_rate
  );
}

function rateMapHollow(row: ClientCompareRow): boolean {
  const hrMin = row.is_call_center
    ? KPI_MIN_DENOMINATOR.lead_booking_rate
    : KPI_MIN_DENOMINATOR.hand_raise_rate;
  const hrDenom = row.is_call_center ? row.leads : row.qualified;
  return hrDenom < hrMin || row.unique_booked < KPI_MIN_DENOMINATOR.show_rate;
}

export function costMapPoints(rows: ClientCompareRow[]): CompareMapPoint[] {
  return rows
    .filter(r => !r.is_call_center && r.cpconv != null && r.hand_raise != null)
    .map(row => {
      const hollow = costMapHollow(row);
      return {
        id: row.id,
        name: row.name,
        reporting_type: row.reporting_type,
        x: row.cpconv as number,
        y: row.hand_raise as number,
        z: Math.max(row.unique_conversations, 1),
        hollow,
        colorTier: hollow ? 'insufficient' : row.north_star_grade,
        row,
      };
    });
}

export function rateMapPoints(rows: ClientCompareRow[]): CompareMapPoint[] {
  return rows
    .filter(r => r.hand_raise != null && r.show_rate != null)
    .map(row => {
      const hollow = rateMapHollow(row);
      return {
        id: row.id,
        name: row.name,
        reporting_type: row.reporting_type,
        x: row.hand_raise as number,
        y: row.show_rate as number,
        z: Math.max(row.unique_conversations, 1),
        hollow,
        colorTier: hollow ? 'insufficient' : row.north_star_grade,
        row,
      };
    });
}

export function mapMedians(points: CompareMapPoint[]): { x: number | null; y: number | null } {
  const solid = points.filter(p => !p.hollow);
  return {
    x: medianOf(solid.map(p => p.x)),
    y: medianOf(solid.map(p => p.y)),
  };
}

export function shouldDefaultToRateMap(rows: ClientCompareRow[]): boolean {
  return costMapPoints(rows).length === 0;
}

export function countWithSpend(rows: ClientCompareRow[]): number {
  return rows.filter(r => r.spend != null).length;
}

export function inclusiveDayCount(start: string, end: string): number {
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 0;
  return Math.round((e - s) / 86400000) + 1;
}

export function showPendingCaveat(start: string, end: string): boolean {
  return inclusiveDayCount(start, end) <= 14;
}

export type CompareDatePreset = 'last_7' | 'last_30' | 'last_60' | 'last_90' | 'custom';

export const COMPARE_PRESET_LABELS: Record<CompareDatePreset, string> = {
  last_7: 'Last 7',
  last_30: 'Last 30',
  last_60: 'Last 60',
  last_90: 'Last 90',
  custom: 'Custom',
};

function addDaysYmd(ymd: string, deltaDays: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`);
  const d = new Date(t + deltaDays * 86400000);
  return d.toISOString().slice(0, 10);
}

/** Match dashboard last_N: start = today − N days, end = today. */
export function rangeForComparePreset(
  preset: CompareDatePreset,
  todayYmd: string,
  custom?: { start: string; end: string },
): { start: string; end: string } {
  if (preset === 'custom') {
    const start = custom?.start || todayYmd;
    const end = custom?.end || todayYmd;
    return start <= end ? { start, end } : { start: end, end: start };
  }
  const days = preset === 'last_7' ? 7 : preset === 'last_30' ? 30 : preset === 'last_60' ? 60 : 90;
  return { start: addDaysYmd(todayYmd, -days), end: todayYmd };
}

export function parseOfferFilter(raw: string | null | undefined): CompareOfferFilter {
  const v = String(raw ?? 'all').trim().toUpperCase();
  if (v === 'RM' || v === 'DSCR' || v === 'CALL_CENTER') return v;
  return 'all';
}

export function parseIdList(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}
