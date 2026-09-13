import type { SupabaseClient } from '@supabase/supabase-js';
import { clientNamesMatch } from '@/lib/client-name-match';
import {
  ingestWebhookEvent,
  jsonStringField,
  normalizeEventType,
  VALID_EVENT_TYPES,
} from '@/lib/webhook-ingest';
import { normalizeTimestamp, INGEST_SOURCE_TIMEZONE } from '@/lib/time';

export type PendingEventRow = {
  id: string;
  client_name: string;
  ghl_location_id: string | null;
  event_type: string;
  source_event_type: string;
  normalized_event_type: string;
  payload: Record<string, unknown>;
  ghl_contact_id: string | null;
  occurred_at: string | null;
  status: string;
  received_at: string;
  replay_attempts?: number;
};

export type PendingEventGroup = {
  client_name: string;
  ghl_location_id: string | null;
  count: number;
  event_types: string[];
  first_received_at: string;
  last_received_at: string;
};

function pendingLookupName(payload: Record<string, unknown>): string | null {
  return jsonStringField(payload.client_name);
}

function pendingLookupLocation(payload: Record<string, unknown>): string | null {
  return jsonStringField(payload.ghl_location_id) ?? jsonStringField(payload.location_id);
}

function parseOccurredAt(payload: Record<string, unknown>, eventType: string): string | null {
  const leadTz = null;
  const fallback =
    eventType === 'lead' || eventType === 'dial' ? INGEST_SOURCE_TIMEZONE : undefined;
  const occ = normalizeTimestamp(payload.occurred_at, leadTz ?? fallback);
  return occ.iso;
}

export function pendingEventMatchesClient(
  row: Pick<PendingEventRow, 'client_name' | 'ghl_location_id'>,
  client: { name: string; ghl_location_id?: string | null },
): boolean {
  if (client.ghl_location_id && row.ghl_location_id === client.ghl_location_id) return true;
  return clientNamesMatch(row.client_name, client.name);
}

export async function queueUnmappedWebhook(
  service: SupabaseClient,
  payload: Record<string, unknown>,
): Promise<{ pending_id: string; client_name: string; duplicate?: boolean } | { error: string }> {
  const eventType = payload.event_type;
  if (typeof eventType !== 'string' || !VALID_EVENT_TYPES.includes(eventType as (typeof VALID_EVENT_TYPES)[number])) {
    return { error: 'Invalid event_type' };
  }

  const clientName = pendingLookupName(payload);
  const ghlLocationId = pendingLookupLocation(payload);
  if (!clientName && !ghlLocationId) {
    return { error: 'client_name or ghl_location_id is required to queue unmapped events' };
  }

  const normalizedEventType = normalizeEventType(eventType);
  const ghlContactId = jsonStringField(payload.ghl_contact_id);
  const occurredAt = parseOccurredAt(payload, eventType);

  if (ghlContactId && clientName) {
    const { data: existing } = await service
      .from('pending_events')
      .select('id')
      .eq('status', 'pending')
      .eq('client_name', clientName)
      .eq('normalized_event_type', normalizedEventType)
      .eq('ghl_contact_id', ghlContactId)
      .maybeSingle();
    if (existing?.id) {
      return { pending_id: existing.id, client_name: clientName, duplicate: true };
    }
  }

  const { data, error } = await service
    .from('pending_events')
    .insert({
      client_name: clientName ?? `(location ${ghlLocationId})`,
      ghl_location_id: ghlLocationId,
      event_type: normalizedEventType,
      source_event_type: eventType,
      normalized_event_type: normalizedEventType,
      payload,
      ghl_contact_id: ghlContactId,
      occurred_at: occurredAt,
    })
    .select('id, client_name')
    .single();

  if (error) return { error: error.message };
  return { pending_id: data.id, client_name: data.client_name };
}

export async function listPendingEventGroups(service: SupabaseClient): Promise<PendingEventGroup[]> {
  const { data, error } = await service
    .from('pending_events')
    .select('client_name, ghl_location_id, normalized_event_type, received_at')
    .eq('status', 'pending')
    .order('received_at', { ascending: false });
  if (error) throw new Error(error.message);

  const groups = new Map<string, PendingEventGroup>();
  for (const row of data ?? []) {
    const key = `${row.client_name}\0${row.ghl_location_id ?? ''}`;
    const g = groups.get(key) ?? {
      client_name: row.client_name as string,
      ghl_location_id: row.ghl_location_id as string | null,
      count: 0,
      event_types: [] as string[],
      first_received_at: row.received_at as string,
      last_received_at: row.received_at as string,
    };
    g.count += 1;
    if (!g.event_types.includes(row.normalized_event_type)) {
      g.event_types.push(row.normalized_event_type);
    }
    if (row.received_at < g.first_received_at) g.first_received_at = row.received_at;
    if (row.received_at > g.last_received_at) g.last_received_at = row.received_at;
    groups.set(key, g);
  }

  return [...groups.values()].sort((a, b) => b.count - a.count);
}

