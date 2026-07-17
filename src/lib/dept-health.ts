/**
 * Role-scoped Client Success status — Media Buyer / CCM / Overview.
 * Overview uses account north star (CPConv); role lenses never grade on CPConv.
 */
import {
  DEFAULT_KPI_BANDS,
  leadingGradeFor,
  type ClientHealthRow,
  type ClientHealthSnapshot,
  type HealthTier,
  type KpiGrade,
  type KpiKey,
  type RecentLeading,
} from '@/lib/client-health';
import { KPI_DEFINITIONS, type KpiOwner } from '@/lib/kpi-definitions';

/** Department lens — same health payload, different status + columns. */
export type DeptLens = 'overview' | 'media_buyer' | 'ccm';

export const TIER_WEIGHT: Record<HealthTier, number> = {
  critical: 4,
  below: 3,
  at: 2,
  above: 1,
  insufficient: 0,
};

export function worstTier(...tiers: HealthTier[]): HealthTier {
  return tiers.reduce(
    (worst, t) => (TIER_WEIGHT[t] > TIER_WEIGHT[worst] ? t : worst),
    'above' as HealthTier,
  );
}

/** Grade a rate % against DEFAULT_KPI_BANDS. */
export function rateTierFromBands(
  key: KpiKey,
  value: number,
  denominator: number,
  minDenom: number,
): HealthTier {
  if (denominator < minDenom) return 'insufficient';
  const { bands, higherIsBetter } = DEFAULT_KPI_BANDS[key];
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

function gradeOf(row: ClientHealthRow, key: KpiKey): HealthTier {
  return row.current.grades.find(g => g.key === key)?.tier ?? 'insufficient';
}

/** Prefer leading 7d grade when available; else baseline. */
function leadingOrBaseline(row: ClientHealthRow, key: KpiKey): HealthTier {
  const lead = leadingGradeFor(row.recent, key);
  return lead !== 'insufficient' ? lead : gradeOf(row, key);
}

/**
 * Media Buyer owns lead cost + qual quality — CPL, CPQL, lead→qualified.
 * Prefer leading 7d when graded. Never CPConv.
 */
export function mediaBuyerStatus(row: ClientHealthRow): HealthTier {
  const graded = (['cpl', 'cpql', 'lead_to_qualified'] as const)
    .map(key => leadingOrBaseline(row, key))
    .filter(t => t !== 'insufficient');
  if (graded.length === 0) return 'insufficient';
  return worstTier(...graded);
}

/**
 * CCM owns post-lead conversion — unique hand-raise, show, conversation rate.
 * Booking-only rate is not graded (rebooks / multi-events inflate it; LT/claimed
 * would be missed). Never CPL / CPQL / CPConv.
 */
export function ccmStatus(row: ClientHealthRow, isHe: boolean): HealthTier {
  const m = row.current.metrics;
  const show = gradeOf(row, 'show_rate');
  const hand = gradeOf(row, 'hand_raise_rate');
  const conv = isHe
    ? 'insufficient'
    : rateTierFromBands(
        'hand_raise_rate',
        m.conversation_rate,
        m.qualified_leads,
        5,
      );
  const graded = [show, hand, conv].filter(t => t !== 'insufficient');
  if (graded.length === 0) return 'insufficient';
  return worstTier(...graded);
}

/** Status for the active department lens. Overview = account north star. */
export function deptStatus(row: ClientHealthRow, lens: DeptLens, isHe: boolean): HealthTier {
  if (lens === 'media_buyer') return mediaBuyerStatus(row);
  if (lens === 'ccm') return ccmStatus(row, isHe);
  return row.current.worst_tier;
}

/** Status from detail payload pieces (no full ClientHealthRow required). */
export function deptStatusFromSnapshot(
  current: ClientHealthSnapshot,
  recent: RecentLeading | null,
  lens: DeptLens,
  isHe: boolean,
): HealthTier {
  return deptStatus(
    { current, recent } as ClientHealthRow,
    lens,
    isHe,
  );
}

const LENS_OWNER: Record<Exclude<DeptLens, 'overview'>, KpiOwner> = {
  media_buyer: 'media_buyer',
  ccm: 'ccm',
};

/** Grades shown in expanded rows / role-first scorecards for a lens. */
export function gradesForLens(grades: KpiGrade[], lens: DeptLens): KpiGrade[] {
  if (lens === 'overview') return grades;
  const owner = LENS_OWNER[lens];
  return grades.filter(g => KPI_DEFINITIONS[g.key]?.owner === owner);
}

export const DEPT_LENS_LABEL: Record<DeptLens, string> = {
  overview: 'Account',
  media_buyer: 'Media',
  ccm: 'CCM',
};
