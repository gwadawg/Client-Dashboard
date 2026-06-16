import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAutomationsAccess } from '@/lib/api-auth';
import { normalizeSlackChannelId } from '@/lib/slack-channels';
import { getTeamChannelIdBySlug, isSlackConfigured, postSlackMessage } from '@/lib/slack-notify';

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// POST /api/slack/messages — send a message directly via the Slack bot.
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAutomationsAccess(ctx);
  if (denied) return denied;

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { error: 'SLACK_BOT_TOKEN is not configured. Add it to your environment variables.' },
      { status: 503 },
    );
  }

  const body = await req.json();
  const text = optionalText(body.text) ?? optionalText(body.message);
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }

  let channelId =
    normalizeSlackChannelId(body.channel_id ?? body.channelId) ??
    optionalText(body.channel_id ?? body.channelId);

  const slug = optionalText(body.slug);
  if (!channelId && slug) {
    channelId = await getTeamChannelIdBySlug(ctx.service, slug);
    if (!channelId) {
      return NextResponse.json({ error: `No active team channel found for slug "${slug}"` }, { status: 404 });
    }
  }

  if (!channelId) {
    return NextResponse.json({ error: 'channel_id or slug is required' }, { status: 400 });
  }

  const result = await postSlackMessage({ channel: channelId, text });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({
    success: true,
    ts: result.ts,
    channel: result.channel,
  });
}
