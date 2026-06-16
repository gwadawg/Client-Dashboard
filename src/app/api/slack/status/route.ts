import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAutomationsAccess } from '@/lib/api-auth';
import { getSlackOpsChannelSlug, isSlackConfigured } from '@/lib/slack-notify';

// GET /api/slack/status — whether direct Slack posting is configured.
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAutomationsAccess(ctx);
  if (denied) return denied;

  return NextResponse.json({
    configured: isSlackConfigured(),
    ops_channel_slug: getSlackOpsChannelSlug(),
  });
}
