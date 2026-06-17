/**
 * Client vertical — what product line / marketing motion this client is on.
 *
 * RM: reverse mortgage ads + pipeline
 * DSCR: DSCR loan ads + pipeline
 * CALL_CENTER: we dial the LO's existing leads (legacy DB value HE maps here)
 *
 * Service tier (core vs lead_gen) lives in service_program — see service-program.ts.
 */

export const REPORTING_TYPES = ['RM', 'DSCR', 'CALL_CENTER'] as const;
export type ReportingType = (typeof REPORTING_TYPES)[number];

/** @deprecated Legacy alias — normalize maps HE → CALL_CENTER */
export type LegacyReportingType = ReportingType | 'HE';

export const DEFAULT_REPORTING_TYPE: ReportingType = 'RM';

export type ReportingTypeMeta = {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  background: string;
};

export const REPORTING_TYPE_META: Record<ReportingType, ReportingTypeMeta> = {
  RM: {
    label: 'RM — Reverse Mortgage',
    shortLabel: 'RM',
    description: 'Marketing reverse mortgages (ads + pipeline)',
    color: '#38bdf8',
    background: 'rgba(56,189,248,0.14)',
  },
  DSCR: {
    label: 'DSCR',
    shortLabel: 'DSCR',
    description: 'Marketing DSCR loans (ads + pipeline)',
    color: '#fbbf24',
    background: 'rgba(251,191,36,0.14)',
  },
  CALL_CENTER: {
    label: 'Call Center',
    shortLabel: 'CC',
    description: 'Dialing the LO\'s leads — no ad-gen motion on our side',
    color: '#a78bfa',
    background: 'rgba(167,139,250,0.14)',
  },
};

export const REPORTING_TYPE_OPTIONS = REPORTING_TYPES.map(value => ({
  value,
  ...REPORTING_TYPE_META[value],
}));

export function normalizeReportingType(value: unknown): ReportingType {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '_');
  if (!raw) return DEFAULT_REPORTING_TYPE;

  if (raw === 'CALL_CENTER' || raw === 'CALLCENTER' || raw === 'CC') return 'CALL_CENTER';
  if (raw === 'HE' || raw.includes('APPOINTMENT') || raw.includes('HOME_EQUITY')) return 'CALL_CENTER';
  if (raw === 'DSCR') return 'DSCR';
  if (raw === 'RM' || raw.includes('REVERSE')) return 'RM';

  return DEFAULT_REPORTING_TYPE;
}

export function getReportingTypeLabel(value: unknown): string {
  return REPORTING_TYPE_META[normalizeReportingType(value)].label;
}

/** Call Center clients use appointment/booking KPIs (no ad-spend grading). */
export function usesCallCenterKpiLayout(value: unknown): boolean {
  return normalizeReportingType(value) === 'CALL_CENTER';
}

/** @deprecated Use usesCallCenterKpiLayout */
export function usesHeKpiLayout(value: unknown): boolean {
  return usesCallCenterKpiLayout(value);
}

export function usesRmKpiLayout(value: unknown): boolean {
  return !usesCallCenterKpiLayout(value);
}
