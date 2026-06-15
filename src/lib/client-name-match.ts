/** Normalize sub-account names so minor spelling differences still match webhooks. */
export function normalizeClientNameForMatch(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[''`´]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function clientNamesMatch(a: string, b: string): boolean {
  return normalizeClientNameForMatch(a) === normalizeClientNameForMatch(b);
}
