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

function isTruthyUpdateFlagsOnly(payload: Record<string, unknown>): boolean {
  const value = payload.update_flags_only;
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
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
  const _dbgT0 = Date.now();
  // #region agent log
  const _dbg = (message: string, hypothesisId: string, data: Record<string, unknown>) => {
    fetch('http://127.0.0.1:7536/ingest/7e0bc9ea-19d3-426a-b894-38657722fc0f', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '717c22' },
      body: JSON.stringify({
        sessionId: '717c22',
        runId: 'make-audit',
        hypothesisId,
        location: 'webhooks/route.ts',
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  };
  // #endregion
  try {
    if (!validateWebhookSecret(req)) {
      // #region agent log
      _dbg('auth_failed', 'E', { status: 401, ms: Date.now() - _dbgT0 });
      // #endregion
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const text = await req.text();
    const trimmed = text.trim();
    if (!trimmed) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const body = parseWebhookBody(trimmed);
    if (!body.ok) {
      // #region agent log
      _dbg('json_parse_failed', 'E', { status: 400, detail: body.detail, ms: Date.now() - _dbgT0 });
      // #endregion
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
    // #region agent log
    _dbg('incoming', 'A', {
      event_type: typeof eventType === 'string' ? eventType : typeof eventType,
      client_name: typeof payload.client_name === 'string' ? payload.client_name : null,
      has_ghl_contact: Boolean(payload.ghl_contact_id),
      update_flags_only: payload.update_flags_only ?? null,
      allowlisted:
        typeof eventType === 'string' &&
        VALID_EVENT_TYPES.includes(eventType as (typeof VALID_EVENT_TYPES)[number]),
    });
    // #endregion
    if (typeof eventType !== 'string' || !VALID_EVENT_TYPES.includes(eventType as (typeof VALID_EVENT_TYPES)[number])) {
      // #region agent log
      _dbg('invalid_event_type', 'A', {
        status: 400,
        got: eventType === undefined ? 'undefined' : typeof eventType === 'string' ? eventType : typeof eventType,
        ms: Date.now() - _dbgT0,
      });
      // #endregion
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
      // Always park unmapped payloads (including transient lookup failures) with
      // HTTP 200. Make scenarios use handleErrors:false — a 4xx/5xx marks the
      // whole run red and stops retries from being useful. Roster panel reconcile
      // + kickoff/name updates replay these later.
      if (resolved.status === 500) {
        console.error('[webhooks] resolve failed (parking as pending)', resolved.error);
      }
      const queued = await queueUnmappedWebhook(service, payload);
      if ('error' in queued) {
        // #region agent log
        _dbg('queue_failed', 'E', { status: 400, error: queued.error, ms: Date.now() - _dbgT0 });
        // #endregion
        return NextResponse.json({ error: queued.error }, { status: 400 });
      }
      // #region agent log
      _dbg('queued_pending', 'E', {
        status: 200,
        resolve_status: resolved.status,
        client_name: queued.client_name,
        ms: Date.now() - _dbgT0,
      });
      // #endregion
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
      // Qualification flag updates often race the initial lead webhook. Parking
      // them avoids Make marking every qualify scenario as an error.
      if (
        result.status === 404 &&
        normalizedEventType === 'lead' &&
        isTruthyUpdateFlagsOnly(payload)
      ) {
        const queued = await queueUnmappedWebhook(service, payload);
        if (!('error' in queued)) {
          // #region agent log
          _dbg('flags_queued', 'B', {
            status: 200,
            pending: true,
            ms: Date.now() - _dbgT0,
          });
          // #endregion
          return NextResponse.json({
            success: true,
            pending: true,
            pending_id: queued.pending_id,
            client_name: queued.client_name,
            duplicate: queued.duplicate ?? false,
            normalized_event_type: normalizedEventType,
            source_event_type: eventType,
            message:
              'Lead not stored yet — qualification flags queued until the initial lead exists (or is replayed).',
          });
        }
      }
      // #region agent log
      _dbg('ingest_error', 'B', {
        status: result.status,
        error: result.error,
        event_type: eventType,
        ms: Date.now() - _dbgT0,
      });
      // #endregion
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    // #region agent log
    _dbg('ingest_ok', 'D', {
      status: 200,
      event_type: eventType,
      normalized: normalizedEventType,
      event_id: result.event_id ?? null,
      duplicate: result.duplicate ?? false,
      ms: Date.now() - _dbgT0,
    });
    // #endregion
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
    // #region agent log
    _dbg('unexpected', 'E', { status: 400, detail, ms: Date.now() - _dbgT0 });
    // #endregion
    return NextResponse.json(
      { error: 'Unexpected error while handling webhook', detail },
      { status: 400 },
    );
  }
}
