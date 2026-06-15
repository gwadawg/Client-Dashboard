import type { SupabaseClient } from '@supabase/supabase-js';
import { parseYnFlag } from '@/lib/metrics';
import { resolveClientId } from '@/lib/resolve-client';
import {
  normalizeTimestamp,
  normalizeTimeZone,
  CALL_CENTER_TIMEZONE,
  INGEST_SOURCE_TIMEZONE,
} from '@/lib/time';

export const VALID_EVENT_TYPES = [
  'dial', 'lead', 'appointment_booked', 'show', 'no_show', 'callback_booked',
  'live_transfer', 'proposal_sent', 'loan_processing', 'closed', 'out_of_state_lead',
  'proposal_made', 'submission_made', 'loan_funded',
  'appointment_cancelled', 'lo_bailed', 'lo_audit', 'claimed',
] as const;

const QUOTE_ONLY_VALUE = /^["'`\s]+$/;

function isTruthyPayloadFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

export function normalizeEventType(eventType: string): string {
  if (eventType === 'proposal_sent') return 'proposal_made';
  if (eventType === 'loan_processing') return 'submission_made';
  if (eventType === 'closed') return 'loan_funded';
  return eventType;
}

function jsonSafeString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;

  let s = v.trim();
  if (!s || QUOTE_ONLY_VALUE.test(s)) return null;

  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (!s || QUOTE_ONLY_VALUE.test(s)) return null;

  return s;
}

export function jsonStringField(v: unknown): string | null {
  return jsonSafeString(v);
}

export function sanitizeWebhookPayload(value: unknown): unknown {
  if (typeof value === 'string') return jsonSafeString(value) ?? '';
  if (Array.isArray(value)) return value.map(sanitizeWebhookPayload);
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = sanitizeWebhookPayload(v);
    }
    return out;
  }
  return value;
}

