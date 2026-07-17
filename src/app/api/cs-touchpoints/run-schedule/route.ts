import { NextResponse } from 'next/server';
import { validateSchedulerSecret } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase';
import { runCsTouchpointSchedule } from '@/lib/cs-touchpoint-rules';

export async function POST(req: Request) {
  if (!validateSchedulerSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const service = createServiceClient();
    const result = await runCsTouchpointSchedule(service);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Schedule failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
