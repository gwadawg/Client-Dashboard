import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAutomationsAccess } from '@/lib/api-auth';
import {
  SLACK_CHANNEL_SELECT,
  normalizeSlug,
  normalizeSlackChannelId,
  optionalText,
} from '@/lib/slack-channels';

// PATCH /api/slack/channels/[id]
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAutomationsAccess(ctx);
  if (denied) return denied;

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: ctx.userId };

  if ('slug' in body) {
    const slug = normalizeSlug(body.slug);
    if (!slug) {
      return NextResponse.json({ error: 'slug must be letters, numbers, and underscores (max 64 chars)' }, { status: 400 });
    }
    updates.slug = slug;
  }
  if ('label' in body) {
    const label = optionalText(body.label);
    if (!label) return NextResponse.json({ error: 'label cannot be empty' }, { status: 400 });
    updates.label = label;
  }
  if ('channel_id' in body || 'channelId' in body) {
    const channelId = normalizeSlackChannelId(body.channel_id ?? body.channelId);
    if (!channelId) {
      return NextResponse.json({ error: 'channel_id must be a valid Slack channel ID (starts with C or G)' }, { status: 400 });
    }
    updates.channel_id = channelId;
  }
  if ('description' in body) {
    updates.description = optionalText(body.description);
  }
  if ('is_active' in body) {
    updates.is_active = body.is_active === true;
  }

  if (Object.keys(updates).length <= 2) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('slack_channels')
    .update(updates)
    .eq('id', id)
    .select(SLACK_CHANNEL_SELECT)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : error.code === '23505' ? 409 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ channel: data });
}

// DELETE /api/slack/channels/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAutomationsAccess(ctx);
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from('slack_channels').delete().eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
