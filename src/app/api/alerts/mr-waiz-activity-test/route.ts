import { NextResponse } from 'next/server';
import { validateSchedulerSecret } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase';
import {
  MR_WAIZ_ACTIVITY_CHANNEL_ID,
  MR_WAIZ_ACTIVITY_SLUG,
  formatMrWaizActivityMessage,
  notifyMrWaizActivity,
} from '@/lib/mr-waiz-activity-notify';
import { getTeamChannelIdBySlug, isSlackConfigured } from '@/lib/slack-notify';

/**
 * Secret-guarded smoke test for the internal activity Slack feed.
 * GET/POST /api/alerts/mr-waiz-activity-test
 * Auth: ADMIN_WEBHOOK_SECRET or CRON_SECRET (Bearer)
 *
 * ?dry_run=1 — format only, no Slack post
 */
async function handle(req: Request) {
  if (!validateSchedulerSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const service = createServiceClient();

  const sample = formatMrWaizActivityMessage('client.work_log_created', 'Cursor smoke test', {
    work_type: 'finding',
    client_name: 'Smoke Test Client',
    title: 'Activity feed Slack smoke test',
    status: 'in_progress',
    change_description: `Manual test at ${new Date().toISOString()}`,
  });

  const channelId = await getTeamChannelIdBySlug(service, MR_WAIZ_ACTIVITY_SLUG);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      slack_configured: isSlackConfigured(),
      slug: MR_WAIZ_ACTIVITY_SLUG,
      expected_channel_id: MR_WAIZ_ACTIVITY_CHANNEL_ID,
      resolved_channel_id: channelId,
      sample_message: sample,
    });
  }

  if (!isSlackConfigured()) {
    return NextResponse.json(
      { ok: false, error: 'SLACK_BOT_TOKEN is not configured' },
      { status: 503 },
    );
  }
  if (!channelId) {
    return NextResponse.json(
      {
        ok: false,
        error: `No active team channel for slug "${MR_WAIZ_ACTIVITY_SLUG}"`,
        hint: `Add slug ${MR_WAIZ_ACTIVITY_SLUG} → ${MR_WAIZ_ACTIVITY_CHANNEL_ID} in Automations`,
      },
      { status: 404 },
    );
  }

  await notifyMrWaizActivity(service, {
    eventKey: 'client.work_log_created',
    actor: { label: 'Cursor smoke test' },
    fields: {
      work_type: 'finding',
      client_name: 'Smoke Test Client',
      title: 'Activity feed Slack smoke test',
      status: 'in_progress',
      change_description: `Manual test at ${new Date().toISOString()}`,
    },
  });

  return NextResponse.json({
    ok: true,
    posted: true,
    slug: MR_WAIZ_ACTIVITY_SLUG,
    channel_id: channelId,
    sample_message: sample,
  });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
