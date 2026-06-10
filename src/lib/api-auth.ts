import { createAuthClient, createServiceClient } from './supabase';
import { NextResponse } from 'next/server';
import { hasPermission, canViewClientRevenue, type AllowedPermissions } from './permissions';

export type AuthContext = {
  userId: string;
  isOwner: boolean;
  isAdmin: boolean;
  // Permission keys this user is granted. null = no restriction (unrestricted).
  allowedPermissions: AllowedPermissions;
  service: ReturnType<typeof createServiceClient>;
};

export async function getAuthContext(): Promise<AuthContext | NextResponse> {
  const supabase = await createAuthClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('is_owner, is_admin, allowed_permissions')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    isOwner: profile?.is_owner ?? false,
    isAdmin: profile?.is_admin ?? false,
    allowedPermissions: (profile?.allowed_permissions ?? null) as AllowedPermissions,
    service,
  };
}

export function isAuthError(val: unknown): val is NextResponse {
  return val instanceof NextResponse;
}

// Guard for endpoints that manage users (owner or admin). Returns a 403 response
// when the caller lacks the role, otherwise null.
export function requireManageUsers(ctx: AuthContext): NextResponse | null {
  if (ctx.isOwner || ctx.isAdmin) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Guard for feature/view-gated endpoints. Returns a 403 response when the caller
// lacks the permission, otherwise null. The owner always passes.
export function requirePermission(ctx: AuthContext, key: string): NextResponse | null {
  if (hasPermission(key, { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions })) {
    return null;
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Guard for endpoints shared by several views/features. Passes when the caller
// holds ANY of the listed permission keys (the owner always passes). Use this
// for routes that legitimately serve more than one tab, e.g. /api/metrics powers
// both the Dashboard and Goal Tracker, so a user granted either should be served.
export function requireAnyPermission(ctx: AuthContext, keys: string[]): NextResponse | null {
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  if (keys.some(key => hasPermission(key, subject))) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

/** Dollar amounts, MRR, billing totals, CEO revenue — owner or explicit grant only. */
export function requireClientRevenue(ctx: AuthContext): NextResponse | null {
  if (canViewClientRevenue({ isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions })) {
    return null;
  }
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

// Validates a webhook request against the shared secret
export function validateWebhookSecret(req: Request): boolean {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  return authHeader.slice(7) === process.env.ADMIN_WEBHOOK_SECRET;
}

/** Webhook secret or Vercel CRON_SECRET (Bearer) for scheduled jobs. */
export function validateSchedulerSecret(req: Request): boolean {
  if (validateWebhookSecret(req)) return true;
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  const cronSecret = process.env.CRON_SECRET;
  return !!cronSecret && token === cronSecret;
}
