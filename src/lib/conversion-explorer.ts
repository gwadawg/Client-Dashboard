export const CONVERSION_STAGES = [
  'proposal_made',
  'submission_made',
  'loan_funded',
] as const;

/** Activity milestones on the Explorer stage filter (not KPI pipeline stages). */
export const ACTIVITY_STAGES = [
  'conversations',
  'claimed',
  'live_transfer',
  'show',
] as const;

export type ConversionStage = (typeof CONVERSION_STAGES)[number];
export type ActivityStage = (typeof ACTIVITY_STAGES)[number];

export type ConversionFlags = {
  has_proposal_made: boolean;
  has_submission_made: boolean;
  has_loan_funded: boolean;
};

/** Activity counts used by Explorer claimed / LT / show / conversations filters. */
export type ActivityCounts = {
  claimed: number;
  live_transfers: number;
  shows: number;
};

export type LeadQualityFilter = 'qualified' | 'hot' | 'qualified_hot';

export function isConversionStage(
  value: string | null | undefined,
): value is ConversionStage {
  return (
    value === 'proposal_made' ||
    value === 'submission_made' ||
    value === 'loan_funded'
  );
}

export function isActivityStage(
  value: string | null | undefined,
): value is ActivityStage {
  return (
    value === 'conversations' ||
    value === 'claimed' ||
    value === 'live_transfer' ||
    value === 'show'
  );
}

/** Conversations = claimed ∪ live transfer ∪ show (same unique-conversation definition as KPIs). */
export function matchesActivityStage(
  counts: ActivityCounts,
  stage: ActivityStage,
): boolean {
  if (stage === 'claimed') return counts.claimed > 0;
  if (stage === 'live_transfer') return counts.live_transfers > 0;
  if (stage === 'show') return counts.shows > 0;
  return counts.claimed > 0 || counts.live_transfers > 0 || counts.shows > 0;
}

export function isLeadQualityFilter(
  value: string | null | undefined,
): value is LeadQualityFilter {
  return value === 'qualified' || value === 'hot' || value === 'qualified_hot';

}

export function matchesLeadQuality(
  flags: { is_qualified: boolean; is_hot: boolean },
  quality: LeadQualityFilter,
): boolean {
  if (quality === 'qualified') return flags.is_qualified;
  if (quality === 'hot') return flags.is_hot;
  return flags.is_qualified && flags.is_hot;
}

/** KPI tab only: `roi` is canonical; `conversions` remains a bookmark alias. */
export function isKpiRoiSub(sub: string | null | undefined): boolean {
  return sub === 'roi' || sub === 'conversions';
}

export function matchesConversionRollup(
  flags: ConversionFlags,
  stage: ConversionStage,
): boolean {
  if (stage === 'loan_funded') return flags.has_loan_funded;
  if (stage === 'submission_made') {
    return flags.has_submission_made || flags.has_loan_funded;
  }
  return (
    flags.has_proposal_made ||
    flags.has_submission_made ||
    flags.has_loan_funded
  );
}

export function profilesForConversionExplorer<
  T extends ConversionFlags & {
    has_lead_in_period: boolean;
    counts?: ActivityCounts;
  },
>(profiles: T[], conversionEvent: string | null | undefined): T[] {
  if (isActivityStage(conversionEvent)) {
    return profiles.filter(
      (p) =>
        p.has_lead_in_period &&
        p.counts != null &&
        matchesActivityStage(p.counts, conversionEvent),
    );
  }
  if (!isConversionStage(conversionEvent)) {
    return profiles.filter((p) => p.has_lead_in_period);
  }
  return profiles.filter((p) => matchesConversionRollup(p, conversionEvent));
}

export function shouldShowConversionCosts(adSpend: number): boolean {
  return Number.isFinite(adSpend) && adSpend > 0;
}

export function conversionExplorerNav(stage: ConversionStage): {
  view: 'client_workspace';
  tab: 'explorer';
  sub: 'leads';
  conv: ConversionStage;
} {
  return {
    view: 'client_workspace',
    tab: 'explorer',
    sub: 'leads',
    conv: stage,
  };
}
