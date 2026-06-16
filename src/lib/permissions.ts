// Central permission registry — the single source of truth for what a user can
// be granted or denied. Permissions are strictly views (sidebar tabs), derived
// from the nav registry. The dashboard sidebar, the permissions editor, and
// server-side enforcement all read from here, so adding a NAV row automatically
// creates a grantable tab permission everywhere.

import { NAV, NAV_GROUPS, type View } from "./nav";

// A single grantable tab. `key` is what gets stored in a user's
// allowed_permissions array and equals the nav `view` key.
export type PermissionDef = {
  key: string;
  label: string;
  group: string;
  view: View;
};

// View permissions are derived from the nav registry, so adding a NAV row
// automatically creates a grantable permission.
export const VIEW_PERMISSIONS: PermissionDef[] = NAV.map(item => ({
  key: item.view,
  label: item.label,
  group: item.group,
  view: item.view,
}));

// Capabilities are not sidebar tabs — extra gates for sensitive data/actions.
// Unlike tab permissions, these are never implied by allowed_permissions = null;
// each must be explicitly granted (the owner always passes every check).
export const CAPABILITY_PERMISSIONS: PermissionDef[] = [
  {
    key: "view_client_revenue",
    label: "View client revenue & billing totals",
    group: "Admin",
    view: "admin_clients",
  },
];

export const ALL_PERMISSIONS: PermissionDef[] = [...VIEW_PERMISSIONS, ...CAPABILITY_PERMISSIONS];

export const ALL_PERMISSION_KEYS: string[] = ALL_PERMISSIONS.map(p => p.key);

// Group ordering for the editor follows the canonical nav group order.
export const PERMISSION_GROUPS: string[] = NAV_GROUPS.filter(g =>
  VIEW_PERMISSIONS.some(p => p.group === g),
);

// A user's granted set. `null` means "no restriction" (unrestricted) which keeps
// the owner and brand-new/unconfigured users working with full access.
export type AllowedPermissions = string[] | null;

// The minimal identity needed to resolve any permission check. Only the owner
// bypasses restrictions; admins are subject to whatever the owner grants them.
export type PermissionSubject = {
  isOwner: boolean;
  allowedPermissions: AllowedPermissions;
};

// The single, canonical permission check used by both client and server.
export function hasPermission(key: string, subject: PermissionSubject): boolean {
  if (subject.isOwner) return true;
  if (subject.allowedPermissions === null) return true;
  return subject.allowedPermissions.includes(key);
}

const ADMIN_TAB_KEYS = VIEW_PERMISSIONS.filter(p => p.group === 'Admin').map(p => p.key);

/** Automations tab + API — explicit grant, or any existing Admin tab permission. */
export function canAccessAutomations(subject: PermissionSubject): boolean {
  if (hasPermission('admin_automations', subject)) return true;
  if (subject.isOwner || subject.allowedPermissions === null) return true;
  return ADMIN_TAB_KEYS.some(key => subject.allowedPermissions!.includes(key));
}

/** Grant keys (legacy `view_client_total_paid` still honored). */
export const CLIENT_REVENUE_PERMISSION_KEYS = ['view_client_revenue', 'view_client_total_paid'] as const;

/** Sensitive revenue data — owner only unless explicitly granted. */
export function canViewClientRevenue(subject: PermissionSubject): boolean {
  if (subject.isOwner) return true;
  if (!Array.isArray(subject.allowedPermissions)) return false;
  return subject.allowedPermissions.some(k =>
    (CLIENT_REVENUE_PERMISSION_KEYS as readonly string[]).includes(k),
  );
}

/** @deprecated use canViewClientRevenue */
export const canViewClientTotalPaid = canViewClientRevenue;

// Keep only valid, de-duplicated permission keys (or null for "no restriction").
export function sanitizeAllowedPermissions(input: unknown): AllowedPermissions {
  if (input === null) return null;
  if (!Array.isArray(input)) return null;
  const valid = new Set([...ALL_PERMISSION_KEYS, 'view_client_total_paid']);
  return Array.from(new Set(input.filter((v): v is string => typeof v === "string" && valid.has(v))));
}
