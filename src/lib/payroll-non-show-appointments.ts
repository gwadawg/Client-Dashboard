import { buildRosterMatcher } from '@/lib/agent-roster';
import type { EnrichedAgentBooking } from '@/lib/agent-appointment-stats';
import type {
  NonShowAppointmentItem,
  NonShowAppointmentStatus,
} from '@/lib/payroll-common';

type RosterEntry = { id: string; name: string; phone: string };

const STATUS_LABELS: Record<NonShowAppointmentStatus, string> = {
  pending: 'Pending',
  no_show: 'No show',
  appointment_cancelled: 'Cancelled',
  appointment_rescheduled: 'Rescheduled',
  lo_bailed: 'LO bailed',
};

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function inDateRange(dateStr: string | null, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  return dateStr >= startDate && dateStr <= endDate;
}

function isNonShowStatus(status: string): status is NonShowAppointmentStatus {
  return status !== 'show' && status in STATUS_LABELS;
}

/**
 * Bookings whose appointment slot falls in the payroll period and are not dispositioned as Show.
 * Date key is always scheduled_at (appointment date), never booking date.
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
    if (!isNonShowStatus(row.status)) continue;

    const name = resolveAgent(row.agent_name);
    if (!name) continue;

    const agentId = nameToId.get(name);
    if (!agentId) continue;

    byAgentId.get(agentId)!.push({
      id: row.id,
      date: slotDate!,
      lead_name: row.lead_name,
      status: row.status,
      type: STATUS_LABELS[row.status],
    });
  }

  for (const [, items] of byAgentId) {
    items.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  }

  return byAgentId;
}
