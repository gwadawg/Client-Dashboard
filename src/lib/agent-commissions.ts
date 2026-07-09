import { buildRosterMatcher } from '@/lib/agent-roster';
import { computeFixedPay, type PendingDisposition } from '@/lib/payroll-common';

export type AgentPayRates = {
  base_salary: number;
  monthly_bonus: number;
  pay_per_booking: number;
  pay_per_show: number;
  pay_per_live_transfer: number;
};

export type RosterAgentWithPay = {
  id: string;
  name: string;
  phone: string;
  pay_type?: string;
  base_salary_prorate_days?: number | null;
  pay_per_qualified_demo?: number;
  pay_per_close?: number;
} & AgentPayRates;

export type CommissionLineItem = {
  type: 'booking' | 'show' | 'live_transfer';
  event_id: string;
  date: string;
  lead_name: string | null;
  lead_phone: string | null;
  client_name: string;
  unit_pay: number;
};

export type AgentCommissionRow = {
  agent_id: string;
  agent_name: string;
  rates: AgentPayRates;
  counts: { bookings: number; shows: number; live_transfers: number };
  amounts: {
    base: number;
    bonus: number;
    bookings: number;
    shows: number;
    live_transfers: number;
    total: number;
  };
  line_items: CommissionLineItem[];
  pending_disposition: PendingDisposition;
};

export type CommissionReport = {
  period: { startDate: string; endDate: string };
  unassigned: { bookings: number; shows: number; live_transfers: number };
  agents: AgentCommissionRow[];
};

export type UnifiedPayrollReport = {
  period: { startDate: string; endDate: string };
  summary: {
    call_reps_total: number;
    b2b_setters_total: number;
    salaried_total: number;
    grand_total: number;
    call_rep_count: number;
    b2b_setter_count: number;
    salaried_count: number;
  };
  call_reps: CommissionReport;
  b2b_setters: import('@/lib/b2b-setter-commissions').B2BSetterCommissionReport;
  salaried: import('@/lib/salaried-commissions').SalariedCommissionReport;
  /** @deprecated Use call_reps.agents */
  agents?: AgentCommissionRow[];
};

