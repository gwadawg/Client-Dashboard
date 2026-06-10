import type { SupabaseClient } from '@supabase/supabase-js';

let cachedUsers: Map<string, string> | null = null;
let cacheAt = 0;
const CACHE_MS = 60_000;

/** Resolve auth user ids to email labels for CRM attribution. */
export async function resolveUserLabels(
  service: SupabaseClient,
  ids: Array<string | null | undefined>,
): Promise<Record<string, string>> {
  const wanted = [...new Set(ids.filter((id): id is string => !!id))];
  if (wanted.length === 0) return {};

  const now = Date.now();
  if (!cachedUsers || now - cacheAt > CACHE_MS) {
    const { data, error } = await service.auth.admin.listUsers({ perPage: 500 });
    if (error) return Object.fromEntries(wanted.map(id => [id, shortId(id)]));
    cachedUsers = new Map(
      (data.users ?? []).map(u => [u.id, u.email ?? shortId(u.id)]),
    );
    cacheAt = now;
  }

  const out: Record<string, string> = {};
  for (const id of wanted) {
    out[id] = cachedUsers.get(id) ?? shortId(id);
  }
  return out;
}

function shortId(id: string): string {
  return id.slice(0, 8);
}
