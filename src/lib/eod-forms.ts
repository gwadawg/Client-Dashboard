/**
 * EOD form schemas — shared shell + department custom fields.
 * Stored in eod_form_submissions.responses JSONB.
 */

import type { EmployeePosition } from './employee-positions';

export const EOD_DEPARTMENTS = ['media_buyer', 'client_success', 'ccm'] as const;
export type EodDepartment = (typeof EOD_DEPARTMENTS)[number];

export const EOD_DEPARTMENT_LABELS: Record<EodDepartment, string> = {
  media_buyer: 'Media Buyer / Ops',
  client_success: 'Client Success',
  ccm: 'Call Center Manager',
};

export const EOD_DEPARTMENT_SLUGS: Record<EodDepartment, string> = {
  media_buyer: 'media-buyer',
  client_success: 'client-success',
  ccm: 'ccm',
};

export const EOD_SLUG_TO_DEPARTMENT: Record<string, EodDepartment> = {
  'media-buyer': 'media_buyer',
  'client-success': 'client_success',
  ccm: 'ccm',
};

/** Positions eligible to submit each department form. */
export const EOD_DEPARTMENT_POSITIONS: Record<EodDepartment, EmployeePosition[]> = {
  media_buyer: ['media_buyer', 'operations'],
  client_success: ['client_success'],
  ccm: ['ccm'],
};

export function isEodDepartment(v: string | null | undefined): v is EodDepartment {
  return !!v && (EOD_DEPARTMENTS as readonly string[]).includes(v);
}

export function eodFormHref(department: EodDepartment): string {
  return `/forms/eod/${EOD_DEPARTMENT_SLUGS[department]}`;
}

export function departmentForPosition(position: EmployeePosition): EodDepartment | null {
  for (const dept of EOD_DEPARTMENTS) {
    if (EOD_DEPARTMENT_POSITIONS[dept].includes(position)) return dept;
  }
  return null;
}

// ── Shared responses ──────────────────────────────────────────────────────────

export type EodSharedResponses = {
  accomplishments: string[];
  unfinished: string[];
  tomorrow_priorities: string;
  productivity_rating: number;
  /** @deprecated No longer collected on EOD forms; kept for legacy submissions. */
  done_for_day?: boolean;
  done_for_day_note?: string;
};

// ── Department custom ─────────────────────────────────────────────────────────

export type MediaBuyerEodCustom = {
  /** Checked accounts launched in the last 3 days for healthy delivery. */
  recent_launches_checked: boolean;
  recent_launches_notes: string;
  /** On track to onboard / launch clients on schedule. */
  ob_on_schedule: boolean;
  ob_on_schedule_notes: string;
};

export type ClientSuccessEodCustom = {
  slack_channels_cleared: boolean;
  slack_channels_notes: string;
  open_bugs_without_update: boolean;
  open_bugs_notes: string;
  fresh_launch_spot_check: boolean;
  fresh_launch_spot_check_notes: string;
};

/** Reasons when dial / booking targets were not hit (CCM EOD). */
export const CCM_DIAL_TARGETS_MISS_REASONS = [
  'Low dial volume / setters under pace',
  'Dials on pace — booking conversion miss',
  'Lead volume / quality shortfall',
  'Stack / tech outage (AI / HP / GHL / dialer)',
  'Attendance / coverage gap',
  'Other',
] as const;

export type CcmDialTargetsMissReason = (typeof CCM_DIAL_TARGETS_MISS_REASONS)[number];

export type CcmEodCustom = {
  training_ran: boolean;
  coaching_focus: string;
  setters_on_time: boolean;
  attendance_notes: string;
  /** Whether dial / booking targets were hit today. */
  dial_targets_hit: boolean;
  /** Required when dial_targets_hit is false. */
  dial_targets_miss_reason: string;
  under_kpi_coverage: boolean;
  under_kpi_notes: string;
  stack_bugs_status: string;
  slack_channels_cleared: boolean;
  slack_channels_notes: string;
};

