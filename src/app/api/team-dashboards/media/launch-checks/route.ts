import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, type AuthContext } from '@/lib/api-auth';
import { hasPermission } from '@/lib/permissions';
import {
  upsertMbLaunchCheck,
  type MbLaunchCheckField,
} from '@/lib/team-dashboards/media';

const FIELDS = new Set<MbLaunchCheckField>(['funnel', 'ads_manager', 'mr_waiz']);

async function canAccessMediaCommand(ctx: AuthContext): Promise<boolean> {
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  if (ctx.isAdmin || hasPermission('team_dashboard_media', subject)) return true;

  const { data: linked } = await ctx.service
    .from('agents')
    .select('pay_type')
    .eq('user_id', ctx.userId)
    .maybeSingle();

  return linked?.pay_type === 'media_buyer' || linked?.pay_type === 'operations';
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  if (!(await canAccessMediaCommand(ctx))) {
    const denied = requirePermission(ctx, 'team_dashboard_media');
    if (denied) return denied;
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const clientId =
    typeof body === 'object' && body && 'client_id' in body
      ? String((body as { client_id: unknown }).client_id ?? '')
      : '';
  const fieldRaw =
    typeof body === 'object' && body && 'field' in body
      ? String((body as { field: unknown }).field ?? '')
      : '';
  const checked =
    typeof body === 'object' && body && 'checked' in body
      ? Boolean((body as { checked: unknown }).checked)
      : null;

  if (!clientId || !FIELDS.has(fieldRaw as MbLaunchCheckField) || checked == null) {
    return NextResponse.json(
      {
        error:
          'Expected { client_id, field: funnel|ads_manager|mr_waiz, checked: boolean }',
      },
      { status: 400 },
    );
  }

  try {
    const checks = await upsertMbLaunchCheck(ctx.service, {
      clientId,
      field: fieldRaw as MbLaunchCheckField,
      checked,
      userId: ctx.userId,
    });
    return NextResponse.json({
      client_id: clientId,
      checks,
      all_checked: Boolean(
        checks.funnel_checked_at &&
          checks.ads_manager_checked_at &&
          checks.mr_waiz_checked_at,
      ),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