export async function countPendingEvents(service: SupabaseClient): Promise<number> {
  const { count, error } = await service
    .from('pending_events')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export type ReplayResult = {
  replayed: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function replayPendingEventRows(
  service: SupabaseClient,
  client: { id: string; name: string; ghl_location_id?: string | null },
  rows: PendingEventRow[],
): Promise<ReplayResult> {
  const result: ReplayResult = { replayed: 0, skipped: 0, failed: 0, errors: [] };

  for (const row of rows) {
    const ingest = await ingestWebhookEvent(
      service,
      row.payload as Record<string, unknown>,
      { client_id: client.id },
    );

    if ('error' in ingest) {
      if (ingest.status === 404 && row.normalized_event_type === 'lead') {
        await service
          .from('pending_events')
          .update({
            replay_attempts: (row.replay_attempts ?? 0) + 1,
            error_message: ingest.error,
          })
          .eq('id', row.id);
        result.failed += 1;
        result.errors.push(`${row.id}: ${ingest.error}`);
        continue;
      }

      await service
        .from('pending_events')
        .update({
          status: 'skipped',
          resolved_client_id: client.id,
          resolved_at: new Date().toISOString(),
          error_message: ingest.error,
          replay_attempts: 1,
        })
        .eq('id', row.id);
      result.skipped += 1;
      continue;
    }

    if (ingest.duplicate || ingest.skipped) {
      await service
        .from('pending_events')
        .update({
          status: 'resolved',
          resolved_client_id: client.id,
          resolved_at: new Date().toISOString(),
          replay_attempts: 1,
        })
        .eq('id', row.id);
      result.skipped += 1;
      continue;
    }

    await service
      .from('pending_events')
      .update({
        status: 'resolved',
        resolved_client_id: client.id,
        resolved_event_id: ingest.event_id ?? null,
        resolved_at: new Date().toISOString(),
        replay_attempts: 1,
        error_message: null,
      })
      .eq('id', row.id);
    result.replayed += 1;
  }

  return result;
}

export async function replayPendingEventsForClient(
  service: SupabaseClient,
  client: { id: string; name: string; ghl_location_id?: string | null },
): Promise<ReplayResult> {
  const { data: pending, error } = await service
    .from('pending_events')
    .select('*')
    .eq('status', 'pending')
    .order('occurred_at', { ascending: true, nullsFirst: false })
    .order('received_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (pending ?? []).filter(r =>
    pendingEventMatchesClient(r as PendingEventRow, client),
  ) as PendingEventRow[];

  return replayPendingEventRows(service, client, rows);
}

export type ReconcilePendingResult = ReplayResult & {
  matched_rows: number;
  clients_touched: number;
};

/**
 * Self-heal stuck pending rows that now uniquely map to a roster client
 * (exact/normalized name, location id, or prior events for the same GHL contact).
 */
export async function reconcilePendingEvents(
  service: SupabaseClient,
): Promise<ReconcilePendingResult> {
  const { data: pending, error } = await service
    .from('pending_events')
    .select('*')
    .eq('status', 'pending')
    .order('occurred_at', { ascending: true, nullsFirst: false })
    .order('received_at', { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (pending ?? []) as PendingEventRow[];
  const empty: ReconcilePendingResult = {
    replayed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    matched_rows: 0,
    clients_touched: 0,
  };
  if (rows.length === 0) return empty;

  const { data: clients, error: clientErr } = await service
    .from('clients')
    .select('id, name, ghl_location_id');
  if (clientErr) throw new Error(clientErr.message);

  const contactIds = [
    ...new Set(
      rows
        .map(r => r.ghl_contact_id ?? jsonStringField(r.payload?.ghl_contact_id))
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const contactToClient = new Map<string, string>();
  const CHUNK = 100;
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const chunk = contactIds.slice(i, i + CHUNK);
    const { data: evs, error: evErr } = await service
      .from('events')
      .select('ghl_contact_id, client_id')
      .in('ghl_contact_id', chunk)
      .not('client_id', 'is', null);
    if (evErr) throw new Error(evErr.message);

    const bucket = new Map<string, Set<string>>();
    for (const ev of evs ?? []) {
      const gid = typeof ev.ghl_contact_id === 'string' ? ev.ghl_contact_id : '';
      const cid = typeof ev.client_id === 'string' ? ev.client_id : '';
      if (!gid || !cid) continue;
      const set = bucket.get(gid) ?? new Set<string>();
      set.add(cid);
      bucket.set(gid, set);
    }
    for (const [gid, set] of bucket) {
      if (set.size === 1) contactToClient.set(gid, [...set][0]!);
    }
  }

  const byClientId = new Map<string, PendingEventRow[]>();
  for (const row of rows) {
    const nameMatches = (clients ?? []).filter(c => pendingEventMatchesClient(row, c));
    let clientId: string | null =
      nameMatches.length === 1 ? (nameMatches[0]!.id as string) : null;

    if (!clientId) {
      const gid = row.ghl_contact_id ?? jsonStringField(row.payload?.ghl_contact_id);
      if (gid) clientId = contactToClient.get(gid) ?? null;
    }

    if (!clientId) continue;
    const list = byClientId.get(clientId) ?? [];
    list.push(row);
    byClientId.set(clientId, list);
  }

  const result: ReconcilePendingResult = {
    replayed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    matched_rows: 0,
    clients_touched: byClientId.size,
  };

  for (const [clientId, clientRows] of byClientId) {
    const client = (clients ?? []).find(c => c.id === clientId);
    if (!client) continue;
    result.matched_rows += clientRows.length;
    const part = await replayPendingEventRows(service, client, clientRows);
    result.replayed += part.replayed;
    result.skipped += part.skipped;
    result.failed += part.failed;
    result.errors.push(...part.errors);
  }

  return result;
}

/** After a client is created or its sub-account name is set, replay any queued events. */
export async function replayPendingForClientId(
  service: SupabaseClient,
  clientId: string,
): Promise<ReplayResult> {
  const { data: client, error } = await service
    .from('clients')
    .select('id, name, ghl_location_id')
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!client) return { replayed: 0, skipped: 0, failed: 0, errors: [] };
  return replayPendingEventsForClient(service, client);
}
