import type { SupabaseClient } from '@supabase/supabase-js';
import { onCsAppointmentTouchpointHooks } from '@/lib/cs-touchpoint-rules';

export const CS_CALL_TYPES = ['onboarding', 'launch', 'checkin'] as const;
export type CsCallType = (typeof CS_CALL_TYPES)[number];

export const CS_APPOINTMENT_STATUSES = [
  'scheduled',
  'cancelled',
  'completed',
  'no_show',
] as const;
export type CsAppointmentStatus = (typeof CS_APPOINTMENT_STATUSES)[number];

export type CsCalendarConfig = {
  calendar_id: string;
  calendar_name: string;
  call_type: CsCallType;
};

export type CsAppointmentRow = {
  id: string;
  clickup_task_id: string;
  ghl_appointment_id: string;
  calendar_id: string;
  calendar_name: string | null;
  booked_at: string | null;
  scheduled_at: string;
  status: CsAppointmentStatus;
  title: string | null;
  assigned_to: string | null;
  created_at?: string;
  updated_at?: string;
};

export type CsAppointmentEnriched = CsAppointmentRow & {
  call_type: CsCallType | null;
  client_id: string | null;
  client_name: string | null;
};

type JsonObject = Record<string, unknown>;

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function isCsStatus(v: string): v is CsAppointmentStatus {
  return (CS_APPOINTMENT_STATUSES as readonly string[]).includes(v);
}

export function normalizeCsStatus(v: unknown): CsAppointmentStatus | null {
  const s = str(v)?.toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (s === 'canceled') return 'cancelled';
  if (s === 'no-show' || s === 'noshow') return 'no_show';
  if (isCsStatus(s)) return s;
  return null;
}

