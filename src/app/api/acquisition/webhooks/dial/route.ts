import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';
import { backfillAcquisitionDialsFromGhl } from '@/lib/acquisition-dials-ghl-backfill';
import { upsertAcquisitionDial } from '@/lib/acquisition-ingest';

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (req.nextUrl.searchParams.get('backfill') !== 'true') {
    return NextResponse.json({ error: 'Use ?backfill=true to run GHL dial backfill' }, { status: 400 });
  }

  const { searchParams } = req.nextUrl;
  try {
    const service = createServiceClient();
    const report = await backfillAcquisitionDialsFromGhl(service, {
      dryRun: searchParams.get('dry_run') === 'true',
      since: searchParams.get('since'),
      until: searchParams.get('until'),
      withRecordings: searchParams.get('with_recordings') === 'true',
      outboundOnly: searchParams.get('all_directions') !== 'true',
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : null,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const service = createServiceClient();
  const result = await upsertAcquisitionDial(service, payload as Record<string, unknown>);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, id: result.id });
}
