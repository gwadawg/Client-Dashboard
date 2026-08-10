import { buildRosterMatcher } from '@/lib/agent-roster';
import type { EnrichedAgentBooking } from '@/lib/agent-appointment-stats';
import type { NonShowAppointmentItem } from '@/lib/payroll-common';

type RosterEntry = { id: string; name: string; phone: string };

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function inDateRange(dateStr: string | null, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  return dateStr >= startDate && dateStr <= endDate;
}

/**
 * Bookings whose appointment slot falls in the payroll period and still have no disposition (pending only).
 * Date key is always scheduled_at (appointment date), never booking date.
 * Cancel / no-show / LO bailed / reschedule are excluded.
 */
export function bucketCallRepNonShowAppointments(
  roster: RosterEntry[],
  enriched: EnrichedAgentBooking[],
  startDate: string,
  endDate: string,
): Map<string, NonShowAppointmentItem[]> {
  const byAgentId = new Map<string, NonShowAppointmentItem[]>();
  for (const agent of roster) byAgentId.set(agent.id, []);

  const nameToId = new Map(roster.map(a => [a.name, a.id]));
  const resolveAgent = buildRosterMatcher(roster);

  for (const row of enriched) {
    const slotDate = dateOnly(row.scheduled_at);
    if (!inDateRange(slotDate, startDate, endDate)) continue;
    if (row.status !== 'pending') continue;

    const name = resolveAgent(row.agent_name);
    if (!name) continue;

    const agentId = nameToId.get(name);
    if (!agentId) continue;

    byAgentId.get(agentId)!.push({
      id: row.id,
      date: slotDate!,
      lead_name: row.lead_name,
      status: 'pending',
      type: 'Pending',
    });
  }

  for (const [, items] of byAgentId) {
    items.sort((a, b) => a.date.localeCompare(b.date));
  }

  return byAgentId;
}
