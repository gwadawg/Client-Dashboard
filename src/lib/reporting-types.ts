export const REPORTING_TYPES = ['RM', 'HE', 'DSCR'] as const;
export type ReportingType = (typeof REPORTING_TYPES)[number];

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
    description: 'Full reverse mortgage pipeline',
    color: '#38bdf8',
    background: 'rgba(56,189,248,0.14)',
  },
  HE: {
    label: 'HE — Appointment Only',
    shortLabel: 'HE',
    description: 'Home equity / appointment-only clients',
    color: '#a78bfa',
    background: 'rgba(167,139,250,0.14)',
  },
  DSCR: {
    label: 'DSCR',
    shortLabel: 'DSCR',
    description: 'DSCR loan clients',
    color: '#fbbf24',
    background: 'rgba(251,191,36,0.14)',
  },
};

export const REPORTING_TYPE_OPTIONS = REPORTING_TYPES.map(value => ({
  value,
  ...REPORTING_TYPE_META[value],
}));

export function normalizeReportingType(value: unknown): ReportingType {
  const raw = String(value ?? '').trim().toUpperCase();
  if (raw === 'HE' || raw.includes('APPOINTMENT') || raw.includes('HOME EQUITY')) return 'HE';
  if (raw === 'DSCR') return 'DSCR';
  if (raw === 'RM' || raw.includes('REVERSE')) return 'RM';
  return DEFAULT_REPORTING_TYPE;
}

export function getReportingTypeLabel(value: unknown): string {
  return REPORTING_TYPE_META[normalizeReportingType(value)].label;
}

/** HE clients use a different KPI grading model; RM and DSCR share the RM layout. */
export function usesHeKpiLayout(value: unknown): boolean {
  return normalizeReportingType(value) === 'HE';
}

export function usesRmKpiLayout(value: unknown): boolean {
  return !usesHeKpiLayout(value);
}
