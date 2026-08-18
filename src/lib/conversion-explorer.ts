export const CONVERSION_STAGES = [
  'proposal_made',
  'submission_made',
  'loan_funded',
] as const;

export type ConversionStage = (typeof CONVERSION_STAGES)[number];

export type ConversionFlags = {
  has_proposal_made: boolean;
  has_submission_made: boolean;
  has_loan_funded: boolean;
};

export function isConversionStage(
  value: string | null | undefined,
): value is ConversionStage {
  return (
    value === 'proposal_made' ||
    value === 'submission_made' ||
    value === 'loan_funded'
  );
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
  T extends ConversionFlags & { has_lead_in_period: boolean },
>(profiles: T[], conversionEvent: string | null | undefined): T[] {
  if (!isConversionStage(conversionEvent)) {
    return profiles.filter(p => p.has_lead_in_period);
  }
  return profiles.filter(p => matchesConversionRollup(p, conversionEvent));
}

export function shouldShowConversionCosts(adSpend: number): boolean {
  return Number.isFinite(adSpend) && adSpend > 0;
}

export function conversionExplorerNav(stage: ConversionStage): {
  view: 'client_workspace';
  tab: 'explorer';
  sub: 'conversions';
  conv: ConversionStage;
} {
  return {
    view: 'client_workspace',
    tab: 'explorer',
    sub: 'conversions',
    conv: stage,
  };
}
