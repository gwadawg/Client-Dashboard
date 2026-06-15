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
    const { data: client, error: clientErr } = await service
      .from('clients')
      .select('id')
      .eq('ghl_location_id', ghlLocationId)
      .maybeSingle();
    if (clientErr) {
      console.error('[resolve-client] ghl_location_id lookup failed', clientErr.message);
      return { error: clientErr.message, status: 500 };
    }
    if (client) return { client_id: client.id };
  }

  const client_name = jsonStringField(payload.client_name) ?? undefined;
  if (client_name) {
    const { data: exact, error: exactErr } = await service
      .from('clients')
      .select('id')
      .eq('name', client_name)
      .maybeSingle();
    if (exactErr) {
      console.error('[resolve-client] client_name lookup failed', exactErr.message);
      return { error: exactErr.message, status: 500 };
    }
    if (exact) return { client_id: exact.id };

    const { data: ciMatch, error: ciErr } = await service
      .from('clients')
      .select('id')
      .ilike('name', client_name)
      .maybeSingle();
    if (ciErr) {
      console.error('[resolve-client] case-insensitive name lookup failed', ciErr.message);
      return { error: ciErr.message, status: 500 };
    }
    if (ciMatch) return { client_id: ciMatch.id };

    const normalized = await findClientByNormalizedName(service, client_name);
    if (normalized) return { client_id: normalized.id };

    const hint = ghlLocationId
      ? `Client not found for ghl_location_id "${ghlLocationId}" or name "${client_name}".`
      : `Client "${client_name}" not found — sub-account name must match clients.name in the roster (spacing and apostrophes are normalized).`;
    return { error: hint, status: 400 };
  }

  return { error: 'client_id, ghl_location_id, or client_name is required', status: 400 };
}
