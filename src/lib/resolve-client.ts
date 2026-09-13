import type { SupabaseClient } from '@supabase/supabase-js';
import { clientNamesMatch } from '@/lib/client-name-match';

function trimId(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s || undefined;
}

export type ResolveClientInput = {
  client_id?: unknown;
  client_name?: unknown;
  ghl_location_id?: unknown;
  location_id?: unknown;
  ghl_contact_id?: unknown;
};

async function findClientByNormalizedName(
  service: SupabaseClient,
  clientName: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await service.from('clients').select('id, name');
  if (error) {
    console.error('[resolve-client] normalized name lookup failed', error.message);
    return null;
  }
  const matches = (data ?? []).filter(c => clientNamesMatch(c.name, clientName));
  if (matches.length !== 1) return null;
  return matches[0] ?? null;
}

async function findUniqueClientId(
  service: SupabaseClient,
  column: 'ghl_location_id' | 'name',
  value: string,
): Promise<{ client_id: string } | { error: string; status: 500 } | null> {
  const { data, error } = await service.from('clients').select('id').eq(column, value).limit(2);
  if (error) {
    console.error(`[resolve-client] ${column} lookup failed`, error.message);
    return { error: error.message, status: 500 };
  }
  if (!data?.length) return null;
  if (data.length > 1) return null;
  return { client_id: data[0]!.id as string };
}

async function findClientIdByPriorContact(
  service: SupabaseClient,
  ghlContactId: string,
): Promise<{ client_id: string } | { error: string; status: 500 } | null> {
  const { data, error } = await service
    .from('events')
    .select('client_id')
    .eq('ghl_contact_id', ghlContactId)
    .not('client_id', 'is', null)
    .limit(20);
  if (error) {
    console.error('[resolve-client] ghl_contact_id prior-event lookup failed', error.message);
    return { error: error.message, status: 500 };
  }
  const ids = [
    ...new Set(
      (data ?? [])
        .map(r => (typeof r.client_id === 'string' ? r.client_id.trim() : ''))
        .filter(Boolean),
    ),
  ];
  if (ids.length !== 1) return null;
  return { client_id: ids[0]! };
}

export async function resolveClientId(
  service: SupabaseClient,
  payload: ResolveClientInput,
  jsonStringField: (v: unknown) => string | null,
): Promise<{ client_id: string } | { error: string; status: 400 | 500 }> {
  const directId = trimId(payload.client_id);
  if (directId) return { client_id: directId };

  const ghlLocationId =
    jsonStringField(payload.ghl_location_id) ??
    jsonStringField(payload.location_id) ??
    undefined;

  if (ghlLocationId) {
    const byLoc = await findUniqueClientId(service, 'ghl_location_id', ghlLocationId);
    if (byLoc && 'error' in byLoc) return byLoc;
    if (byLoc && 'client_id' in byLoc) return byLoc;
  }

  const client_name = jsonStringField(payload.client_name) ?? undefined;
  if (client_name) {
    const exact = await findUniqueClientId(service, 'name', client_name);
    if (exact && 'error' in exact) return exact;
    if (exact && 'client_id' in exact) return exact;

    const normalized = await findClientByNormalizedName(service, client_name);
    if (normalized) return { client_id: normalized.id };
  }

  // Bad / placeholder sub-account names (e.g. "Not Synced") still map when this
  // contact already has events under exactly one client file.
  const ghlContactId = jsonStringField(payload.ghl_contact_id) ?? undefined;
  if (ghlContactId) {
    const byContact = await findClientIdByPriorContact(service, ghlContactId);
    if (byContact && 'error' in byContact) return byContact;
    if (byContact && 'client_id' in byContact) return byContact;
  }

  if (client_name) {
    const hint = ghlLocationId
      ? `Client not found for ghl_location_id "${ghlLocationId}" or name "${client_name}".`
      : `Client "${client_name}" not found — sub-account name must match clients.name in the roster (spacing and apostrophes are normalized).`;
    return { error: hint, status: 400 };
  }

  if (ghlLocationId) {
    return {
      error: `Client not found for ghl_location_id "${ghlLocationId}".`,
      status: 400,
    };
  }

  return { error: 'client_id, ghl_location_id, or client_name is required', status: 400 };
}
