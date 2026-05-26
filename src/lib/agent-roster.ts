export type RosterAgent = { name: string; phone: string };

export function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Map raw event agent_name values to canonical roster names. */
export function buildRosterMatcher(agents: RosterAgent[]) {
  const byKey = new Map<string, string>();
  for (const agent of agents) {
    byKey.set(normalizeAgentKey(agent.name), agent.name);
    byKey.set(normalizeAgentKey(agent.phone), agent.name);
  }
  return (raw: string | null | undefined): string | null => {
    if (!raw?.trim()) return null;
    return byKey.get(normalizeAgentKey(raw.trim())) ?? null;
  };
}
