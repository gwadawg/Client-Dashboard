import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers, type AuthContext } from '@/lib/api-auth';
import { sanitizeAllowedPermissions } from '@/lib/permissions';

type TargetProfile = { is_owner: boolean; is_admin: boolean };

async function loadTargetProfile(ctx: AuthContext, id: string): Promise<TargetProfile> {
  const { data } = await ctx.service
    .from('profiles')
    .select('is_owner, is_admin')
    .eq('id', id)
    .maybeSingle();
  return { is_owner: data?.is_owner ?? false, is_admin: data?.is_admin ?? false };
}

// Role tiers: the owner can manage everyone except an owner row; admins can
// manage only regular (non-owner, non-admin) users.
function canManageTarget(ctx: AuthContext, target: TargetProfile): boolean {
  if (target.is_owner) return false;
  if (ctx.isOwner) return true;
  if (ctx.isAdmin) return !target.is_admin;
  return false;
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { data, error } = await ctx.service.auth.admin.listUsers();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: profiles } = await ctx.service
    .from('profiles')
    .select('id, is_owner, is_admin, allowed_permissions');
  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  const users = data.users.map(u => ({
    id: u.id,
    email: u.email,
    is_owner: profileMap[u.id]?.is_owner ?? false,
    is_admin: profileMap[u.id]?.is_admin ?? false,
    allowed_permissions: (profileMap[u.id]?.allowed_permissions ?? null) as string[] | null,
    created_at: u.created_at,
  }));

  return NextResponse.json({
    users,
    viewer: { id: ctx.userId, isOwner: ctx.isOwner, isAdmin: ctx.isAdmin },
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { email, password, is_admin } = await req.json();
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
  }

  // Only the owner may create admins.
  if (is_admin && !ctx.isOwner) {
    return NextResponse.json({ error: 'Only the owner can create admins' }, { status: 403 });
  }

  const { data, error } = await ctx.service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (is_admin) {
    await ctx.service.from('profiles').update({ is_admin: true }).eq('id', data.user.id);
  }

  return NextResponse.json({ success: true, user: { id: data.user.id, email: data.user.email } });
}

export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const target = await loadTargetProfile(ctx, id);
  if (!canManageTarget(ctx, target)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await ctx.service.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const body = await req.json();
  const { id, password, is_admin, allowed_permissions } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const target = await loadTargetProfile(ctx, id);
  if (!canManageTarget(ctx, target)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (password) {
    const { error } = await ctx.service.auth.admin.updateUserById(id, { password });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const profileUpdate: { is_admin?: boolean; allowed_permissions?: string[] | null } = {};

  // Only the owner may change the admin flag.
  if (is_admin !== undefined) {
    if (!ctx.isOwner) {
      return NextResponse.json({ error: 'Only the owner can change admin status' }, { status: 403 });
    }
    profileUpdate.is_admin = Boolean(is_admin);
  }

  if ('allowed_permissions' in body) {
    profileUpdate.allowed_permissions = sanitizeAllowedPermissions(allowed_permissions);
  }

  if (Object.keys(profileUpdate).length > 0) {
    const { error } = await ctx.service.from('profiles').update(profileUpdate).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
