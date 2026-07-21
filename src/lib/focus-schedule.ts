/** Validation helpers for focus_schedule CRUD. */

export const FOCUS_STATUSES = ['scheduled', 'done', 'skipped'] as const;
export type FocusStatus = (typeof FOCUS_STATUSES)[number];

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

/** Normalize to HH:MM for storage / comparison. */
export function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  const m = TIME_RE.exec(t);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

export function isFocusStatus(v: unknown): v is FocusStatus {
  return typeof v === 'string' && (FOCUS_STATUSES as readonly string[]).includes(v);
}

export type FocusCreateInput = {
  client_id: string;
  agent_id?: string | null;
  scheduled_date: string;
  time_start: string;
  time_end: string;
  status?: FocusStatus;
  notes?: string | null;
};

export type FocusValidationResult =
  | { ok: true; value: FocusCreateInput }
  | { ok: false; error: string };

export function validateFocusCreate(body: unknown): FocusValidationResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const b = body as Record<string, unknown>;
  const client_id = typeof b.client_id === 'string' ? b.client_id.trim() : '';
  if (!client_id) return { ok: false, error: 'client_id required' };

  const scheduled_date = typeof b.scheduled_date === 'string' ? b.scheduled_date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
    return { ok: false, error: 'scheduled_date required (YYYY-MM-DD)' };
  }

  const time_start = normalizeTime(b.time_start);
  const time_end = normalizeTime(b.time_end);
  if (!time_start || !time_end) {
    return { ok: false, error: 'time_start and time_end required (HH:MM)' };
  }
  if (time_end <= time_start) {
    return { ok: false, error: 'time_end must be after time_start' };
  }

  let status: FocusStatus = 'scheduled';
  if (b.status !== undefined && b.status !== null) {
    if (!isFocusStatus(b.status)) {
      return { ok: false, error: 'status must be scheduled, done, or skipped' };
    }
    status = b.status;
  }

  const agent_id =
    b.agent_id === null || b.agent_id === undefined || b.agent_id === ''
      ? null
      : typeof b.agent_id === 'string'
        ? b.agent_id
        : null;

  const notes =
    b.notes === null || b.notes === undefined
      ? null
      : typeof b.notes === 'string'
        ? b.notes
        : null;

  return {
    ok: true,
    value: { client_id, agent_id, scheduled_date, time_start, time_end, status, notes },
  };
}

export type FocusPatchInput = {
  client_id?: string;
  agent_id?: string | null;
  scheduled_date?: string;
  time_start?: string;
  time_end?: string;
  status?: FocusStatus;
  notes?: string | null;
};

export type FocusPatchResult =
  | { ok: true; value: FocusPatchInput; time_start?: string; time_end?: string }
  | { ok: false; error: string };

export function validateFocusPatch(
  body: unknown,
  existing?: { time_start: string; time_end: string },
): FocusPatchResult {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid body' };
  }
  const b = body as Record<string, unknown>;
  const updates: FocusPatchInput = {};

  if ('client_id' in b) {
    const client_id = typeof b.client_id === 'string' ? b.client_id.trim() : '';
    if (!client_id) return { ok: false, error: 'client_id required' };
    updates.client_id = client_id;
  }

  if ('agent_id' in b) {
    updates.agent_id =
      b.agent_id === null || b.agent_id === '' || b.agent_id === undefined
        ? null
        : typeof b.agent_id === 'string'
          ? b.agent_id
          : null;
  }

  if ('scheduled_date' in b) {
    const scheduled_date = typeof b.scheduled_date === 'string' ? b.scheduled_date.trim() : '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduled_date)) {
      return { ok: false, error: 'scheduled_date required (YYYY-MM-DD)' };
    }
    updates.scheduled_date = scheduled_date;
  }

  let time_start = existing?.time_start;
  let time_end = existing?.time_end;

  if ('time_start' in b) {
    const n = normalizeTime(b.time_start);
    if (!n) return { ok: false, error: 'time_start must be HH:MM' };
    updates.time_start = n;
    time_start = n;
  }

  if ('time_end' in b) {
    const n = normalizeTime(b.time_end);
    if (!n) return { ok: false, error: 'time_end must be HH:MM' };
    updates.time_end = n;
    time_end = n;
  }

  if (time_start && time_end && time_end <= time_start) {
    return { ok: false, error: 'time_end must be after time_start' };
  }

  if ('status' in b) {
    if (!isFocusStatus(b.status)) {
      return { ok: false, error: 'status must be scheduled, done, or skipped' };
    }
    updates.status = b.status;
  }

  if ('notes' in b) {
    updates.notes =
      b.notes === null || b.notes === undefined
        ? null
        : typeof b.notes === 'string'
          ? b.notes
          : null;
  }

  if (Object.keys(updates).length === 0) {
    return { ok: false, error: 'No valid fields to update' };
  }

  return { ok: true, value: updates };
}
