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

/**
 * GHL / Make sometimes send an LO office name while the roster uses the
 * business / brand sub-account name. Map those webhook strings → roster name
 * before resolve / pending match.
 */
export const CLIENT_NAME_ALIASES: Record<string, string> = {
  // GHL sub-account still labeled with LO office; roster + brand = Green Monarch.
  "Dave Bancroft's Office": 'Green Monarch Inc',
};

export function canonicalClientName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  const direct = CLIENT_NAME_ALIASES[trimmed];
  if (direct) return direct;
  const norm = normalizeClientNameForMatch(trimmed);
  for (const [from, to] of Object.entries(CLIENT_NAME_ALIASES)) {
    if (normalizeClientNameForMatch(from) === norm) return to;
  }
  return trimmed;
}

export function clientNamesMatch(a: string, b: string): boolean {
  return (
    normalizeClientNameForMatch(canonicalClientName(a)) ===
    normalizeClientNameForMatch(canonicalClientName(b))
  );
}
