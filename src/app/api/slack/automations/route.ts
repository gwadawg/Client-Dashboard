import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { NOTIFICATION_AUTOMATION_SELECT } from '@/lib/slack-channels';

const AUTOMATIONS_PERMISSION = 'admin_automations';

// GET /api/slack/automations — read-only list of notification automations (phase 1 stub).
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, AUTOMATIONS_PERMISSION);
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('notification_automations')
    .select(NOTIFICATION_AUTOMATION_SELECT)
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automations: data ?? [] });
}
