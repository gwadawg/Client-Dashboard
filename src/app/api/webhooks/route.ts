import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';
import { parseYnFlag } from '@/lib/metrics';

function isTruthyPayloadFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1' || v === 'yes';
  }
  return false;
}

const VALID_EVENT_TYPES = [
  'dial', 'lead', 'appointment_booked', 'show', 'no_show', 'callback_booked',
  'live_transfer', 'proposal_sent', 'loan_processing', 'closed', 'out_of_state_lead',
  'appointment_cancelled', 'lo_bailed', 'lo_audit',
] as const;

/** Empty string from Make is not valid for timestamptz — use null or omit for DB. */
function nullIfInvalidTimestamptz(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') return null;
  const t = value.trim();
  if (t === '') return null;
  const ms = Date.parse(t);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function occurredAtOrNow(value: unknown): string {
  return nullIfInvalidTimestamptz(value) ?? new Date().toISOString();
}

/** Non-empty trimmed string, or null — avoids "" in uuid/text columns used for lookups. */
function jsonStringField(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') return String(v).trim() || null;
  const t = v.trim();
  return t === '' ? null : t;
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

    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      const detail = e instanceof Error ? e.message : 'parse error';
      return NextResponse.json(
        {
          error: 'Body is not valid JSON',
          detail,
          hint:
            'In Make: use Raw / JSON body (not form fields). Mapped values must sit inside the JSON with valid string quotes.',
        },
        { status: 400 },
      );
    }

    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return NextResponse.json(
        {
          error: 'JSON must be one object, e.g. {"event_type":"lead","client_name":"..."}',
        },
        { status: 400 },
      );
    }

    const payload = parsed as Record<string, unknown>;
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

    // Resolve client_id by name or id
    let client_id = payload.client_id as string | undefined;
    const client_name_raw = payload.client_name;
    const client_name =
      typeof client_name_raw === 'string' ? client_name_raw.trim() : undefined;

    if (!client_id && client_name) {
      const { data: client, error: clientErr } = await service
        .from('clients')
        .select('id')
        .eq('name', client_name)
        .maybeSingle();
      if (clientErr) {
        console.error('[webhooks] client lookup failed', clientErr.message);
        return NextResponse.json({ error: clientErr.message }, { status: 500 });
      }
      if (!client) {
        return NextResponse.json(
          { error: `Client "${client_name}" not found — must match clients.name in Supabase exactly.` },
          { status: 400 },
        );
      }
      client_id = client.id;
    }

    if (!client_id) {
      return NextResponse.json({ error: 'client_id or client_name is required' }, { status: 400 });
    }

    // Follow-up hook: qualified/hot often arrive after the first "new lead" payload. Update the
    // existing lead row rather than inserting a second lead (which would inflate Total Leads).
    if (eventType === 'lead' && isTruthyPayloadFlag(payload.update_flags_only)) {
      if (!payload.ghl_contact_id) {
        return NextResponse.json(
          { error: 'ghl_contact_id is required when update_flags_only is true' },
          { status: 400 }
        );
      }

      const { data: rows, error: selErr } = await service
        .from('events')
        .select('id, raw, is_qualified, is_hot, is_out_of_state')
        .eq('client_id', client_id)
        .eq('event_type', 'lead')
        .eq('ghl_contact_id', payload.ghl_contact_id)
        .order('occurred_at', { ascending: true })
        .limit(1);

      if (selErr) {
        return NextResponse.json({ error: selErr.message }, { status: 500 });
      }

      const existing = rows?.[0];
      if (!existing) {
        return NextResponse.json(
          {
            error:
              'No existing lead event for this ghl_contact_id. Send the initial lead webhook first, or omit update_flags_only.',
          },
          { status: 404 }
        );
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
        return NextResponse.json(
          {
            error:
              'No flags to update. Include is_qualified, is_hot, and/or is_out_of_state (or qualified, hot, out_of_state).',
          },
          { status: 400 }
        );
      }

      const prevRaw =
        typeof existing.raw === 'object' && existing.raw !== null && !Array.isArray(existing.raw)
          ? (existing.raw as Record<string, unknown>)
          : {};
      updates.raw = { ...prevRaw, ...payload, _flags_updated_at: new Date().toISOString() };

      const { error: updErr } = await service
        .from('events')
        .update(updates)
        .eq('id', existing.id);

      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
      return NextResponse.json({ success: true, updated: true, event_id: existing.id });
    }

    // Auto-compute speed_to_lead_seconds on the first dial to a contact
    let speed_to_lead_seconds = payload.speed_to_lead_seconds ?? null;
    if (
      eventType === 'dial' &&
      speed_to_lead_seconds === null &&
      payload.ghl_contact_id
    ) {
      const [{ data: priorDial }, { data: leadEvent }] = await Promise.all([
        service
          .from('events')
          .select('id')
          .eq('client_id', client_id)
          .eq('event_type', 'dial')
          .eq('ghl_contact_id', payload.ghl_contact_id)
          .limit(1)
          .maybeSingle(),
        service
          .from('events')
          .select('occurred_at')
          .eq('client_id', client_id)
          .eq('event_type', 'lead')
          .eq('ghl_contact_id', payload.ghl_contact_id)
          .order('occurred_at', { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      // Only set on first dial, and only when we have a lead event to measure from
      if (!priorDial && leadEvent) {
        const dialMs = new Date(occurredAtOrNow(payload.occurred_at)).getTime();
        const leadMs = new Date(leadEvent.occurred_at).getTime();
        if (dialMs > leadMs) speed_to_lead_seconds = Math.floor((dialMs - leadMs) / 1000);
      }
    }

    const isLead = eventType === 'lead';
    const calIdRaw = payload.calendar_id ?? payload.ghl_calendar_id;
    const calendar_id = jsonStringField(calIdRaw);
    const external_id = jsonStringField(payload.external_id ?? payload.ghl_appointment_id);

    const { error } = await service.from('events').insert({
      client_id,
      event_type: eventType,
      occurred_at: occurredAtOrNow(payload.occurred_at),
      duration_seconds: payload.duration_seconds ?? null,
      is_pickup: payload.is_pickup ?? null,
      is_conversation: payload.is_conversation ?? null,
      is_qualified: isLead
        ? parseYnFlag(payload.is_qualified ?? payload.qualified)
        : null,
      is_hot: isLead ? parseYnFlag(payload.is_hot ?? payload.hot) : null,
      is_out_of_state: isLead
        ? parseYnFlag(payload.is_out_of_state ?? payload.out_of_state)
        : null,
      speed_to_lead_seconds,
      ghl_contact_id: payload.ghl_contact_id ?? null,
      scheduled_at: nullIfInvalidTimestamptz(payload.scheduled_at),
      external_id,
      calendar_name: jsonStringField(payload.calendar_name),
      calendar_id,
      lead_name: payload.lead_name ?? null,
      lead_phone: payload.lead_phone ?? null,
      lead_email: payload.lead_email ?? null,
      agent_name: payload.agent_name ?? null,
      direction: payload.direction ?? null,
      call_status: payload.call_status ?? null,
      recording_url: payload.recording_url ?? null,
      call_summary: payload.call_summary ?? null,
      phone_number_used: payload.phone_number_used ?? null,
      stage_booked: payload.stage_booked ?? null,
      raw: payload,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[webhooks] POST failed', e);
    const detail = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: 'Unexpected error while handling webhook', detail },
      { status: 400 },
    );
  }
}
