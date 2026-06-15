import { NextResponse } from 'next/server';
import { validateWebhookSecret } from '@/lib/api-auth';
import { clickUpTaskUrl } from '@/lib/clickup';
import { onboardClient } from '@/lib/onboard-client';
import { replayPendingForClientId } from '@/lib/pending-events';
import { createServiceClient } from '@/lib/supabase';

// POST /api/admin/onboard — secret-guarded; called by Make.com after GHL New Client Form.
// Upserts the client in Supabase, creates a ClickUp Client Hub task, returns stable IDs.
export async function POST(req: Request) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  try {
    const service = createServiceClient();
    const { client, clickup_task_id, created, billing_id, sales_call_id } = await onboardClient(service, body);

    let pending_replay = { replayed: 0, skipped: 0, failed: 0, errors: [] as string[] };
    try {
      pending_replay = await replayPendingForClientId(service, String(client.id));
    } catch (e) {
      console.error('[onboard] pending replay failed', e);
    }

    return NextResponse.json({
      client_id: client.id,
      client,
      clickup_task_id,
      clickup_task_url: clickup_task_id ? clickUpTaskUrl(clickup_task_id) : null,
      billing_id,
      sales_call_id,
      created,
      pending_replay,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const status = message.includes('required') ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
