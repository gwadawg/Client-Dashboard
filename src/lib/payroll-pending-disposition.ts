import {
  creditQueueEventOrFilter,
  creditQueueUncreditedAgentOrFilter,
  isCreditQueueEligibleEvent,
  needsAgentCredit,
} from '@/lib/credit-queue-eligibility';
import {
  inferRosterNameFromHints,
  type PendingDispositionItem,
} from '@/lib/payroll-common';

type RosterEntry = { id: string; name: string; phone: string };

type CreditEventRow = {
  id: string;
  event_type: string;
  occurred_at: string | null;
  scheduled_at: string | null;
  calendar_name: string | null;
  lead_name: string | null;
  agent_name: string | null;
};

type B2BPendingRow = {
  id: string;
  lead_name: string | null;
  scheduled_at: string | null;
  setter_name: string | null;
  call_taken_by: string | null;
  intro_call_id: string | null;
};

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function inDateRange(dateStr: string | null, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  return dateStr >= startDate && dateStr <= endDate;
}

function needsSetterCredit(setterName: string | null | undefined): boolean {
  const trimmed = setterName?.trim();
  if (!trimmed) return true;
  return trimmed === '#N/A' || trimmed.toLowerCase() === 'n/a';
}

function eventPayDate(row: CreditEventRow): string | null {
  return dateOnly(row.occurred_at) ?? dateOnly(row.scheduled_at);
}

const EVENT_TYPE_LABELS: Record<string, string> = {
  appointment_booked: 'Uncredited booking',
  callback_booked: 'Uncredited callback',
  live_transfer: 'Uncredited live transfer',
};

/** Uncredited fulfillment events in period, bucketed by inferred roster employee. */
export function bucketCallRepPendingDisposition(
  roster: RosterEntry[],
  events: CreditEventRow[],
  startDate: string,
  endDate: string,
): Map<string, PendingDispositionItem[]> {
  const byAgentId = new Map<string, PendingDispositionItem[]>();
  for (const agent of roster) byAgentId.set(agent.id, []);

  const nameToId = new Map(roster.map(a => [a.name, a.id]));

  for (const row of events) {
    if (!isCreditQueueEligibleEvent(row.event_type, row.calendar_name, row.agent_name)) continue;
    if (!needsAgentCredit(row.agent_name)) continue;

    const payDate = eventPayDate(row);
    if (!inDateRange(payDate, startDate, endDate)) continue;

    const inferred = inferRosterNameFromHints(roster, [row.agent_name]);
    if (!inferred) continue;

    const agentId = nameToId.get(inferred);
    if (!agentId) continue;

    byAgentId.get(agentId)!.push({
      id: row.id,
      date: payDate!,
      lead_name: row.lead_name,
      type: EVENT_TYPE_LABELS[row.event_type] ?? row.event_type,
    });
  }

  return byAgentId;
}

/** Uncredited B2B demo appointments in period (not dispositioned), bucketed by inferred setter. */
export function bucketB2BSetterPendingDisposition(
  roster: RosterEntry[],
  appointments: B2BPendingRow[],
  startDate: string,
  endDate: string,
): Map<string, PendingDispositionItem[]> {
  const byAgentId = new Map<string, PendingDispositionItem[]>();
  for (const agent of roster) byAgentId.set(agent.id, []);

  const nameToId = new Map(roster.map(a => [a.name, a.id]));

  for (const row of appointments) {
    if (row.intro_call_id) continue;
    if (!needsSetterCredit(row.setter_name)) continue;

    const payDate = dateOnly(row.scheduled_at);
    if (!inDateRange(payDate, startDate, endDate)) continue;

    const inferred = inferRosterNameFromHints(roster, [row.setter_name, row.call_taken_by]);
    if (!inferred) continue;

    const agentId = nameToId.get(inferred);
    if (!agentId) continue;

    byAgentId.get(agentId)!.push({
      id: row.id,
      date: payDate!,
      lead_name: row.lead_name,
      type: 'Uncredited demo',
    });
  }

  return byAgentId;
}

export const CREDIT_QUEUE_OR_FILTER = creditQueueEventOrFilter();
export const CREDIT_QUEUE_UNCREDITED_FILTER = creditQueueUncreditedAgentOrFilter();