type EventRow = {
  id: string;
  client_id: string;
  event_type: string;
  agent_name: string | null;
  occurred_at: string | null;
  scheduled_at: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  raw: { recorded_at?: string } | null;
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

/** Show pay date: scheduled_at → raw.recorded_at → occurred_at */
export function showPayDate(row: Pick<EventRow, 'scheduled_at' | 'occurred_at' | 'raw'>): string | null {
  return dateOnly(row.scheduled_at) ?? dateOnly(row.raw?.recorded_at) ?? dateOnly(row.occurred_at);
}

function inDateRange(dateStr: string | null, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  return dateStr >= startDate && dateStr <= endDate;
}

function emptyAccumulator(agent: RosterAgentWithPay, periodStart: string): AgentCommissionRow {
  const rates: AgentPayRates = {
    base_salary: toNum(agent.base_salary),
    monthly_bonus: toNum(agent.monthly_bonus),
    pay_per_booking: toNum(agent.pay_per_booking),
    pay_per_show: toNum(agent.pay_per_show),
    pay_per_live_transfer: toNum(agent.pay_per_live_transfer),
  };
  const fixed = computeFixedPay(
    rates.base_salary,
    rates.monthly_bonus,
    agent.base_salary_prorate_days,
    periodStart,
  );
  return {
    agent_id: agent.id,
    agent_name: agent.name,
    rates,
    counts: { bookings: 0, shows: 0, live_transfers: 0 },
    amounts: {
      base: fixed.base,
      bonus: fixed.bonus,
      bookings: 0,
      shows: 0,
      live_transfers: 0,
      total: fixed.base + fixed.bonus,
    },
    line_items: [],
    pending_disposition: { count: 0, items: [] },
  };
}

function finalizeRow(row: AgentCommissionRow): AgentCommissionRow {
  const { rates, counts } = row;
  const bookingsAmt = counts.bookings * rates.pay_per_booking;
  const showsAmt = counts.shows * rates.pay_per_show;
  const transfersAmt = counts.live_transfers * rates.pay_per_live_transfer;
  const total = row.amounts.base + row.amounts.bonus + bookingsAmt + showsAmt + transfersAmt;
  row.line_items.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  row.amounts = {
    ...row.amounts,
    bookings: bookingsAmt,
    shows: showsAmt,
    live_transfers: transfersAmt,
    total,
  };
  return row;
}

export function attachCallRepPendingDisposition(
  rows: AgentCommissionRow[],
  pendingByAgentId: Map<string, import('@/lib/payroll-common').PendingDispositionItem[]>,
): AgentCommissionRow[] {
  return rows.map(row => {
    const items = pendingByAgentId.get(row.agent_id) ?? [];
    return {
      ...row,
      pending_disposition: { count: items.length, items },
    };
  });
}

export function buildCommissionReport(
  roster: RosterAgentWithPay[],
  clients: { id: string; name: string }[],
  bookingAndTransferEvents: EventRow[],
  showEvents: EventRow[],
  startDate: string,
  endDate: string,
): CommissionReport {
  const clientName = new Map(clients.map(c => [c.id, c.name]));
  const resolveAgent = buildRosterMatcher(roster);
  const unassigned = { bookings: 0, shows: 0, live_transfers: 0 };

  const agentByName = new Map<string, AgentCommissionRow>();
  for (const agent of roster) {
    agentByName.set(agent.name, emptyAccumulator(agent, startDate));
  }

  for (const row of bookingAndTransferEvents) {
    const name = resolveAgent(row.agent_name);
    if (!name) {
      if (row.event_type === 'appointment_booked') unassigned.bookings++;
      else if (row.event_type === 'live_transfer') unassigned.live_transfers++;
      continue;
    }

    const payDate = dateOnly(row.occurred_at);
    if (!inDateRange(payDate, startDate, endDate)) continue;

    const acc = agentByName.get(name);
    if (!acc) continue;

    const client = clientName.get(row.client_id) ?? 'Unknown';

    if (row.event_type === 'appointment_booked') {
      acc.counts.bookings++;
      acc.line_items.push({
        type: 'booking',
        event_id: row.id,
        date: payDate!,
        lead_name: row.lead_name,
        lead_phone: row.lead_phone,
        client_name: client,
        unit_pay: acc.rates.pay_per_booking,
      });
    } else if (row.event_type === 'live_transfer') {
      acc.counts.live_transfers++;
      acc.line_items.push({
        type: 'live_transfer',
        event_id: row.id,
        date: payDate!,
        lead_name: row.lead_name,
        lead_phone: row.lead_phone,
        client_name: client,
        unit_pay: acc.rates.pay_per_live_transfer,
      });
    }
  }

  for (const row of showEvents) {
    if (row.event_type !== 'show') continue;

    const name = resolveAgent(row.agent_name);
    if (!name) {
      unassigned.shows++;
      continue;
    }

    const payDate = showPayDate(row);
    if (!inDateRange(payDate, startDate, endDate)) continue;

    const acc = agentByName.get(name);
    if (!acc) continue;

    acc.counts.shows++;
    acc.line_items.push({
      type: 'show',
      event_id: row.id,
      date: payDate!,
      lead_name: row.lead_name,
      lead_phone: row.lead_phone,
      client_name: clientName.get(row.client_id) ?? 'Unknown',
      unit_pay: acc.rates.pay_per_show,
    });
  }

  const agents = [...agentByName.values()]
    .map(finalizeRow)
    .filter(
      a =>
        a.counts.bookings > 0 ||
        a.counts.shows > 0 ||
        a.counts.live_transfers > 0 ||
        a.rates.base_salary > 0 ||
        a.rates.monthly_bonus > 0,
    )
    .sort((a, b) => b.amounts.total - a.amounts.total);

  return {
    period: { startDate, endDate },
    unassigned,
    agents,
  };
}
