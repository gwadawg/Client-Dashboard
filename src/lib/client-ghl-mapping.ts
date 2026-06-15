import { clientNamesMatch, normalizeClientNameForMatch } from '@/lib/client-name-match';

/** Strip trailing "office" tokens for person ↔ sub-account comparison. */
export function clientNameStem(name: string): string {
  return normalizeClientNameForMatch(name).replace(/\s*(s office|office)\s*$/i, '').trim();
}

/** True when sub-account name still looks like the person name (webhooks will not map reliably). */
export function clientNeedsGhlMapping(client: {
  name?: string | null;
  primary_contact_name?: string | null;
}): boolean {
  const sub = client.name?.trim() ?? '';
  const person = client.primary_contact_name?.trim() ?? '';
  if (!sub) return true;
  if (!person) return false;
  return clientNamesMatch(sub, person);
}

export function clientsLikelySameClient(a: string, b: string): boolean {
  if (clientNamesMatch(a, b)) return true;
  const stemA = clientNameStem(a);
  const stemB = clientNameStem(b);
  if (stemA.length < 3 || stemB.length < 3) return false;
  return stemA === stemB;
}
