import { leadIdentityKey } from '@/lib/metrics';

export type ShowLtLeadRow = {
  agent_name: string | null;
  client_id?: string | null;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  lead_name?: string | null;
};

/**
 * Unique-lead Conversations (show ∪ live_transfer) per agent — payroll credit rules.
 * Shows credit the **show event** agent (same as call-rep pay); LTs credit the LT agent.
 * Same lead with both events counts once for that agent.
 */
export function countShowLtConversationsByAgent(
  payShows: ShowLtLeadRow[],
  liveTransfers: ShowLtLeadRow[],
  resolveAgent: (raw: string | null | undefined) => string | null,
): Map<string, number> {
  const keysByAgent = new Map<string, Set<string>>();

  function add(agentRaw: string | null | undefined, row: ShowLtLeadRow) {
    const agent = resolveAgent(agentRaw);
    if (!agent) return;
    const key = leadIdentityKey({
      client_id: row.client_id,
      ghl_contact_id: row.ghl_contact_id,
      lead_phone: row.lead_phone,
      lead_email: row.lead_email,
      lead_name: row.lead_name,
    });
    if (!key) return;
    const set = keysByAgent.get(agent) ?? new Set<string>();
    set.add(key);
    keysByAgent.set(agent, set);
  }

  for (const show of payShows) {
    add(show.agent_name, show);
  }

  for (const lt of liveTransfers) {
    add(lt.agent_name, lt);
  }

  const counts = new Map<string, number>();
  for (const [agent, keys] of keysByAgent) {
    counts.set(agent, keys.size);
  }
  return counts;
}

export { calendarMonthOf } from '@/lib/calendar-month';
