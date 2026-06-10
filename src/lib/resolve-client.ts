import type { SupabaseClient } from '@supabase/supabase-js';

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
    const { data: client, error: clientErr } = await service
      .from('clients')
      .select('id')
      .eq('name', client_name)
      .maybeSingle();
    if (clientErr) {
      console.error('[resolve-client] client_name lookup failed', clientErr.message);
      return { error: clientErr.message, status: 500 };
    }
    if (!client) {
      const hint = ghlLocationId
        ? `Client not found for ghl_location_id "${ghlLocationId}" or name "${client_name}".`
        : `Client "${client_name}" not found — must match clients.name in Supabase exactly.`;
      return { error: hint, status: 400 };
    }
    return { client_id: client.id };
  }

  return { error: 'client_id, ghl_location_id, or client_name is required', status: 400 };
}
