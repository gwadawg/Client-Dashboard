/** WM Acquisition GHL location and calendar mapping. */

export const GHL_ACQUISITION_LOCATION_ID =
  process.env.GHL_ACQUISITION_LOCATION_ID?.trim() || 'AcDN4LEPnbiqOCWzG1NH';

export const INTRO_CALENDAR_IDS = new Set([
  '0ovb9efYBrznUlzxwehn', // WaizMedia Reverse MLO
  'IOCSMi5TkDwbxTbBJryk', // WM Reverse Strat Call
  'cKJhOoyiVEI7dSKhiRo6', // General Inquiry
]);

export const DEMO_CALENDAR_IDS = new Set([
  '71fF0PpCgY8Qv1PqeMFa', // Demo
]);

export const META_FUNNEL_EXCLUDED_TYPES = new Set(['bamfam', 'followup', 'organic', 'other']);

export const DOWNSELL_OFFER_TYPES = new Set(['Skool', 'Mid Offer', 'Bootcamp', 'skool', 'mid offer', 'bootcamp']);

export const CORE_OFFER_TYPES = new Set(['Core Offer', 'core offer', 'RM']);

export const META_LEAD_SOURCES = new Set(['Meta', 'meta', 'Facebook', 'facebook']);

export type AcquisitionAppointmentType =
  | 'intro'
  | 'demo'
  | 'bamfam'
  | 'followup'
  | 'organic'
  | 'other';

export type AcquisitionApptStatus =
  | 'showed'
  | 'no_show'
  | 'cancelled'
  | 'team_no_show'
  | 'pending';

export function calendarToAppointmentType(calendarId: string | null | undefined): AcquisitionAppointmentType {
  if (!calendarId) return 'other';
  if (INTRO_CALENDAR_IDS.has(calendarId)) return 'intro';
  if (DEMO_CALENDAR_IDS.has(calendarId)) return 'demo';
  return 'other';
}

export function normalizeSheetAppointmentType(raw: string | null | undefined): AcquisitionAppointmentType {
  const s = (raw ?? '').trim().toLowerCase();
  if (s === 'intro') return 'intro';
  if (s === 'demo') return 'demo';
  if (s === 'follow up' || s === 'followup') return 'followup';
  if (s === 'organic') return 'organic';
  if (s === 'bamfam') return 'bamfam';
  return 'other';
}

export function normalizeApptStatus(raw: string | null | undefined): AcquisitionApptStatus {
  const s = (raw ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return 'pending';
  if (s === 'y' || s === 'showed' || s === 'show') return 'showed';
  if (s === 'n' || s === 'no_show' || s === 'noshow' || s === 'no_showed') return 'no_show';
  if (s === 'c' || s === 'cancelled' || s === 'canceled') return 'cancelled';
  if (s === 'x' || s === 'team_no_show' || s === 'team_noshow') return 'team_no_show';
  if (s === 'confirmed' || s === 'booked' || s === 'new' || s === 'pending') return 'pending';
  return 'pending';
}

export function normalizeOfferType(raw: string | null | undefined): string {
  const s = (raw ?? '').trim();
  if (!s) return 'Core Offer';
  if (s.toLowerCase() === 'skool') return 'Skool';
  if (s.toLowerCase() === 'mid offer') return 'Mid Offer';
  if (s.toLowerCase() === 'bootcamp') return 'Bootcamp';
  if (s.toLowerCase() === 'core offer') return 'Core Offer';
  if (s.toLowerCase() === 'full service') return 'Core Offer';
  return s;
}

export function isMetaLeadSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return META_LEAD_SOURCES.has(source.trim()) || source.toLowerCase().includes('meta');
}

export function parseSheetDate(raw: string | null | undefined): Date | null {
  if (!raw?.trim()) return null;
  const s = raw.trim();
  const iso = Date.parse(s);
  if (!Number.isNaN(iso)) return new Date(iso);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[1]) - 1, Number(m[2]), 12, 0, 0));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 0) return `+${digits}`;
  return null;
}

export function sheetAppointmentKey(parts: {
  ghlContactId?: string | null;
  phone?: string | null;
  appointmentType: string;
  bookedAt?: string | null;
  scheduledAt?: string | null;
}): string {
  const id = parts.ghlContactId || normalizePhone(parts.phone) || 'unknown';
  return [id, parts.appointmentType, parts.bookedAt ?? '', parts.scheduledAt ?? ''].join('|');
}

export function parseCurrency(raw: string | null | undefined): number | null {
  if (!raw?.trim()) return null;
  const n = Number(raw.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export function assertAcquisitionLocation(locationId: string | null | undefined): boolean {
  if (!locationId) return false;
  return locationId === GHL_ACQUISITION_LOCATION_ID;
}

/** GHL custom field IDs — acquisition location (see docs/ACQUISITION_KPIS.md). */
export const GHL_CF = {
  agent: 'zBBKOu7IF0GyPKd92teI',
  leadSource: 'TbCY8dTtzXF0fSzyNB0R',
  bookingSource: 'YdG174ImpiTJQA45fecU',
  qualified: 'bKwAbfivInRpYqD9jZzx',
  appointmentId: 'wrkTN7hE0YHF5ZEUfTpy',
  dateApptBookedFor: 'gVy6ccjcRrRoYHi2ZNcy',
} as const;

/** WM PIPE pipeline + Demo Booked stage (from GHL discovery). */
export const GHL_WM_PIPELINE_ID = 'veiMi1Ql2sQGJWgfdLcy';
export const GHL_STAGE_DEMO_BOOKED = 'Demo Booked';

export const DEMO_CALENDAR_ID = '71fF0PpCgY8Qv1PqeMFa';

export const BOOKING_SOURCE_OPTIONS = [
  'Fresh lead',
  'Follow-Up',
  'No-Show',
  'Cold Call Lead',
  'Aged Lead',
  'Linkedin',
] as const;
