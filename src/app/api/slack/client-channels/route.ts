import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { normalizeSlackChannelId } from '@/lib/slack-channels';

const AUTOMATIONS_PERMISSION = 'admin_automations';

// GET /api/slack/client-channels — per-client Slack channel IDs for the Automations tab.
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, AUTOMATIONS_PERMISSION);
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('clients')
    .select('id, name, slack_id, lifecycle_status')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clients = (data ?? []).map(row => ({
    client_id: row.id,
    client_name: row.name,
    slack_id: row.slack_id,
    lifecycle_status: row.lifecycle_status,
  }));

  return NextResponse.json({ clients });
}

// PATCH /api/slack/client-channels — update a client's slack_id from the Automations tab.
export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, AUTOMATIONS_PERMISSION);
  if (denied) return denied;

  const body = await req.json();
  const clientId = typeof body.client_id === 'string' ? body.client_id.trim() : '';
  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  let slackId: string | null;
  if (body.slack_id === '' || body.slack_id === null) {
    slackId = null;
  } else {
    slackId = normalizeSlackChannelId(body.slack_id ?? body.slackId);
    if (!slackId) {
      return NextResponse.json({ error: 'slack_id must be a valid Slack channel ID (starts with C or G), or empty to clear' }, { status: 400 });
    }
  }

  const { data, error } = await ctx.service
    .from('clients')
    .update({ slack_id: slackId })
    .eq('id', clientId)
    .select('id, name, slack_id, lifecycle_status')
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({
    client: {
      client_id: data.id,
      client_name: data.name,
      slack_id: data.slack_id,
      lifecycle_status: data.lifecycle_status,
    },
  });
}
