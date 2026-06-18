import { AGENT_NAME_ALIASES, canonicalAgentAlias } from './agent-name-aliases';

export type RosterAgent = { name: string; phone: string };

export function normalizeAgentKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
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
    const canonical = canonicalAgentAlias(raw.trim());
    return byKey.get(normalizeAgentKey(canonical)) ?? null;
  };
}

/** Raw agent_name values on events that resolve to this roster agent (name + phone + aliases). */
export function rosterAliasesForAgent(agents: RosterAgent[], canonicalName: string): string[] {
  const agent = agents.find(a => a.name === canonicalName);
  const aliasSources = Object.entries(AGENT_NAME_ALIASES)
    .filter(([, target]) => target === canonicalName)
    .map(([source]) => source);

  const values = [
    ...(agent ? [agent.name, agent.phone] : []),
    ...aliasSources,
  ];
  return [...new Set(values.filter((v): v is string => !!v && v.trim().length > 0))];
}

export { canonicalAgentAlias };
