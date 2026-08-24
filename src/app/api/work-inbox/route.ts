import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { requirePlanAccess, userCanApprovePlans } from '@/lib/account-week-plans-api';
import { todayYmdInCallCenterTz } from '@/lib/time';
import {
  canLoadWorkInbox,
  canSeeUnownedFollowups,
  isWorkInboxYmd,
  loadWorkInbox,
} from '@/lib/work-inbox';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { data: linked } = await ctx.service
    .from('agents')
    .select('pay_type')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  const hasPlanAccess = requirePlanAccess(ctx) === null;
  if (
    !canLoadWorkInbox({
      isOwner: ctx.isOwner,
      isAdmin: ctx.isAdmin,
      allowedPermissions: ctx.allowedPermissions,
      payType: linked?.pay_type,
      hasPlanAccess,
    })
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const dayParam = url.searchParams.get('day');
  const day = dayParam || todayYmdInCallCenterTz();
  if (!isWorkInboxYmd(day)) {
    return NextResponse.json({ error: 'day must be YYYY-MM-DD' }, { status: 400 });
  }

  const scope = url.searchParams.get('scope') === 'user' ? 'user' : 'me';
  const canScope = userCanApprovePlans(ctx);
  if (scope === 'user' && !canScope) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const plateUserId =
    scope === 'user' ? url.searchParams.get('user_id')?.trim() || '' : ctx.userId;
  if (scope === 'user' && !plateUserId) {
    return NextResponse.json({ error: 'user_id is required when scope=user' }, { status: 400 });
  }

  const viewingSelf = plateUserId === ctx.userId;
  const includePlanApprove = canScope && viewingSelf;
  const includeUnownedFollowups =
    viewingSelf &&
    canSeeUnownedFollowups({
      isOwner: ctx.isOwner,
      isAdmin: ctx.isAdmin,
      allowedPermissions: ctx.allowedPermissions,
      payType: linked?.pay_type,
    });

  try {
    const { items, warnings } = await loadWorkInbox(ctx.service, {
      day,
      plateUserId,
      includePlanApprove,
      includeUnownedFollowups,
    });
    return NextResponse.json({
      day,
      scope,
      user_id: plateUserId,
      can_scope_user: canScope,
      items,
      warnings,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
