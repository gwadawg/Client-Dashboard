/** Maps misspelled / alternate GHL agent_name values → canonical roster name. */
export const AGENT_NAME_ALIASES: Record<string, string> = {
  'Bernado Fabris': 'Bernardo Fabris',
};

export function canonicalAgentAlias(raw: string): string {
  const trimmed = raw.trim();
  return AGENT_NAME_ALIASES[trimmed] ?? trimmed;
}
