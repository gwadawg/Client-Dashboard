/**
 * Call-rep credit counts in the same shape payroll uses:
 * - bookings / live_transfers: agent on the event, dated by occurred_at
 * - shows: agent on the show event (after booking inheritance), dated by showPayDate
 *
 * Does not apply lifetime "already paid" bans — scorecards measure work in range.
 * Callers may pass shows already filtered with filterShowsOncePerLead (in-period only).
 */

import { showPayDate } from '@/lib/agent-commissions';

export type CallRepCreditEvent = {
  id?: string;
  event_type: string;
  agent_name: string | null | undefined;
  occurred_at: string | null | undefined;
  scheduled_at?: string | null;
  raw?: { recorded_at?: string | null } | null;
  client_id?: string | null;
  lead_name?: string | null;
  lead_phone?: string | null;
  lead_email?: string | null;
  ghl_contact_id?: string | null;
};

export type CallRepCreditCounts = {
  bookings: number;
  shows: number;
  live_transfers: number;
};

export function emptyCallRepCreditCounts(): CallRepCreditCounts {
  return { bookings: 0, shows: 0, live_transfers: 0 };
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function inDateRange(dateStr: string | null, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  return dateStr >= startDate && dateStr <= endDate;
}

/**
 * Same credit windowing as `buildCommissionReport` (payroll call-rep section).
 */
export function countCallRepCreditsByAgent(
  bookingAndTransferEvents: CallRepCreditEvent[],
  showEvents: CallRepCreditEvent[],
  resolveAgent: (raw: string | null | undefined) => string | null,
  startDate: string,
  endDate: string,
): Map<string, CallRepCreditCounts> {
  const byAgent = new Map<string, CallRepCreditCounts>();

  function bump(agent: string, key: keyof CallRepCreditCounts) {
    const c = byAgent.get(agent) ?? emptyCallRepCreditCounts();
    c[key]++;
    byAgent.set(agent, c);
  }

  for (const row of bookingAndTransferEvents) {
    const name = resolveAgent(row.agent_name);
    if (!name) continue;
    const payDate = dateOnly(row.occurred_at);
    if (!inDateRange(payDate, startDate, endDate)) continue;

    if (row.event_type === 'appointment_booked') bump(name, 'bookings');
    else if (row.event_type === 'live_transfer') bump(name, 'live_transfers');
  }

  for (const row of showEvents) {
    if (row.event_type && row.event_type !== 'show') continue;
    const name = resolveAgent(row.agent_name);
    if (!name) continue;
    const payDate = showPayDate({
      scheduled_at: row.scheduled_at ?? null,
      occurred_at: row.occurred_at ?? null,
      raw: row.raw
        ? { recorded_at: row.raw.recorded_at ?? undefined }
        : null,
    });
    if (!inDateRange(payDate, startDate, endDate)) continue;
    bump(name, 'shows');
  }

  return byAgent;
}

/** PostgREST filter used by payroll for show pay-window events. */
export function showEventsPayWindowOrFilter(startDate: string, endDate: string): string {
  return `and(scheduled_at.gte.${startDate}T00:00:00.000Z,scheduled_at.lte.${endDate}T23:59:59.999Z),scheduled_at.is.null`;
}
