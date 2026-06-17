import { normalizeReportingType } from '@/lib/reporting-types';

export const SERVICE_PROGRAMS = ['core', 'lead_gen'] as const;
export type ServiceProgram = (typeof SERVICE_PROGRAMS)[number];

export type ServiceProgramMeta = {
  label: string;
  shortLabel: string;
  description: string;
  color: string;
  background: string;
};

export const SERVICE_PROGRAM_META: Record<ServiceProgram, ServiceProgramMeta> = {
  core: {
    label: 'Core — Full Service',
    shortLabel: 'Core',
    description: 'We generate leads, dial, book appointments, and qualify.',
    color: '#34d399',
    background: 'rgba(52,211,153,0.12)',
  },
  lead_gen: {
    label: 'Lead Gen Only',
    shortLabel: 'Leads',
    description: 'We generate leads only — client handles dial, booking, and qualification.',
    color: '#94a3b8',
    background: 'rgba(148,163,184,0.12)',
  },
};

export function normalizeServiceProgram(value: unknown): ServiceProgram | null {
  const raw = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!raw) return null;
  if (raw === 'core' || raw.includes('full')) return 'core';
  if (raw === 'lead_gen' || raw === 'leadgen' || raw.includes('lead_gen') || raw.includes('lead gen')) {
    return 'lead_gen';
  }
  return null;
}

export function getServiceProgramLabel(value: unknown): string | null {
  const normalized = normalizeServiceProgram(value);
  return normalized ? SERVICE_PROGRAM_META[normalized].label : null;
}

/** Service program applies to RM and DSCR marketing clients, not Call Center. */
export function serviceProgramApplies(vertical: unknown): boolean {
  const v = normalizeReportingType(vertical);
  return v === 'RM' || v === 'DSCR';
}

export const SERVICE_PROGRAM_OPTIONS = SERVICE_PROGRAMS.map(value => ({
  value,
  ...SERVICE_PROGRAM_META[value],
}));
