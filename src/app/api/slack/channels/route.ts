import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAutomationsAccess } from '@/lib/api-auth';
import {
  SLACK_CHANNEL_SELECT,
  normalizeSlug,
  normalizeSlackChannelId,
  optionalText,
} from '@/lib/slack-channels';

// GET /api/slack/channels — list workspace Slack channels.
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAutomationsAccess(ctx);
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('slack_channels')
    .select(SLACK_CHANNEL_SELECT)
    .order('label');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ channels: data ?? [] });
}

// POST /api/slack/channels — create a workspace Slack channel entry.
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAutomationsAccess(ctx);
  if (denied) return denied;

  const body = await req.json();
  const slug = normalizeSlug(body.slug);
  const label = optionalText(body.label);
  const channelId = normalizeSlackChannelId(body.channel_id ?? body.channelId);
  const description = optionalText(body.description);

  if (!slug) {
    return NextResponse.json({ error: 'slug is required (letters, numbers, underscores; max 64 chars)' }, { status: 400 });
  }
  if (!label) {
    return NextResponse.json({ error: 'label is required' }, { status: 400 });
  }
  if (!channelId) {
    return NextResponse.json({ error: 'channel_id must be a valid Slack channel ID (starts with C or G)' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.service
    .from('slack_channels')
    .insert({
      slug,
      label,
      channel_id: channelId,
      description,
      is_active: body.is_active !== false,
      created_at: now,
      updated_at: now,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select(SLACK_CHANNEL_SELECT)
    .single();

  if (error) {
    const status = error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ channel: data });
}
