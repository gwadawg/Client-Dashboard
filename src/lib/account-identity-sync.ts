import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ACCOUNT_MEMBER_SELECT,
  pickAccountIdentityRootId,
  resolveIdentityClientId,
  type ClientIdentityRow,
} from '@/lib/client-identity';

export type IdentityLinkRepair = {
  client_id: string;
  previous_identity_client_id: string | null;
  identity_client_id: string;
};

/**
 * Align identity_client_id for every offer row in an account group.
 * Only updates the identity_client_id column on non-root rows — profile values
 * on each row are never overwritten here.
 */
export async function syncIdentityLinksForAccountGroup(
  service: SupabaseClient,
  accountGroupId: string,
): Promise<IdentityLinkRepair[]> {
  const { data: rows, error } = await service
    .from('clients')
    .select(ACCOUNT_MEMBER_SELECT)
    .eq('account_group_id', accountGroupId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const siblings = (rows ?? []) as unknown as ClientIdentityRow[];
  if (siblings.length <= 1) return [];

  const rootId = pickAccountIdentityRootId(siblings);
  if (!rootId) return [];

  const repairs: IdentityLinkRepair[] = [];
  for (const row of siblings) {
    if (row.id === rootId) continue;
    const current = row.identity_client_id ?? null;
    if (current === rootId) continue;
    const { error: updateErr } = await service
      .from('clients')
      .update({ identity_client_id: rootId })
      .eq('id', row.id)
      .eq('account_group_id', accountGroupId);
    if (updateErr) throw new Error(updateErr.message);
    repairs.push({
      client_id: row.id,
      previous_identity_client_id: current,
      identity_client_id: rootId,
    });
  }
  return repairs;
}

/**
 * All client row ids that belong to the same LO account (account group ∪ identity group).
 */
export async function resolveAccountMemberIds(
  service: SupabaseClient,
  clientId: string,
): Promise<string[]> {
  const ids = new Set<string>([clientId]);

  const { data: client, error: clientErr } = await service
    .from('clients')
    .select('id, account_group_id, identity_client_id')
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!client) return [clientId];

  const identityRootId = resolveIdentityClientId(client);

  if (client.account_group_id) {
    const { data: siblings, error: sibErr } = await service
      .from('clients')
      .select('id')
      .eq('account_group_id', client.account_group_id);
    if (sibErr) throw new Error(sibErr.message);
    for (const s of siblings ?? []) ids.add(s.id as string);
  }

  const { data: linked, error: linkErr } = await service
    .from('clients')
    .select('id')
    .or(`id.eq.${identityRootId},identity_client_id.eq.${identityRootId}`);
  if (linkErr) throw new Error(linkErr.message);
  for (const row of linked ?? []) ids.add(row.id as string);

  return [...ids];
}

/** Canonical client id for account-level calls, notes, and contacts. */
export async function resolveAccountIdentityClientId(
  service: SupabaseClient,
  clientId: string,
): Promise<string> {
  const { data: client, error } = await service
    .from('clients')
    .select(ACCOUNT_MEMBER_SELECT)
    .eq('id', clientId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!client) return clientId;

  const row = client as unknown as ClientIdentityRow;

  if (row.account_group_id) {
    const { data: siblings, error: sibErr } = await service
      .from('clients')
      .select(ACCOUNT_MEMBER_SELECT)
      .eq('account_group_id', row.account_group_id);
    if (sibErr) throw new Error(sibErr.message);
    const root = pickAccountIdentityRootId((siblings ?? []) as unknown as ClientIdentityRow[]);
    if (root) return root;
  }

  return resolveIdentityClientId(row);
}
