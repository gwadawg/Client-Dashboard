/**
 * Team meeting runbooks — Q3 cadence templates, São Paulo scheduling,
 * checklist / disposition validation, complete → team_calls mapping.
 *
 * Cadence copy (agenda_md, checklist labels) is intentionally placeholder;
 * fill later from Wm-os SOPs without changing keys.
 */

import { CALL_CENTER_TIMEZONE, zonedWallTimeToUtc } from './time';
import type { TeamCallTypeCode } from './team-calls';

export type TeamMeetingHostRole = 'ccm' | 'client_success' | 'ceo' | 'shared';

export type TeamMeetingStatus =
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'skipped'
  | 'cancelled';

export type ChecklistItemDef = {
  key: string;
  label: string;
  required: boolean;
  section?: string;
};

export type DispositionFieldDef = {
  key: string;
  label: string;
  required: boolean;
  type: 'text' | 'textarea' | 'url';
};

export type TeamMeetingSeed = {
  slug: string;
  title: string;
  theme: string;
  call_type: TeamCallTypeCode;
  /** Empty = Mon–Fri. ISO: 1=Mon … 7=Sun. */
  weekdays: number[];
  /** HH:MM or HH:MM:SS in CALL_CENTER_TIMEZONE */
  default_time: string;
  duration_min: number;
  host_role: TeamMeetingHostRole;
  attendee_roles: string[];
  agenda_md: string;
  checklist: ChecklistItemDef[];
  disposition: DispositionFieldDef[];
};

export const SHARED_DISPOSITION: DispositionFieldDef[] = [
  { key: 'recording_url', label: 'Recording URL', required: true, type: 'url' },
  { key: 'summary', label: 'Summary', required: true, type: 'textarea' },
  { key: 'participants_present', label: 'Who attended', required: true, type: 'text' },
  { key: 'follow_ups', label: 'Follow-ups', required: false, type: 'textarea' },
  { key: 'skipped_reason', label: 'Skip reason', required: false, type: 'textarea' },
];