export function parseCsScheduledAt(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const d = new Date(s);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

export type UpsertCsAppointmentResult =
  | {
      ok: true;
      id: string;
      mapped_client: boolean;
      call_type: CsCallType;
      created: boolean;
    }
  | { ok: false; status: number; error: string };

export async function loadCsCalendarConfig(
  service: SupabaseClient,
  calendarId: string,
): Promise<CsCalendarConfig | null> {
  const { data, error } = await service
    .from('cs_calendar_config')
    .select('calendar_id, calendar_name, call_type')
    .eq('calendar_id', calendarId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return data as CsCalendarConfig;
}

export async function upsertCsAppointment(
  service: SupabaseClient,
  payload: JsonObject,
): Promise<UpsertCsAppointmentResult> {
  const ghlAppointmentId = str(
    payload.ghl_appointment_id ?? payload.appointment_id ?? payload.external_id,
  );
  const clickupTaskId = str(
    payload.clickup_task_id ?? payload.clickup_id ?? payload.clickup_client_id,
  );
  const calendarId = str(payload.calendar_id);
  const scheduledAt = parseCsScheduledAt(payload.scheduled_at ?? payload.start_time);

  if (!ghlAppointmentId) {
    return { ok: false, status: 400, error: 'ghl_appointment_id is required' };
  }
  if (!clickupTaskId) {
    return { ok: false, status: 400, error: 'clickup_task_id is required' };
  }
  if (!calendarId) {
    return { ok: false, status: 400, error: 'calendar_id is required' };
  }
  if (!scheduledAt) {
    return { ok: false, status: 400, error: 'scheduled_at is required (valid ISO datetime)' };
  }

  const config = await loadCsCalendarConfig(service, calendarId);
  if (!config) {
    return {
      ok: false,
      status: 400,
      error: `Unknown calendar_id "${calendarId}" — seed cs_calendar_config first`,
    };
  }

  const status = normalizeCsStatus(payload.status) ?? 'scheduled';
  const calendarName =
    str(payload.calendar_name) ?? config.calendar_name ?? null;
  const bookedAt = parseCsScheduledAt(payload.booked_at ?? payload.date_created);
  const title = str(payload.title ?? payload.appointment_title);
  const assignedTo = str(
    payload.assigned_to ?? payload.assigned_user ?? payload.agent_name,
  );
  const raw =
    payload.raw && typeof payload.raw === 'object' && !Array.isArray(payload.raw)
      ? (payload.raw as JsonObject)
      : payload;

  const { data: existing } = await service
    .from('cs_appointments')
    .select('id')
    .eq('ghl_appointment_id', ghlAppointmentId)
    .maybeSingle();

  const row = {
    clickup_task_id: clickupTaskId,
    ghl_appointment_id: ghlAppointmentId,
    calendar_id: calendarId,
    calendar_name: calendarName,
    booked_at: bookedAt,
    scheduled_at: scheduledAt,
    status,
    title,
    assigned_to: assignedTo,
    raw,
    updated_at: new Date().toISOString(),
  };

  let id: string;
  let created: boolean;
  if (existing?.id) {
    const { data, error } = await service
      .from('cs_appointments')
      .update(row)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = data.id;
    created = false;
  } else {
    const { data, error } = await service
      .from('cs_appointments')
      .insert(row)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    id = data.id;
    created = true;
  }

  const { data: client } = await service
    .from('clients')
    .select('id')
    .eq('clickup_task_id', clickupTaskId)
    .maybeSingle();

  try {
    await onCsAppointmentTouchpointHooks(service, {
      appointmentId: id,
      clientId: client?.id ?? null,
      callType: config.call_type,
      status,
      scheduledAt,
    });
  } catch (err) {
    console.error('[cs_touchpoints] appointment hook failed', err);
  }

  return {
    ok: true,
    id,
    mapped_client: !!client?.id,
    call_type: config.call_type,
    created,
  };
}

const UPCOMING_DAYS_DEFAULT = 14;

export async function listUpcomingCsAppointments(
  service: SupabaseClient,
  opts?: { days?: number; now?: Date },
): Promise<CsAppointmentEnriched[]> {
  const days = opts?.days ?? UPCOMING_DAYS_DEFAULT;
  const now = opts?.now ?? new Date();
  const from = now.toISOString();
  const to = new Date(now.getTime() + days * 86400000).toISOString();

  const { data: appts, error } = await service
    .from('cs_appointments')
    .select(
      'id, clickup_task_id, ghl_appointment_id, calendar_id, calendar_name, booked_at, scheduled_at, status, title, assigned_to, created_at, updated_at',
    )
    .eq('status', 'scheduled')
    .gte('scheduled_at', from)
    .lte('scheduled_at', to)
    .order('scheduled_at', { ascending: true });

  if (error) throw new Error(error.message);
  return enrichCsAppointments(service, (appts ?? []) as CsAppointmentRow[]);
}

export async function listCsAppointmentsForClickup(
  service: SupabaseClient,
  clickupTaskId: string,
  opts?: { includePastDays?: number | null; history?: boolean },
): Promise<CsAppointmentEnriched[]> {
  let query = service
    .from('cs_appointments')
    .select(
      'id, clickup_task_id, ghl_appointment_id, calendar_id, calendar_name, booked_at, scheduled_at, status, title, assigned_to, created_at, updated_at',
    )
    .eq('clickup_task_id', clickupTaskId);

  const history = opts?.history === true || opts?.includePastDays === null;
  if (!history) {
    const pastDays = opts?.includePastDays ?? 30;
    const from = new Date(Date.now() - pastDays * 86400000).toISOString();
    query = query.gte('scheduled_at', from);
  }

  const { data: appts, error } = await query.order('scheduled_at', {
    ascending: !history,
  });

  if (error) throw new Error(error.message);
  return enrichCsAppointments(service, (appts ?? []) as CsAppointmentRow[]);
}

async function enrichCsAppointments(
  service: SupabaseClient,
  rows: CsAppointmentRow[],
): Promise<CsAppointmentEnriched[]> {
  if (rows.length === 0) return [];

  const calendarIds = [...new Set(rows.map(r => r.calendar_id))];
  const clickupIds = [...new Set(rows.map(r => r.clickup_task_id))];

  const [{ data: configs }, { data: clients }] = await Promise.all([
    service
      .from('cs_calendar_config')
      .select('calendar_id, call_type')
      .in('calendar_id', calendarIds),
    service
      .from('clients')
      .select('id, name, clickup_task_id')
      .in('clickup_task_id', clickupIds),
  ]);

  const typeByCal = new Map(
    (configs ?? []).map(c => [c.calendar_id as string, c.call_type as CsCallType]),
  );
  const clientByClickup = new Map(
    (clients ?? []).map(c => [
      c.clickup_task_id as string,
      { id: c.id as string, name: c.name as string },
    ]),
  );

  return rows.map(r => {
    const client = clientByClickup.get(r.clickup_task_id) ?? null;
    return {
      ...r,
      call_type: typeByCal.get(r.calendar_id) ?? null,
      client_id: client?.id ?? null,
      client_name: client?.name ?? null,
    };
  });
}

/** Next scheduled appointment per ClickUp ID (for roster cells). */
export async function mapNextCsAppointmentByClickup(
  service: SupabaseClient,
  clickupTaskIds: string[],
): Promise<Map<string, CsAppointmentEnriched>> {
  const unique = [...new Set(clickupTaskIds.filter(Boolean))];
  const map = new Map<string, CsAppointmentEnriched>();
  if (unique.length === 0) return map;

  const now = new Date().toISOString();
  const { data: appts, error } = await service
    .from('cs_appointments')
    .select(
      'id, clickup_task_id, ghl_appointment_id, calendar_id, calendar_name, booked_at, scheduled_at, status, title, assigned_to',
    )
    .in('clickup_task_id', unique)
    .eq('status', 'scheduled')
    .gte('scheduled_at', now)
    .order('scheduled_at', { ascending: true });

  if (error) throw new Error(error.message);

  const enriched = await enrichCsAppointments(
    service,
    (appts ?? []) as CsAppointmentRow[],
  );
  for (const row of enriched) {
    if (!map.has(row.clickup_task_id)) {
      map.set(row.clickup_task_id, row);
    }
  }
  return map;
}

export function csCallTypeLabel(type: CsCallType | null | undefined): string {
  switch (type) {
    case 'onboarding':
      return 'Onboarding';
    case 'launch':
      return 'Launch';
    case 'checkin':
      return 'Check-in';
    default:
      return 'CS Call';
  }
}
