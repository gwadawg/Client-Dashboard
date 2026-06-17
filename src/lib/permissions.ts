// Central permission registry — the single source of truth for what a user can
// be granted or denied. Permissions are strictly views (sidebar tabs), derived
// from the nav registry. Hub views accept legacy child keys for backward compatibility.

import {
  NAV,
  NAV_GROUPS,
  HUB_LEGACY_CHILDREN,
  LEGACY_PERMISSION_KEYS,
  type HubView,
  type View,
} from "./nav";

export type PermissionDef = {
  key: string;
  label: string;
  group: string;
  view: View;
};

export const VIEW_PERMISSIONS: PermissionDef[] = NAV.map(item => ({
  key: item.view,
  label: item.label,
  group: item.group,
  view: item.view,
}));

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

export const PERMISSION_GROUPS: string[] = NAV_GROUPS.filter(g =>
  VIEW_PERMISSIONS.some(p => p.group === g),
);

export type AllowedPermissions = string[] | null;

export type PermissionSubject = {
  isOwner: boolean;
  allowedPermissions: AllowedPermissions;
};

/** All keys that satisfy a permission check (hub ↔ legacy children). */
export function keysThatGrant(key: string): string[] {
  const result = new Set<string>([key]);

  const hubChildren = HUB_LEGACY_CHILDREN[key as HubView];
  if (hubChildren) {
    for (const child of hubChildren) result.add(child);
  }

  for (const [hub, children] of Object.entries(HUB_LEGACY_CHILDREN) as [HubView, string[]][]) {
    if (children.includes(key)) result.add(hub);
  }

  return [...result];
}

export function hasPermission(key: string, subject: PermissionSubject): boolean {
  if (subject.isOwner) return true;
  if (subject.allowedPermissions === null) return true;
  const grantKeys = keysThatGrant(key);
  return grantKeys.some(k => subject.allowedPermissions!.includes(k));
}

const ADMIN_TAB_KEYS = VIEW_PERMISSIONS.filter(p => p.group === "Admin").map(p => p.key);

export function canAccessAutomations(subject: PermissionSubject): boolean {
  if (hasPermission("admin_automations", subject)) return true;
  if (subject.isOwner || subject.allowedPermissions === null) return true;
  return ADMIN_TAB_KEYS.some(key => subject.allowedPermissions!.includes(key));
}

export const CLIENT_REVENUE_PERMISSION_KEYS = ["view_client_revenue", "view_client_total_paid"] as const;

export function canViewClientRevenue(subject: PermissionSubject): boolean {
  if (subject.isOwner) return true;
  if (!Array.isArray(subject.allowedPermissions)) return false;
  return subject.allowedPermissions.some(k =>
    (CLIENT_REVENUE_PERMISSION_KEYS as readonly string[]).includes(k),
  );
}

/** @deprecated use canViewClientRevenue */
export const canViewClientTotalPaid = canViewClientRevenue;

/** Map stored permissions to hub keys (for migration / display). */
export function migratePermissionsToHubs(keys: string[]): string[] {
  const out = new Set<string>();
  for (const key of keys) {
    let mapped = false;
    for (const [hub, children] of Object.entries(HUB_LEGACY_CHILDREN) as [HubView, string[]][]) {
      if (children.includes(key)) {
        out.add(hub);
        mapped = true;
        break;
      }
    }
    if (!mapped && ALL_PERMISSION_KEYS.includes(key)) {
      out.add(key);
    }
  }
  return [...out];
}

export function sanitizeAllowedPermissions(input: unknown): AllowedPermissions {
  if (input === null) return null;
  if (!Array.isArray(input)) return null;
  const valid = new Set([
    ...ALL_PERMISSION_KEYS,
    ...LEGACY_PERMISSION_KEYS,
    "view_client_total_paid",
  ]);
  return Array.from(new Set(input.filter((v): v is string => typeof v === "string" && valid.has(v))));
}
