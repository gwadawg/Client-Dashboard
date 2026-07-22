/**
 * Meeting commitments — status transitions + week filters for Mon/Thu KPI
 * and Ops Needs Founder. Spec: Wm-os 2026-07-22-kpi-meeting-commitments-design.
 */

export type MeetingCommitmentSeverity = '911' | 'below';
export type MeetingCommitmentConstraintType = 'system' | 'quality' | 'data';
export type MeetingCommitmentOwnerRole =
  | 'client_success'
  | 'media_buyer'
  | 'ccm'
  | 'ops'
  | 'founder';

export type MeetingCommitmentStatus =
  | 'proposed'
  | 'approved'
  | 'rejected'
  | 'needs_clarification'
  | 'in_progress'
  | 'landed'
  | 'blocked'
  | 'missed'
  | 'cancelled';

export type MeetingCommitment = {
  id: string;
  client_id: string;
  severity: MeetingCommitmentSeverity;
  why: string;
  constraint_type: MeetingCommitmentConstraintType;
  constraint_label: string;
  plan: string;
  owner_role: MeetingCommitmentOwnerRole;
  due_date: string;
  needs_founder: boolean;
  founder_ask: string | null;
  status: MeetingCommitmentStatus;
  success_signal: string;
  origin_meeting_id: string | null;
  approved_in_meeting_id: string | null;
  last_touched_meeting_id: string | null;
  clickup_url: string | null;
  founder_note: string | null;
  check_note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  client_name?: string | null;
};

export const MEETING_COMMITMENT_STATUSES: MeetingCommitmentStatus[] = [
  'proposed',
  'approved',
  'rejected',
  'needs_clarification',
  'in_progress',
  'landed',
  'blocked',
  'missed',
  'cancelled',
];

export const TERMINAL_STATUSES: MeetingCommitmentStatus[] = [
  'rejected',
  'landed',
  'cancelled',
];

const BASE_TRANSITIONS: Record<MeetingCommitmentStatus, MeetingCommitmentStatus[]> = {
  proposed: ['approved', 'rejected', 'needs_clarification', 'in_progress', 'cancelled'],
  needs_clarification: ['proposed', 'approved', 'rejected', 'cancelled'],
  approved: ['in_progress', 'cancelled'],
  in_progress: ['landed', 'blocked', 'missed', 'cancelled'],
  blocked: ['in_progress', 'missed', 'cancelled'],
  missed: ['proposed', 'cancelled'],
  rejected: [],
  landed: [],
  cancelled: [],
};

const FOUNDER_ACTIONS: MeetingCommitmentStatus[] = [
  'approved',
  'rejected',
  'needs_clarification',
];

export function canTransition(
  from: MeetingCommitmentStatus,
  to: MeetingCommitmentStatus,
  opts: { needsFounder: boolean },
): { ok: true } | { ok: false; error: string } {
  if (from === to) {
    return { ok: false, error: `Already ${from}` };
  }

  const allowed = BASE_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      error: `Cannot move from ${from} to ${to}. Allowed: ${allowed.join(', ') || 'none'}`,
    };
  }

  if (FOUNDER_ACTIONS.includes(to)) {
    if (!opts.needsFounder) {
      return {
        ok: false,
        error: `${to} is only allowed when needs_founder is true`,
      };
    }
    if (from !== 'proposed' && from !== 'needs_clarification') {
      return {
        ok: false,
        error: `${to} is only allowed from proposed or needs_clarification`,
      };
    }
  }

  if (from === 'proposed' && to === 'in_progress') {
    if (opts.needsFounder) {
      return {
        ok: false,
        error: 'needs_founder items must be approved before in_progress',
      };
    }
  }

  if (opts.needsFounder && to === 'in_progress' && from !== 'approved') {
    return {
      ok: false,
      error: 'needs_founder items must be approved before in_progress',
    };
  }

  return { ok: true };
}

export function filterNeedsFounder<T extends { needs_founder: boolean; status: MeetingCommitmentStatus }>(
  rows: T[],
): T[] {
  return rows.filter(
    r =>
      r.needs_founder &&
      (r.status === 'proposed' || r.status === 'needs_clarification'),
  );
}

function ymdInRange(ymd: string, fromYmd: string, toYmd: string): boolean {
  return ymd >= fromYmd && ymd <= toYmd;
}

/** Prefer due_date; fall back to created_at (YYYY-MM-DD). */
export function commitmentWeekKey(row: {
  due_date?: string | null;
  created_at?: string | null;
}): string | null {
  if (row.due_date && /^\d{4}-\d{2}-\d{2}/.test(row.due_date)) {
    return row.due_date.slice(0, 10);
  }
  if (row.created_at) {
    const d = row.created_at.slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  }
  return null;
}

export function filterOpenForWeek<
  T extends {
    status: MeetingCommitmentStatus;
    due_date?: string | null;
    created_at?: string | null;
  },
>(rows: T[], weekStartYmd: string, weekEndYmd: string): T[] {
  return rows.filter(r => {
    if (TERMINAL_STATUSES.includes(r.status)) return false;
    const key = commitmentWeekKey(r);
    if (!key) return false;
    return ymdInRange(key, weekStartYmd, weekEndYmd);
  });
}

export type WeekBounds = { fromYmd: string; toYmd: string };

export function softDuplicateWarn<
  T extends {
    client_id: string;
    constraint_label: string;
    status: MeetingCommitmentStatus;
    due_date?: string | null;
    created_at?: string | null;
  },
>(
  rows: T[],
  clientId: string,
  constraintLabel: string,
  weekBounds: WeekBounds,
): boolean {
  const label = constraintLabel.trim().toLowerCase();
  if (!label) return false;
  return rows.some(r => {
    if (TERMINAL_STATUSES.includes(r.status)) return false;
    if (r.client_id !== clientId) return false;
    if (r.constraint_label.trim().toLowerCase() !== label) return false;
    const key = commitmentWeekKey(r);
    if (!key) return false;
    return ymdInRange(key, weekBounds.fromYmd, weekBounds.toYmd);
  });
}

export function isMeetingCommitmentStatus(v: unknown): v is MeetingCommitmentStatus {
  return typeof v === 'string' && (MEETING_COMMITMENT_STATUSES as string[]).includes(v);
}

export function commitmentModeForTemplateSlug(
  slug: string,
): 'edit' | 'check' | 'approve' | null {
  if (slug === 'mon-kpi-week-plan') return 'edit';
  if (slug === 'thu-kpi-commitment-check') return 'check';
  if (slug === 'mon-ops-planning') return 'approve';
  return null;
}