/** Placeholder labels — replace when SOPs / cadences are authored. */
export const TEAM_MEETING_SEED: TeamMeetingSeed[] = [
  {
    slug: 'daily-setter-training',
    title: 'Daily Setter Training',
    theme: 'Numbers → one focus → dial targets',
    call_type: 'training',
    weekdays: [],
    default_time: '09:00',
    duration_min: 20,
    host_role: 'ccm',
    attendee_roles: ['ccm', 'call_rep'],
    agenda_md:
      'PLACEHOLDER — fill from CCM Daily OS.\n\nIn: numbers, one coaching focus, today dial targets.\nOut: deep stack rebuild, creative debates.',
    checklist: [
      { key: 'numbers_reviewed', label: 'Numbers reviewed', required: true, section: 'run' },
      { key: 'one_coaching_focus', label: 'One coaching focus named', required: true, section: 'run' },
      { key: 'dial_targets_set', label: 'Dial targets / accounts set', required: true, section: 'run' },
    ],
    disposition: SHARED_DISPOSITION,
  },
  {
    slug: 'mon-kpi-week-plan',
    title: 'Mon KPI — Week Plan',
    theme: 'R/Y/G scan + named commitments',
    call_type: 'team_meeting',
    weekdays: [1],
    default_time: '10:00',
    duration_min: 25,
    host_role: 'client_success',
    attendee_roles: ['client_success', 'media_buyer', 'ccm'],
    agenda_md:
      'PLACEHOLDER — fill from Q3 restructure.\n\nIn: RYG scan, reds with owners + due dates, OB glance.\nOut: creative debates, CEO status theater.',
    checklist: [
      { key: 'ryg_scan_done', label: 'R/Y/G scan done', required: true, section: 'run' },
      { key: 'reds_have_owners', label: 'Reds have owners', required: true, section: 'run' },
      { key: 'commitments_named', label: 'Commitments named + due', required: true, section: 'run' },
      { key: 'ob_glance', label: 'OB glance for launches this week', required: true, section: 'run' },
    ],
    disposition: SHARED_DISPOSITION,
  },
  {
    slug: 'mon-ops-planning',
    title: 'Mon Ops Planning — Launch + Systems',
    theme: 'OB board + system gaps + week priorities',
    call_type: 'team_meeting',
    weekdays: [1],
    default_time: '10:30',
    duration_min: 60,
    host_role: 'ceo',
    attendee_roles: ['ceo', 'client_success', 'media_buyer'],
    agenda_md:
      'PLACEHOLDER — fill from Q3 restructure.\n\nIn: OB board, system gaps CEO owns, week priorities.\nOut: ad creative debates, dial coaching.',
    checklist: [
      { key: 'ob_board_walked', label: 'OB board walked', required: true, section: 'run' },
      { key: 'system_gaps_listed', label: 'System gaps listed', required: true, section: 'run' },
      { key: 'week_priorities_set', label: 'Week priorities set', required: true, section: 'run' },
    ],
    disposition: SHARED_DISPOSITION,
  },
  {
    slug: 'thu-kpi-commitment-check',
    title: 'Thu KPI — Commitment Check',
    theme: 'Did Mon actions land?',
    call_type: 'team_meeting',
    weekdays: [4],
    default_time: '10:00',
    duration_min: 25,
    host_role: 'client_success',
    attendee_roles: ['client_success', 'media_buyer', 'ccm'],
    agenda_md:
      'PLACEHOLDER — fill from Q3 restructure.\n\nIn: open commitments only, re-commit reds, Fri Q&A remind.\nOut: full book re-scan.',
    checklist: [
      { key: 'commitments_checked', label: 'Open commitments checked', required: true, section: 'run' },
      { key: 'still_red_recommitted', label: 'Still-red items re-committed', required: true, section: 'run' },
      { key: 'fri_qa_reminded', label: 'Fri Q&A intake reminded', required: true, section: 'run' },
    ],
    disposition: SHARED_DISPOSITION,
  },
  {
    slug: 'fri-exec-qa',
    title: 'Fri Exec Q&A — Decisions Only',
    theme: 'Decide / defer / kill',
    call_type: 'team_review',
    weekdays: [5],
    default_time: '16:00',
    duration_min: 40,
    host_role: 'ceo',
    attendee_roles: ['ceo', 'client_success', 'media_buyer', 'ccm'],
    agenda_md:
      'PLACEHOLDER — fill from Q3 restructure.\n\nIn: pre-submitted questions → decide / defer / kill.\nOut: KPI status theater.',
    checklist: [
      { key: 'questions_from_intake', label: 'Questions from Thu intake only', required: true, section: 'run' },
      {
        key: 'each_item_decided_or_deferred',
        label: 'Each item decided or deferred',
        required: true,
        section: 'run',
      },
    ],
    disposition: SHARED_DISPOSITION,
  },
];

export function weekdaysForTemplate(template: { weekdays: number[] }): number[] {
  if (!template.weekdays || template.weekdays.length === 0) return [1, 2, 3, 4, 5];
  return [...template.weekdays];
}

export function parseDefaultTime(defaultTime: string): { hour: number; minute: number } {
  const parts = defaultTime.trim().split(':');
  const hour = Number(parts[0]);
  const minute = Number(parts[1] ?? 0);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    throw new Error(`Invalid default_time: ${defaultTime}`);
  }
  return { hour, minute };
}

/** ISO weekday 1=Mon … 7=Sun for a Y-M-D calendar date (UTC noon probe). */
export function isoWeekdayForYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = utc.getUTCDay(); // 0=Sun
  return dow === 0 ? 7 : dow;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function eachYmdInclusive(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  while (cur <= toYmd) {
    out.push(cur);
    cur = addDaysYmd(cur, 1);
  }
  return out;
}

/**
 * Planned UTC instants for a template across [fromYmd, toYmd] inclusive,
 * interpreting default_time in `timeZone` (default CALL_CENTER_TIMEZONE).
 */
export function plannedSlotsForRange(
  template: Pick<TeamMeetingSeed, 'weekdays' | 'default_time'>,
  fromYmd: string,
  toYmd: string,
  timeZone: string = CALL_CENTER_TIMEZONE,
): Date[] {
  const days = weekdaysForTemplate(template);
  const { hour, minute } = parseDefaultTime(template.default_time);
  const slots: Date[] = [];
  for (const ymd of eachYmdInclusive(fromYmd, toYmd)) {
    const wd = isoWeekdayForYmd(ymd);
    if (!days.includes(wd)) continue;
    const [y, m, d] = ymd.split('-').map(Number);
    slots.push(zonedWallTimeToUtc(y, m, d, hour, minute, 0, timeZone));
  }
  return slots;
}

