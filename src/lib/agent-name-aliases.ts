/** Maps misspelled / alternate GHL agent_name values → canonical roster name. */
export const AGENT_NAME_ALIASES: Record<string, string> = {
  'Bernado Fabris': 'Bernardo Fabris',
};

export function canonicalAgentAlias(raw: string): string {
  const trimmed = raw.trim();
  return AGENT_NAME_ALIASES[trimmed] ?? trimmed;
}

/** Rewrite known misspellings before persisting agent_name on events. */
export function normalizeStoredAgentName(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  return canonicalAgentAlias(raw.trim());
}
