/**
 * Unified Team Command access — one hub, three seat lenses.
 * Anyone who can open the hub may load any seat payload (toggle to peer plates).
 * Default seat is derived from linked agents.pay_type.
 */

import { hasPermission, type PermissionSubject } from '@/lib/permissions';
import type { TeamDashboardTab } from '@/lib/nav';
import type { EmployeePosition } from '@/lib/employee-positions';

export const TEAM_COMMAND_PERMISSION_KEYS = [
  'team_dashboard',
  'team_dashboard_ccm',
  'team_dashboard_media',
  'ops_overview',
  'client_health',
] as const;

/** Seats that get a role home on Team Command. */
export const TEAM_COMMAND_HOME_PAY_TYPES = [
  'ccm',
  'media_buyer',
  'client_success',
  'operations',
] as const;

export type TeamCommandHomePayType = (typeof TEAM_COMMAND_HOME_PAY_TYPES)[number];

export function defaultSeatForPayType(
  payType: string | null | undefined,
): TeamDashboardTab | null {
  switch (payType) {
    case 'ccm':
      return 'ccm';
    case 'media_buyer':
      return 'media';
    case 'client_success':
    case 'operations':
      return 'cs';
    default:
      return null;
  }
}

export function isTeamCommandHomePayType(
  payType: string | null | undefined,
): payType is TeamCommandHomePayType {
  return (
    !!payType &&
    (TEAM_COMMAND_HOME_PAY_TYPES as readonly string[]).includes(payType)
  );
}

/** True if profile permissions or ownership open Team Command. */
export function hasTeamCommandPermission(subject: PermissionSubject): boolean {
  if (subject.isOwner) return true;
  return TEAM_COMMAND_PERMISSION_KEYS.some(key => hasPermission(key, subject));
}

/**
 * API gate: permission grant, admin, or linked seat that should open command.
 * Call reps / setters do not inherit command access via pay_type alone.
 */
export function canAccessTeamCommandApi(opts: {
  isOwner: boolean;
  isAdmin: boolean;
  allowedPermissions: PermissionSubject['allowedPermissions'];
  payType?: string | null;
}): boolean {
  const subject: PermissionSubject = {
    isOwner: opts.isOwner,
    allowedPermissions: opts.allowedPermissions,
  };
  if (opts.isAdmin || hasTeamCommandPermission(subject)) return true;
  return isTeamCommandHomePayType(opts.payType ?? null);
}

export function seatLabel(seat: TeamDashboardTab): string {
  switch (seat) {
    case 'cs':
      return 'CS';
    case 'ccm':
      return 'CCM';
    case 'media':
      return 'Media Buyer';
  }
}

export function seatSubtitle(seat: TeamDashboardTab): string {
  switch (seat) {
    case 'cs':
      return 'Follow-ups · live calls · day priorities · EOD';
    case 'ccm':
      return 'Floor pace · under-KPI dial focus · day playbook';
    case 'media':
      return 'Launch checks · reflections · ad KPI reds';
  }
}

export type LinkedSeatMeta = {
  payType: EmployeePosition | string | null;
  defaultSeat: TeamDashboardTab | null;
};