export type CompletePayloadInput = {
  status: 'completed' | 'skipped';
  checklist: ChecklistItemDef[];
  checklist_state: Record<string, unknown>;
  responses: Record<string, unknown>;
  recording_url?: string | null;
};

export type ValidationResult =
  | { ok: true }
  | { ok: false; missing: string[]; message: string };

function truthyCheck(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function textValue(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

export function validateCompletePayload(input: CompletePayloadInput): ValidationResult {
  const missing: string[] = [];

  if (input.status === 'skipped') {
    if (!textValue(input.responses.skipped_reason)) missing.push('skipped_reason');
    if (missing.length) {
      return { ok: false, missing, message: 'Skip reason is required' };
    }
    return { ok: true };
  }

  for (const item of input.checklist) {
    if (!item.required) continue;
    if (!truthyCheck(input.checklist_state[item.key])) missing.push(item.key);
  }

  if (!textValue(input.responses.summary)) missing.push('summary');
  if (!textValue(input.responses.participants_present)) missing.push('participants_present');

  const recording =
    textValue(input.recording_url) || textValue(input.responses.recording_url);
  if (!recording) missing.push('recording_url');

  if (missing.length) {
    return {
      ok: false,
      missing,
      message: `Missing required: ${missing.join(', ')}`,
    };
  }
  return { ok: true };
}

export function templateRowFromSeed(seed: TeamMeetingSeed) {
  return {
    slug: seed.slug,
    title: seed.title,
    theme: seed.theme,
    call_type: seed.call_type,
    weekdays: seed.weekdays,
    default_time: seed.default_time.length === 5 ? `${seed.default_time}:00` : seed.default_time,
    duration_min: seed.duration_min,
    host_role: seed.host_role,
    attendee_roles: seed.attendee_roles,
    agenda_md: seed.agenda_md,
    checklist: seed.checklist,
    disposition: seed.disposition,
    active: true,
    updated_at: new Date().toISOString(),
  };
}

export type TeamMeetingTemplateRow = {
  id: string;
  slug: string;
  title: string;
  theme: string;
  call_type: string;
  weekdays: number[];
  default_time: string;
  duration_min: number;
  host_role: string;
  attendee_roles: string[];
  agenda_md: string;
  checklist: ChecklistItemDef[];
  disposition: DispositionFieldDef[];
  active: boolean;
};

export type TeamMeetingInstanceRow = {
  id: string;
  template_id: string;
  scheduled_at: string;
  status: TeamMeetingStatus;
  host_agent_id: string | null;
  checklist_state: Record<string, boolean>;
  responses: Record<string, unknown>;
  recording_url: string | null;
  notes: string | null;
  team_call_id: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamMeetingInstanceView = TeamMeetingInstanceRow & {
  template: Pick<
    TeamMeetingTemplateRow,
    | 'slug'
    | 'title'
    | 'theme'
    | 'call_type'
    | 'host_role'
    | 'checklist'
    | 'disposition'
    | 'agenda_md'
    | 'duration_min'
  >;
};

export function parseChecklist(raw: unknown): ChecklistItemDef[] {
  if (!Array.isArray(raw)) return [];
  const out: ChecklistItemDef[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.key !== 'string' || typeof o.label !== 'string') continue;
    out.push({
      key: o.key,
      label: o.label,
      required: o.required !== false,
      ...(typeof o.section === 'string' ? { section: o.section } : {}),
    });
  }
  return out;
}

/** Local Y-M-D in CALL_CENTER_TIMEZONE for "now". */
export function todayYmdInCallCenterTz(
  now: Date = new Date(),
  timeZone: string = CALL_CENTER_TIMEZONE,
): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA → YYYY-MM-DD
  return dtf.format(now);
}

export function addDaysToYmd(ymd: string, days: number): string {
  return addDaysYmd(ymd, days);
}

export { CALL_CENTER_TIMEZONE };
