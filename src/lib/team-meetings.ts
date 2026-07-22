/**
 * Team meeting runbooks — Q3 cadence templates, São Paulo scheduling,
 * checklist / disposition validation, complete → team_calls mapping.
 *
 * Cadence copy (agenda_md, checklist labels) is intentionally placeholder;
 * fill later from Wm-os SOPs without changing keys.
 */

import {
  CALL_CENTER_TIMEZONE,
  todayYmdInCallCenterTz,
  zonedWallTimeToUtc,
} from './time';
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
  /** Resource Library slugs opened from the runbook UI (not stored on template row). */
  library_slugs?: string[];
};

export const SHARED_DISPOSITION: DispositionFieldDef[] = [
  { key: 'recording_url', label: 'Recording URL', required: true, type: 'url' },
  { key: 'summary', label: 'Summary', required: true, type: 'textarea' },
  { key: 'participants_present', label: 'Who attended', required: true, type: 'text' },
  { key: 'follow_ups', label: 'Follow-ups', required: false, type: 'textarea' },
  { key: 'skipped_reason', label: 'Skip reason', required: false, type: 'textarea' },
];

/** Seed templates — agenda/checklist copy can be refined as SOPs land. */
export const TEAM_MEETING_SEED: TeamMeetingSeed[] = [
  {
    slug: 'mon-setter-weekly-review',
    title: 'Mon Setter Weekly Review',
    theme: 'Last week + this week · account focus · dial plan · watch shifts',
    call_type: 'team_review',
    weekdays: [1],
    default_time: '09:00',
    duration_min: 30,
    host_role: 'ccm',
    attendee_roles: ['ccm', 'call_rep'],
    agenda_md: [
      'Monday floor catch-up (CCM + setters).',
      '',
      'In:',
      '1. Last week — dials / bookings / show vs targets; what landed, what slipped.',
      '2. This week — progress to date and the plan for the rest of the week.',
      '3. Account focus — which logos need dial coverage / under-KPI attention.',
      '4. Week schedule — which days each setter works which accounts / blocks.',
      '5. Watch shift schedule — who owns watch for the week (days + slots).',
      '',
      'Out: deep stack rebuild, creative debates, Mon KPI leadership status (that is Laura’s meeting).',
    ].join('\n'),
    checklist: [
      {
        key: 'last_week_reviewed',
        label: 'Last week numbers / outcomes reviewed with the team',
        required: true,
        section: 'review',
      },
      {
        key: 'this_week_plan_set',
        label: 'This week plan and progress catch-up completed',
        required: true,
        section: 'review',
      },
      {
        key: 'account_focus_named',
        label: 'Priority accounts for dial focus named',
        required: true,
        section: 'schedule',
      },
      {
        key: 'week_day_plan_set',
        label: 'Week scheduled — which days do what / which accounts',
        required: true,
        section: 'schedule',
      },
      {
        key: 'watch_shift_scheduled',
        label: 'Watch shift schedule set for the week',
        required: true,
        section: 'schedule',
      },
    ],
    disposition: SHARED_DISPOSITION,
  },
  {
    slug: 'daily-setter-training',
    title: 'Daily Setter Training',
    theme: 'Numbers → one focus → dial targets',
    call_type: 'training',
    // Tue–Fri only; Monday is Mon Setter Weekly Review
    weekdays: [2, 3, 4, 5],
    default_time: '09:00',
    duration_min: 20,
    host_role: 'ccm',
    attendee_roles: ['ccm', 'call_rep'],
    agenda_md:
      'Tue–Fri floor training (CCM + setters).\n\nIn: numbers, one coaching focus, today dial targets / accounts.\nOut: deep stack rebuild, creative debates. Monday weekly review is a separate runbook.',
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
    agenda_md: [
      'Monday KPI — Week Plan (Client Success hosts).',
      '',
      'In:',
      '1. Rules (60s) — one primary constraint per red; owners speak only on their reds; no creative debates.',
      '2. R/Y/G scan — Act now + Below KPI from the app.',
      '3. Per red — confirm north-star miss → system vs quality fork → capture in Commitments panel.',
      '4. OB glance — launches this week only.',
      '',
      'Commitments panel: one row per red (Why + constraint + plan + owner + due). Toggle Needs Founder when Ops must approve.',
      '',
      'Out: creative debates, Founder status theater, deep coaching, full diagnostic workshop.',
      '',
      'SOP: /library/kpi-review-meeting-sop · Ladder: /library/under-kpi-diagnosis-ladder',
    ].join('\n'),
    checklist: [
      { key: 'ryg_scan_done', label: 'R/Y/G scan done', required: true, section: 'run' },
      { key: 'reds_have_owners', label: 'Reds have role owners', required: true, section: 'run' },
      {
        key: 'commitments_named',
        label: 'Commitments logged in panel (Why + plan + due)',
        required: true,
        section: 'run',
      },
      { key: 'ob_glance', label: 'OB glance for launches this week', required: true, section: 'run' },
    ],
    disposition: SHARED_DISPOSITION,
    library_slugs: ['kpi-review-meeting-sop', 'under-kpi-diagnosis-ladder'],
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
    agenda_md: [
      'Monday Ops Planning — Launch + Systems (CEO hosts).',
      '',
      'In:',
      '1. Needs Founder — approve / reject / clarify KPI commitments flagged for Founder (GHL, DATA_HOLD, 911 asks).',
      '2. OB board — launches and gate risk this week.',
      '3. System gaps — CEO-owned infra / tooling blockers.',
      '4. Week priorities — named outcomes for the leadership seats.',
      '',
      'Out: ad creative debates, dial coaching, full KPI status theater (that is Mon/Thu KPI).',
      '',
      'Empty Needs Founder queue = success.',
    ].join('\n'),
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
    agenda_md: [
      'Thursday KPI — Commitment Check (Client Success hosts).',
      '',
      'In:',
      '1. Open commitments panel only — no full book re-scan.',
      '2. Each item: landed / blocked / missed.',
      '3. Still red → re-commit (edit plan / due) or escalate to Fri Q&A intake.',
      '4. Remind Thu EOD questions for Fri Exec Q&A (decisions only).',
      '',
      'Out: re-scanning the whole book, creative debates, inventing status for Founder.',
      '',
      'SOP: /library/kpi-review-meeting-sop · Ladder: /library/under-kpi-diagnosis-ladder',
    ].join('\n'),
    checklist: [
      { key: 'commitments_checked', label: 'Open commitments checked', required: true, section: 'run' },
      { key: 'still_red_recommitted', label: 'Still-red items re-committed', required: true, section: 'run' },
      { key: 'fri_qa_reminded', label: 'Fri Q&A intake reminded', required: true, section: 'run' },
    ],
    disposition: SHARED_DISPOSITION,
    library_slugs: ['kpi-review-meeting-sop', 'under-kpi-diagnosis-ladder'],
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

/** Library SOP links for a template slug (from seed; not stored on DB row). */
export function librarySlugsForTemplate(slug: string): string[] {
  return TEAM_MEETING_SEED.find(s => s.slug === slug)?.library_slugs ?? [];
}

export const LIBRARY_SOP_LINK_LABELS: Record<string, string> = {
  'kpi-review-meeting-sop': 'Open meeting SOP',
  'under-kpi-diagnosis-ladder': 'Diagnosis ladder',
};

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

export function addDaysToYmd(ymd: string, days: number): string {
  return addDaysYmd(ymd, days);
}

export { CALL_CENTER_TIMEZONE, todayYmdInCallCenterTz };
