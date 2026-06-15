import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';
import { queueUnmappedWebhook } from '@/lib/pending-events';
import { resolveClientId } from '@/lib/resolve-client';
import {
  ingestWebhookEvent,
  jsonStringField,
  normalizeEventType,
  sanitizeWebhookPayload,
  VALID_EVENT_TYPES,
} from '@/lib/webhook-ingest';

/** Fixes common Make/GHL JSON typos (e.g. empty state sent as """"). */
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
    const trimmed = text.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const body = parseWebhookBody(trimmed);
    if (!body.ok) {
      return NextResponse.json(
        {
          error: 'Body is not valid JSON',
          detail: body.detail,
          hint:
            'In Make: use Raw body (not jsonString) or ifempty() for empty fields. Common fix: "state": "" not "state": """".',
        },
        { status: 400 },
      );
    }

    const payload = body.payload;
    const service = createServiceClient();

    const eventType = payload.event_type;
    if (typeof eventType !== 'string' || !VALID_EVENT_TYPES.includes(eventType as (typeof VALID_EVENT_TYPES)[number])) {
      return NextResponse.json(
        {
          error: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
          got: eventType === undefined ? 'undefined' : typeof eventType === 'string' ? eventType : typeof eventType,
        },
        { status: 400 },
      );
    }

    const normalizedEventType = normalizeEventType(eventType);
    const resolved = await resolveClientId(service, payload, jsonStringField);

    if ('error' in resolved) {
      const queued = await queueUnmappedWebhook(service, payload);
      if ('error' in queued) {
        return NextResponse.json({ error: queued.error }, { status: 400 });
      }
      return NextResponse.json({
        success: true,
        pending: true,
        pending_id: queued.pending_id,
        client_name: queued.client_name,
        duplicate: queued.duplicate ?? false,
        normalized_event_type: normalizedEventType,
        source_event_type: eventType,
        message: `Client not mapped yet — stored for "${queued.client_name}" until sub-account name is set.`,
      });
    }

    const result = await ingestWebhookEvent(service, payload, { client_id: resolved.client_id });
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      updated: result.updated,
      event_id: result.event_id,
      duplicate: result.duplicate,
      skipped: result.skipped,
      normalized_event_type: result.normalized_event_type,
      source_event_type: result.source_event_type,
    });
  } catch (e) {
    console.error('[webhooks] POST failed', e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'Unexpected error while handling webhook', detail },
      { status: 400 },
    );
  }
}