export type EodCustomByDept = {
  media_buyer: MediaBuyerEodCustom;
  client_success: ClientSuccessEodCustom;
  ccm: CcmEodCustom;
};

export type EodResponses = EodSharedResponses & Record<string, unknown>;

export type EodFormSubmission = {
  id: string;
  agent_id: string;
  department: EodDepartment;
  work_date: string;
  status: 'draft' | 'submitted';
  submitted_by_user_id: string | null;
  submitted_by_label: string | null;
  responses: EodResponses;
  submitted_at: string;
  updated_at: string;
};

export type EodFormSubmissionWithAgent = EodFormSubmission & {
  agent_name?: string | null;
};

const FIELD_LABELS: Record<string, string> = {
  accomplishments: 'What got done today',
  unfinished: "What wasn't finished",
  tomorrow_priorities: "Tomorrow's top priorities",
  productivity_rating: 'Productivity (1–10)',
  done_for_day: 'Done-for-day self-cert',
  done_for_day_note: 'Done-for-day note',
  // Media buyer / ops
  recent_launches_checked: 'Checked last-3-day launches (running smoothly)',
  recent_launches_notes: 'Recent launches notes',
  ob_on_schedule: 'On track to OB clients on schedule',
  ob_on_schedule_notes: 'OB schedule notes',
  // Client success
  slack_channels_cleared: 'Slack channels checked — no clients left on read',
  slack_channels_notes: 'Slack / unread notes',
  open_bugs_without_update: 'Bugs/problems still waiting on a team update',
  open_bugs_notes: 'Open bugs / problems notes',
  fresh_launch_spot_check: 'Spot-checked fresh launches (dials / HP / AI)',
  fresh_launch_spot_check_notes: 'Fresh launch spot-check notes',
  // CCM
  training_ran: 'Daily training ran',
  coaching_focus: 'One coaching focus',
  setters_on_time: 'Setters on time (or handled same day)',
  attendance_notes: 'Attendance notes',
  dial_targets_hit: 'Dial / booking targets hit',
  dial_targets_miss_reason: 'Why dial / booking targets were missed',
  /** @deprecated legacy free-text field; prefer dial_targets_hit */
  dial_targets_vs_hit: 'Dial / booking targets vs hit',
  under_kpi_coverage: 'Under-KPI dial coverage scheduled',
  under_kpi_notes: 'Under-KPI notes',
  stack_bugs_status: 'Stack bugs (owner + ETA or escalated)',
};

function cleanStringList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => String(x ?? '').trim()).filter(Boolean);
}

function asBool(v: unknown, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true' || v === 'yes' || v === '1') return true;
  if (v === 'false' || v === 'no' || v === '0') return false;
  return fallback;
}

function asRating(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  if (r < 1 || r > 10) return null;
  return r;
}

export function validateSharedResponses(raw: Record<string, unknown>): {
  ok: true;
  shared: EodSharedResponses;
} | { ok: false; error: string } {
  const accomplishments = cleanStringList(raw.accomplishments);
  if (accomplishments.length === 0) {
    return { ok: false, error: 'Add at least one thing you got done today.' };
  }
  const unfinished = cleanStringList(raw.unfinished);
  const tomorrow_priorities = String(raw.tomorrow_priorities ?? '').trim();
  if (!tomorrow_priorities) {
    return { ok: false, error: "Tomorrow's top priorities are required." };
  }
  const productivity_rating = asRating(raw.productivity_rating);
  if (productivity_rating == null) {
    return { ok: false, error: 'Productivity rating must be 1–10.' };
  }
  return {
    ok: true,
    shared: {
      accomplishments,
      unfinished,
      tomorrow_priorities,
      productivity_rating,
    },
  };
}

