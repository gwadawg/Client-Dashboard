import type { SupabaseClient } from '@supabase/supabase-js';
import { clientNamesMatch } from '@/lib/client-name-match';
import { clientsLikelySameClient } from '@/lib/client-ghl-mapping';

export type ClientConflict = {
  id: string;
  name: string;
  primary_contact_name: string | null;
  email: string | null;
  ghl_location_id: string | null;
  reason: 'exact_name' | 'similar_name' | 'email' | 'ghl_location_id' | 'person_name';
};

export type ClientConflictResult = {
  blocked: boolean;
  conflicts: ClientConflict[];
};

type ConflictInput = {
  name?: string | null;
  email?: string | null;
  ghl_location_id?: string | null;
  primary_contact_name?: string | null;
  excludeId?: string | null;
  /** When adding a linked offer row, allow siblings that share this identity. */
  linkedIdentityClientId?: string | null;
};

function trimOrNull(v: string | null | undefined): string | null {
  const s = v?.trim();
  return s || null;
}

/** When editing one offer row, sibling rows in the same account group are expected duplicates. */
async function resolveExcludedClientIds(
  service: SupabaseClient,
  excludeId: string | null,
): Promise<Set<string>> {
  const excluded = new Set<string>();
  if (!excludeId) return excluded;

  excluded.add(excludeId);

  const { data: client, error } = await service
    .from('clients')
    .select('account_group_id')
    .eq('id', excludeId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const groupId = client?.account_group_id;
  if (!groupId) return excluded;

  const { data: siblings, error: siblingErr } = await service
    .from('clients')
    .select('id')
    .eq('account_group_id', groupId);
  if (siblingErr) throw new Error(siblingErr.message);

  for (const sibling of siblings ?? []) {
    excluded.add(sibling.id);
  }
  return excluded;
}

export async function findClientConflicts(
  service: SupabaseClient,
  input: ConflictInput,
): Promise<ClientConflictResult> {
  const name = trimOrNull(input.name);
  const email = trimOrNull(input.email);
  const ghlLocationId = trimOrNull(input.ghl_location_id);
  const personName = trimOrNull(input.primary_contact_name);
  const excludeId = trimOrNull(input.excludeId);
  const linkedIdentityClientId = trimOrNull(input.linkedIdentityClientId);
  const excludedIds = await resolveExcludedClientIds(service, excludeId);

  const { data: clients, error } = await service
    .from('clients')
    .select('id, name, primary_contact_name, email, ghl_location_id, identity_client_id');
  if (error) throw new Error(error.message);

  function isLinkedSibling(c: { id: string; identity_client_id?: string | null }): boolean {
    if (!linkedIdentityClientId) return false;
    return c.id === linkedIdentityClientId || c.identity_client_id === linkedIdentityClientId;
  }

  const conflicts: ClientConflict[] = [];
  const seen = new Set<string>();

  function add(conflict: ClientConflict) {
    if (excludedIds.has(conflict.id)) return;
    if (seen.has(conflict.id)) return;
    seen.add(conflict.id);
    conflicts.push(conflict);
  }

  for (const c of clients ?? []) {
    if (excludedIds.has(c.id)) continue;
    if (isLinkedSibling(c)) continue;

    if (ghlLocationId && c.ghl_location_id === ghlLocationId) {
      add({ ...c, reason: 'ghl_location_id' });
      continue;
    }

    if (email && c.email && c.email.toLowerCase() === email.toLowerCase()) {
      add({ ...c, reason: 'email' });
      continue;
    }

    if (name) {
      if (c.name === name) {
        add({ ...c, reason: 'exact_name' });
        continue;
      }
      if (clientNamesMatch(c.name, name) || clientsLikelySameClient(c.name, name)) {
        add({ ...c, reason: 'similar_name' });
        continue;
      }
    }

    if (personName && c.primary_contact_name) {
      if (clientNamesMatch(c.primary_contact_name, personName)) {
        add({ ...c, reason: 'person_name' });
        continue;
      }
    }

    if (personName && clientsLikelySameClient(c.name, personName)) {
      add({ ...c, reason: 'similar_name' });
    }
  }

  return { blocked: conflicts.length > 0, conflicts };
}

export function formatClientConflictMessage(conflicts: ClientConflict[]): string {
  if (!conflicts.length) return 'A similar client already exists.';
  const top = conflicts[0];
  const label = top.primary_contact_name
    ? `${top.name} (${top.primary_contact_name})`
    : top.name;
  if (conflicts.length === 1) {
    return `A client already exists: "${label}". Open that file and set the GHL sub-account name — do not create a second row.`;
  }
  return `${conflicts.length} similar clients already exist (e.g. "${label}"). Update the existing file instead of creating a duplicate.`;
}
