import { NextResponse } from 'next/server';
import { validateWebhookSecret } from '@/lib/api-auth';
import { upsertCsAppointment } from '@/lib/cs-appointments';
import { createServiceClient } from '@/lib/supabase';
import { sanitizeWebhookPayload } from '@/lib/webhook-ingest';

function repairWebhookJson(text: string): string {
  let s = text.trim();
  s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  s = s.replace(/:\s*"{2,}(?=\s*[,}])/g, ': ""');
  s = s.replace(/,\s*"{2,}(?=\s*[,}])/g, ', ""');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return s;
}

function parseWebhookBody(text: string):
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; detail: string } {
  const candidates = [text.trim(), repairWebhookJson(text)];
  let lastDetail = 'parse error';
  for (const candidate of [...new Set(candidates)]) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        lastDetail = 'JSON must be one object';
        continue;
      }
      return {
        ok: true,
        payload: sanitizeWebhookPayload(parsed) as Record<string, unknown>,
      };
    } catch (e) {
      lastDetail = e instanceof Error ? e.message : 'parse error';
    }
  }
  return { ok: false, detail: lastDetail };
}

export async function POST(req: Request) {
  try {
    if (!validateWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const text = await req.text();
    const parsed = parseWebhookBody(text);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'Invalid JSON', detail: parsed.detail },
        { status: 400 },
      );
    }

    const service = createServiceClient();
    const result = await upsertCsAppointment(service, parsed.payload);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      ok: true,
      id: result.id,
      mapped_client: result.mapped_client,
      call_type: result.call_type,
      created: result.created,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error('[cs-appointments webhook]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