export function validateDepartmentCustom(
  department: EodDepartment,
  raw: Record<string, unknown>
): { ok: true; custom: Record<string, unknown> } | { ok: false; error: string } {
  if (department === 'media_buyer') {
    const recent_launches_checked = asBool(raw.recent_launches_checked);
    const recent_launches_notes = String(raw.recent_launches_notes ?? '').trim();
    const ob_on_schedule = asBool(raw.ob_on_schedule);
    const ob_on_schedule_notes = String(raw.ob_on_schedule_notes ?? '').trim();
    if (!recent_launches_checked && !recent_launches_notes) {
      return {
        ok: false,
        error: 'If last-3-day launches were not checked (or not smooth), add a short note.',
      };
    }
    if (!ob_on_schedule && !ob_on_schedule_notes) {
      return {
        ok: false,
        error: 'If OB is not on schedule, add what is slipping and the next step.',
      };
    }
    const custom: MediaBuyerEodCustom = {
      recent_launches_checked,
      recent_launches_notes,
      ob_on_schedule,
      ob_on_schedule_notes,
    };
    return { ok: true, custom };
  }

  if (department === 'client_success') {
    const slack_channels_cleared = asBool(raw.slack_channels_cleared);
    const slack_channels_notes = String(raw.slack_channels_notes ?? '').trim();
    const open_bugs_without_update = asBool(raw.open_bugs_without_update);
    const open_bugs_notes = String(raw.open_bugs_notes ?? '').trim();
    const fresh_launch_spot_check = asBool(raw.fresh_launch_spot_check);
    const fresh_launch_spot_check_notes = String(raw.fresh_launch_spot_check_notes ?? '').trim();

    if (!slack_channels_cleared && !slack_channels_notes) {
      return {
        ok: false,
        error: 'If Slack was not fully cleared, note which clients/channels still need a reply.',
      };
    }
    if (open_bugs_without_update && !open_bugs_notes) {
      return {
        ok: false,
        error: 'List the bugs/problems still waiting on a team update (and who owns them if known).',
      };
    }
    if (!fresh_launch_spot_check && !fresh_launch_spot_check_notes) {
      return {
        ok: false,
        error: 'If fresh launches were not spot-checked (or something looked off), add a short note.',
      };
    }

    const custom: ClientSuccessEodCustom = {
      slack_channels_cleared,
      slack_channels_notes,
      open_bugs_without_update,
      open_bugs_notes,
      fresh_launch_spot_check,
      fresh_launch_spot_check_notes,
    };
    return { ok: true, custom };
  }

  // ccm
  const setters_on_time = asBool(raw.setters_on_time);
  const attendance_notes = String(raw.attendance_notes ?? '').trim();
  const dial_targets_hit = asBool(raw.dial_targets_hit, true);
  const dial_targets_miss_reason = String(raw.dial_targets_miss_reason ?? '').trim();
  const slack_channels_cleared = asBool(raw.slack_channels_cleared, true);
  const slack_channels_notes = String(raw.slack_channels_notes ?? '').trim();
  const custom: CcmEodCustom = {
    training_ran: asBool(raw.training_ran),
    coaching_focus: String(raw.coaching_focus ?? '').trim(),
    setters_on_time,
    attendance_notes: setters_on_time ? '' : attendance_notes,
    dial_targets_hit,
    dial_targets_miss_reason: dial_targets_hit ? '' : dial_targets_miss_reason,
    under_kpi_coverage: asBool(raw.under_kpi_coverage),
    under_kpi_notes: String(raw.under_kpi_notes ?? '').trim(),
    stack_bugs_status: String(raw.stack_bugs_status ?? '').trim(),
    slack_channels_cleared,
    slack_channels_notes: slack_channels_cleared ? '' : slack_channels_notes,
  };
  if (custom.training_ran && !custom.coaching_focus) {
    return { ok: false, error: 'Training ran — name the one coaching focus.' };
  }
  if (!custom.setters_on_time && !custom.attendance_notes) {
    return { ok: false, error: 'Setters were not on time — add attendance notes.' };
  }
  if (!custom.dial_targets_hit && !custom.dial_targets_miss_reason) {
    return { ok: false, error: 'Dial / booking targets missed — pick an explanation.' };
  }
  if (
    !custom.dial_targets_hit &&
    !(CCM_DIAL_TARGETS_MISS_REASONS as readonly string[]).includes(custom.dial_targets_miss_reason)
  ) {
    return { ok: false, error: 'Pick a valid dial / booking miss reason from the list.' };
  }
  if (!custom.under_kpi_coverage && !custom.under_kpi_notes) {
    return {
      ok: false,
      error: 'If under-KPI coverage is not in place, note which accounts and the plan.',
    };
  }
  if (!custom.stack_bugs_status) {
    return { ok: false, error: 'Note stack bug status (fixed / owner+ETA / escalated / none).' };
  }
  if (!custom.slack_channels_cleared && !custom.slack_channels_notes) {
    return {
      ok: false,
      error: 'If Slack was not fully cleared, note which clients/channels still need a reply.',
    };
  }
  return { ok: true, custom };
}