function numberField(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function booleanField(v: unknown): boolean | null {
  if (v === true || v === false) return v;
  if (v === 1) return true;
  if (v === 0) return false;
  if (typeof v === 'string') {
    const normalized = v.trim().toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return null;
}

export type IngestWebhookResult =
  | {
      ok: true;
      updated?: boolean;
      event_id?: string;
      duplicate?: boolean;
      skipped?: boolean;
      normalized_event_type: string;
      source_event_type: string;
    }
  | { error: string; status: 400 | 404 | 500 };

export async function ingestWebhookEvent(
  service: SupabaseClient,
  payload: Record<string, unknown>,
  opts?: { client_id?: string },
): Promise<IngestWebhookResult> {
  const eventType = payload.event_type;
  if (typeof eventType !== 'string' || !VALID_EVENT_TYPES.includes(eventType as (typeof VALID_EVENT_TYPES)[number])) {
    return {
      error: `Invalid event_type. Must be one of: ${VALID_EVENT_TYPES.join(', ')}`,
      status: 400,
    };
  }

  const normalizedEventType = normalizeEventType(eventType);
  let client_id = opts?.client_id;

  if (!client_id) {
    const resolved = await resolveClientId(service, payload, jsonStringField);
    if ('error' in resolved) {
      return { error: resolved.error, status: resolved.status };
    }
    client_id = resolved.client_id;
  }

  if (normalizedEventType === 'lead' && isTruthyPayloadFlag(payload.update_flags_only)) {
    const ghlContactId = jsonStringField(payload.ghl_contact_id);
    if (!ghlContactId) {
      return { error: 'ghl_contact_id is required when update_flags_only is true', status: 400 };
    }

    const { data: rows, error: selErr } = await service
      .from('events')
      .select('id, raw, is_qualified, is_hot, is_out_of_state')
      .eq('client_id', client_id)
      .eq('event_type', 'lead')
      .eq('ghl_contact_id', ghlContactId)
      .order('occurred_at', { ascending: true })
      .limit(1);

    if (selErr) return { error: selErr.message, status: 500 };

    const existing = rows?.[0];
    if (!existing) {
      return {
        error:
          'No existing lead event for this ghl_contact_id. Send the initial lead webhook first, or omit update_flags_only.',
        status: 404,
      };
    }

    const updates: Record<string, unknown> = {};

    if ('is_qualified' in payload || 'qualified' in payload) {
      updates.is_qualified = parseYnFlag(payload.is_qualified ?? payload.qualified);
    }
    if ('is_hot' in payload || 'hot' in payload) {
      updates.is_hot = parseYnFlag(payload.is_hot ?? payload.hot);
    }
    if ('is_out_of_state' in payload || 'out_of_state' in payload) {
      updates.is_out_of_state = parseYnFlag(payload.is_out_of_state ?? payload.out_of_state);
    }

    if (Object.keys(updates).length === 0) {
      return {
        error:
          'No flags to update. Include is_qualified, is_hot, and/or is_out_of_state (or qualified, hot, out_of_state).',
        status: 400,
      };
    }

    const prevRaw =
      typeof existing.raw === 'object' && existing.raw !== null && !Array.isArray(existing.raw)
        ? (existing.raw as Record<string, unknown>)
        : {};
    updates.raw = {
      ...prevRaw,
      ...(sanitizeWebhookPayload(payload) as Record<string, unknown>),
      _flags_updated_at: new Date().toISOString(),
    };

    const { error: updErr } = await service.from('events').update(updates).eq('id', existing.id);
    if (updErr) return { error: updErr.message, status: 500 };

    return {
      ok: true,
      updated: true,
      event_id: existing.id,
      normalized_event_type: normalizedEventType,
      source_event_type: eventType,
    };
  }

  let clientTz = CALL_CENTER_TIMEZONE;
  {
    const { data: clientRow } = await service
      .from('clients')
      .select('timezone')
      .eq('id', client_id)
      .maybeSingle();
    if (clientRow?.timezone) clientTz = clientRow.timezone;
  }

  const leadTz = normalizeTimeZone(payload.lead_timezone ?? payload.timezone);
  const occurredFallbackTz =
    eventType === 'lead'
      ? leadTz ?? INGEST_SOURCE_TIMEZONE
      : eventType === 'dial'
        ? INGEST_SOURCE_TIMEZONE
        : clientTz;
  const occ = normalizeTimestamp(payload.occurred_at, occurredFallbackTz);
  const occurredAtIso = occ.iso ?? new Date().toISOString();
  const occurredHasTime = occ.iso === null ? true : occ.hasTime;

  let lead_created_at: string | null = null;
  if (eventType === 'dial') {
    const lc = normalizeTimestamp(
      payload.lead_created_at ?? payload.lead_created_date,
      leadTz ?? INGEST_SOURCE_TIMEZONE,
    );
    if (lc.iso && lc.hasTime) lead_created_at = lc.iso;
  }

  let speed_to_lead_seconds = payload.speed_to_lead_seconds ?? null;
  const dialGhlContactId = jsonStringField(payload.ghl_contact_id);
  if (
    eventType === 'dial' &&
    speed_to_lead_seconds === null &&
    occurredHasTime &&
    dialGhlContactId
  ) {
    const [{ data: priorDial }, { data: leadEvent }] = await Promise.all([
      service
        .from('events')
        .select('id')
        .eq('client_id', client_id)
        .eq('event_type', 'dial')
        .eq('ghl_contact_id', dialGhlContactId)
        .limit(1)
        .maybeSingle(),
      service
        .from('events')
        .select('occurred_at, occurred_at_has_time')
        .eq('client_id', client_id)
        .eq('event_type', 'lead')
        .eq('ghl_contact_id', dialGhlContactId)
        .order('occurred_at', { ascending: true })
        .limit(1)
        .maybeSingle(),
    ]);

    if (!priorDial) {
      let leadMs: number | null = null;
      if (lead_created_at) {
        leadMs = new Date(lead_created_at).getTime();
      } else if (leadEvent && leadEvent.occurred_at_has_time !== false) {
        leadMs = new Date(leadEvent.occurred_at).getTime();
      }
      const dialMs = new Date(occurredAtIso).getTime();
      if (leadMs !== null && dialMs > leadMs) {
        speed_to_lead_seconds = Math.floor((dialMs - leadMs) / 1000);
      }
    }
  }

  const isLead = eventType === 'lead';
  const duration_seconds = numberField(payload.duration_seconds);
  const isDial = eventType === 'dial';
  const is_pickup =
    isDial ? booleanField(payload.is_pickup) ?? (duration_seconds != null ? duration_seconds >= 40 : null) : null;
  const is_conversation =
    isDial
      ? booleanField(payload.is_conversation) ??
        (duration_seconds != null ? duration_seconds >= 120 : null)
      : null;
  const calIdRaw = payload.calendar_id ?? payload.ghl_calendar_id;
  const calendar_id = jsonStringField(calIdRaw);
  const external_id = jsonStringField(payload.external_id ?? payload.ghl_appointment_id);
  const dial_source = jsonStringField(
    payload.dial_source ?? payload.software ?? payload.dialer_source ?? payload.call_source,
  );

  const utm_source = jsonStringField(payload.utm_source);
  const utm_campaign = jsonStringField(payload.utm_campaign);
  const utm_content = jsonStringField(payload.utm_content);
  const ad_name = jsonStringField(payload.ad_name ?? payload.adName ?? payload.utm_content);
  const adset_name = jsonStringField(payload.adset_name ?? payload.ad_set_name ?? payload.adSetName);
  const campaign_name = jsonStringField(
    payload.campaign_name ?? payload.campaignName ?? payload.utm_campaign,
  );
  const lead_source = jsonStringField(
    payload.lead_source ?? payload.leadSource ?? payload.list_source ?? payload.listSource,
  );

  const { data: inserted, error } = await service
    .from('events')
    .insert({
      client_id,
      event_type: normalizedEventType,
      occurred_at: occurredAtIso,
      occurred_at_has_time: occurredHasTime,
      lead_created_at,
      lead_timezone: leadTz,
      duration_seconds,
      is_pickup,
      is_conversation,
      is_qualified: isLead ? parseYnFlag(payload.is_qualified ?? payload.qualified) : null,
      is_hot: isLead ? parseYnFlag(payload.is_hot ?? payload.hot) : null,
      is_out_of_state: isLead ? parseYnFlag(payload.is_out_of_state ?? payload.out_of_state) : null,
      speed_to_lead_seconds,
      ghl_contact_id: jsonStringField(payload.ghl_contact_id),
      scheduled_at: normalizeTimestamp(payload.scheduled_at, clientTz).iso,
      external_id,
      calendar_name: jsonStringField(payload.calendar_name),
      calendar_id,
      lead_name: jsonStringField(payload.lead_name),
      lead_phone: jsonStringField(payload.lead_phone),
      lead_email: jsonStringField(payload.lead_email),
      agent_name: jsonStringField(payload.agent_name),
      direction: jsonStringField(payload.direction),
      call_status: jsonStringField(payload.call_status),
      recording_url: jsonStringField(payload.recording_url),
      call_summary: jsonStringField(payload.call_summary),
      phone_number_used: jsonStringField(payload.phone_number_used),
      dial_source,
      stage_booked: jsonStringField(payload.stage_booked),
      ad_name,
      adset_name,
      campaign_name,
      utm_source,
      utm_campaign,
      utm_content,
      lead_source: isLead ? lead_source : null,
      raw: payload,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      return {
        ok: true,
        duplicate: true,
        skipped: true,
        normalized_event_type: normalizedEventType,
        source_event_type: eventType,
      };
    }
    return { error: error.message, status: 500 };
  }

  return {
    ok: true,
    event_id: inserted?.id,
    normalized_event_type: normalizedEventType,
    source_event_type: eventType,
  };
}
