import { NextResponse } from 'next/server';
import { validateSchedulerSecret } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase';
import { runCplThresholdAlert } from '@/lib/cpl-threshold-alert';

/**
 * Daily CPL threshold digest → media_buyer Slack channel.
 * Auth: ADMIN_WEBHOOK_SECRET or CRON_SECRET (Bearer).
 *
 * Query:
 *   dry_run=1 — compute only, no Slack
 *   post_all_clear=1 — also post when nobody is over threshold
 */
async function handle(req: Request) {
  if (!validateSchedulerSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const dryRun = url.searchParams.get('dry_run') === '1';
  const postAllClear = url.searchParams.get('post_all_clear') === '1';

  try {
    const service = createServiceClient();
    const result = await runCplThresholdAlert(service, { dryRun, postAllClear });
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'CPL threshold alert failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