export function formatEodValue(key: string, value: unknown): string {
  if (value == null || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    const items = value.map(x => String(x ?? '').trim()).filter(Boolean);
    return items.length ? items.map((x, i) => `${i + 1}. ${x}`).join('\n') : '—';
  }
  return String(value);
}

export function humanizeEodResponses(
  department: EodDepartment,
  responses: Record<string, unknown>
): { label: string; value: string; section?: string }[] {
  const sharedKeys = [
    'accomplishments',
    'unfinished',
    'tomorrow_priorities',
    'productivity_rating',
    'done_for_day',
    'done_for_day_note',
  ];
  const deptKeys: Record<EodDepartment, string[]> = {
    media_buyer: [
      'recent_launches_checked',
      'recent_launches_notes',
      'ob_on_schedule',
      'ob_on_schedule_notes',
    ],
    client_success: [
      'slack_channels_cleared',
      'slack_channels_notes',
      'open_bugs_without_update',
      'open_bugs_notes',
      'fresh_launch_spot_check',
      'fresh_launch_spot_check_notes',
    ],
    ccm: [
      'training_ran',
      'coaching_focus',
      'setters_on_time',
      'attendance_notes',
      'dial_targets_hit',
      'dial_targets_miss_reason',
      // Legacy free-text submissions before Yes/No + reason
      'dial_targets_vs_hit',
      'under_kpi_coverage',
      'under_kpi_notes',
      'stack_bugs_status',
      'slack_channels_cleared',
      'slack_channels_notes',
    ],
  };

  const rows: { label: string; value: string; section?: string }[] = [];
  rows.push({ label: 'Shared', value: '', section: 'Shared' });
  for (const key of sharedKeys) {
    if (responses[key] == null || responses[key] === '') continue;
    rows.push({
      label: FIELD_LABELS[key] ?? key,
      value: formatEodValue(key, responses[key]),
      section: 'Shared',
    });
  }
  const deptLabel = EOD_DEPARTMENT_LABELS[department];
  rows.push({ label: deptLabel, value: '', section: deptLabel });
  for (const key of deptKeys[department]) {
    if (responses[key] == null || responses[key] === '') continue;
    // Prefer new boolean field; skip legacy free-text when both present
    if (
      key === 'dial_targets_vs_hit' &&
      (typeof responses.dial_targets_hit === 'boolean' || responses.dial_targets_hit != null)
    ) {
      continue;
    }
    rows.push({
      label: FIELD_LABELS[key] ?? key,
      value: formatEodValue(key, responses[key]),
      section: deptLabel,
    });
  }
  return rows;
}

export const EOD_SELECT = `
  id, agent_id, department, work_date, status,
  submitted_by_user_id, submitted_by_label, responses,
  submitted_at, updated_at
`.replace(/\s+/g, ' ').trim();
