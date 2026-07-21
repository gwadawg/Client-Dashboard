import { leadIdentityKey } from '@/lib/metrics';
import type { EnrichedAgentBooking } from '@/lib/agent-appointment-stats';

export type ShowLtLeadRow = {
  agent_name: string | null;
  client_id?: string | null;
  ghl_contact_id?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  lead_name?: string | null;
};

/**
 * Unique-lead Conversations (show ∪ live_transfer) per agent.
 * Shows credit the booking agent; LTs credit the LT event agent.
 * Same lead with both events counts once for that agent (and once per agent
 * if credited differently — rare).
 */
export function countShowLtConversationsByAgent(
  showBookings: EnrichedAgentBooking[],
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

  for (const booking of showBookings) {
    if (booking.status !== 'show') continue;
    add(booking.agent_name, booking);
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
