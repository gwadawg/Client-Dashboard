import { NextResponse } from 'next/server';
import { validateWebhookSecret } from '@/lib/api-auth';
import { backfillAcquisitionDialsFromGhl } from '@/lib/acquisition-dials-ghl-backfill';
import { createServiceClient } from '@/lib/supabase';

export const maxDuration = 300;

/** POST /api/admin/backfill-acquisition-dials — uses Railway GHL + Supabase env vars. */
export async function POST(req: Request) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dryRun = searchParams.get('dry_run') === 'true';
  const since = searchParams.get('since');
  const until = searchParams.get('until');
  const withRecordings = searchParams.get('with_recordings') === 'true';
  const allDirections = searchParams.get('all_directions') === 'true';
  const limitRaw = searchParams.get('limit');
  const limit = limitRaw ? Number(limitRaw) : null;

  try {
    const service = createServiceClient();
    const report = await backfillAcquisitionDialsFromGhl(service, {
      dryRun,
      since,
      until,
      withRecordings,
      outboundOnly: !allDirections,
      limit: Number.isFinite(limit) ? limit : null,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
