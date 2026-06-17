import { createHmac, timingSafeEqual } from 'crypto';

const DEFAULT_TTL_HOURS = 72;

function secret(): string {
  const s =
    process.env.ACQUISITION_FORM_SECRET?.trim() ||
    process.env.ADMIN_WEBHOOK_SECRET?.trim();
  if (!s) {
    throw new Error('ACQUISITION_FORM_SECRET is not configured');
  }
  return s;
}

function signPayload(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex');
}

/** Issue a magic-link token for acquisition forms. */
export function signAcquisitionFormToken(
  contactId: string,
  appointmentId?: string | null,
  ttlHours = DEFAULT_TTL_HOURS,
): string {
  const exp = Math.floor(Date.now() / 1000) + ttlHours * 3600;
  const appt = appointmentId?.trim() || '';
  const payload = `${contactId}|${appt}|${exp}`;
  const sig = signPayload(payload);
  return `${exp}.${sig}`;
}

export function verifyAcquisitionFormToken(
  contactId: string,
  appointmentId: string | null | undefined,
  token: string | null | undefined,
): { ok: true } | { ok: false; error: string } {
  if (!token?.trim()) return { ok: false, error: 'Missing token' };
  const parts = token.trim().split('.');
  if (parts.length !== 2) return { ok: false, error: 'Invalid token format' };

  const exp = Number(parts[0]);
  const sig = parts[1];
  if (!Number.isFinite(exp) || !sig) return { ok: false, error: 'Invalid token' };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, error: 'Token expired' };

  const appt = appointmentId?.trim() || '';
  const payload = `${contactId}|${appt}|${exp}`;
  const expected = signPayload(payload);

  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, error: 'Invalid token signature' };
    }
  } catch {
    return { ok: false, error: 'Invalid token signature' };
  }

  return { ok: true };
}

export function buildDemoBookedFormUrl(
  baseUrl: string,
  contactId: string,
  appointmentId?: string | null,
): string {
  return buildIntroReflectionFormUrl(baseUrl, contactId, {
    formContext: 'demo_booked',
    demoAppointmentId: appointmentId,
  });
}

export function buildIntroReflectionFormUrl(
  baseUrl: string,
  contactId: string,
  opts?: {
    formContext?: 'intro_showed' | 'demo_booked';
    introAppointmentId?: string | null;
    demoAppointmentId?: string | null;
  },
): string {
  const formContext = opts?.formContext ?? 'demo_booked';
  const primaryAppt =
    formContext === 'intro_showed'
      ? opts?.introAppointmentId?.trim()
      : opts?.demoAppointmentId?.trim() ?? opts?.introAppointmentId?.trim();

  const token = signAcquisitionFormToken(contactId, primaryAppt);
  const params = new URLSearchParams({
    contact_id: contactId,
    token,
    form_context: formContext,
  });
  if (opts?.introAppointmentId?.trim()) {
    params.set('intro_appointment_id', opts.introAppointmentId.trim());
  }
  if (opts?.demoAppointmentId?.trim()) {
    params.set('demo_appointment_id', opts.demoAppointmentId.trim());
  }
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/forms/acquisition/intro-reflection?${params.toString()}`;
}

export function buildDemoAuditFormUrl(
  baseUrl: string,
  contactId: string,
  appointmentId?: string | null,
): string {
  const token = signAcquisitionFormToken(contactId, appointmentId);
  const params = new URLSearchParams({ contact_id: contactId, token });
  if (appointmentId?.trim()) params.set('appointment_id', appointmentId.trim());
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/forms/acquisition/demo-audit?${params.toString()}`;
}
