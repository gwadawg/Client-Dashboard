import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { ensureTeamInviteToken, rotateTeamInviteToken } from '@/lib/team-invite';

// GET /api/clients/[id]/team-invite — ensure token exists, return copyable URL.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;

  try {
    const result = await ensureTeamInviteToken(ctx.service, clientId);
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}

// POST /api/clients/[id]/team-invite — rotate token (invalidates previous link).
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json().catch(() => ({}));
  if (!body || body.rotate !== true) {
    return NextResponse.json({ error: 'Pass { "rotate": true } to rotate the invite link' }, { status: 400 });
  }

  try {
    const result = await rotateTeamInviteToken(ctx.service, clientId);
    return NextResponse.json(result);
  } catch (e) {
    const err = e as Error & { status?: number };
    return NextResponse.json({ error: err.message }, { status: err.status ?? 500 });
  }
}
