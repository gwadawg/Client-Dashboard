import { buildRosterMatcher } from '@/lib/agent-roster';
import {
  computeFixedPay,
  type PendingDisposition,
  type PendingDispositionItem,
} from '@/lib/payroll-common';

export type B2BSetterPayRates = {
  base_salary: number;
  monthly_bonus: number;
  pay_per_qualified_demo: number;
  pay_per_close: number;
};

export type RosterB2BSetterWithPay = {
  id: string;
  name: string;
  phone: string;
  base_salary_prorate_days?: number | null;
} & B2BSetterPayRates;

export type B2BSetterLineItem = {
  type: 'qualified_demo' | 'close';
  event_id: string;
  date: string;
  lead_name: string | null;
  lead_phone: string | null;
  unit_pay: number;
};

export type B2BSetterCommissionRow = {
  agent_id: string;
  agent_name: string;
  rates: B2BSetterPayRates;
  counts: { qualified_demos: number; closes: number };
  amounts: {
    base: number;
    bonus: number;
    qualified_demos: number;
    closes: number;
    total: number;
  };
  line_items: B2BSetterLineItem[];
  pending_disposition: PendingDisposition;
};

export type B2BSetterCommissionReport = {
  period: { startDate: string; endDate: string };
  unassigned: { qualified_demos: number; closes: number };
  agents: B2BSetterCommissionRow[];
};

type DemoRow = {
  id: string;
  lead_name: string | null;
  phone: string | null;
  scheduled_at: string | null;
  status: string;
  qualified: boolean | null;
  setter_name: string | null;
  call_taken_by?: string | null;
};

type CloseRow = {
  id: string;
  lead_id: string | null;
  closed_at: string;
  setter_name: string | null;
};

function toNum(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function dateOnly(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10);
}

function inDateRange(dateStr: string | null, startDate: string, endDate: string): boolean {
  if (!dateStr) return false;
  return dateStr >= startDate && dateStr <= endDate;
}

function emptyRow(agent: RosterB2BSetterWithPay, periodStart: string): B2BSetterCommissionRow {
  const rates: B2BSetterPayRates = {
    base_salary: toNum(agent.base_salary),
    monthly_bonus: toNum(agent.monthly_bonus),
    pay_per_qualified_demo: toNum(agent.pay_per_qualified_demo),
    pay_per_close: toNum(agent.pay_per_close),
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
    counts: { qualified_demos: 0, closes: 0 },
    amounts: {
      base: fixed.base,
      bonus: fixed.bonus,
      qualified_demos: 0,
      closes: 0,
      total: fixed.base + fixed.bonus,
    },
    line_items: [],
    pending_disposition: { count: 0, items: [] },
  };
}

function finalizeRow(row: B2BSetterCommissionRow): B2BSetterCommissionRow {
  const demosAmt = row.counts.qualified_demos * row.rates.pay_per_qualified_demo;
  const closesAmt = row.counts.closes * row.rates.pay_per_close;
  row.line_items.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
  row.amounts = {
    ...row.amounts,
    qualified_demos: demosAmt,
    closes: closesAmt,
    total: row.amounts.base + row.amounts.bonus + demosAmt + closesAmt,
  };
  return row;
}

export function attachB2BPendingDisposition(
  rows: B2BSetterCommissionRow[],
  pendingByAgentId: Map<string, PendingDispositionItem[]>,
): B2BSetterCommissionRow[] {
  return rows.map(row => {
    const items = pendingByAgentId.get(row.agent_id) ?? [];
    return {
      ...row,
      pending_disposition: { count: items.length, items },
    };
  });
}

export function buildB2BSetterCommissionReport(
  roster: RosterB2BSetterWithPay[],
  demos: DemoRow[],
  closes: CloseRow[],
  leadNames: Map<string, string>,
  startDate: string,
  endDate: string,
): B2BSetterCommissionReport {
  const resolveSetter = buildRosterMatcher(roster);
  const unassigned = { qualified_demos: 0, closes: 0 };

  const agentByName = new Map<string, B2BSetterCommissionRow>();
  for (const agent of roster) {
    agentByName.set(agent.name, emptyRow(agent, startDate));
  }

  for (const row of demos) {
    if (row.status !== 'showed' || row.qualified !== true) continue;

    const payDate = dateOnly(row.scheduled_at);
    if (!inDateRange(payDate, startDate, endDate)) continue;

    const name = resolveSetter(row.setter_name);
    if (!name) {
      unassigned.qualified_demos++;
      continue;
    }

    const acc = agentByName.get(name);
    if (!acc) continue;

    acc.counts.qualified_demos++;
    acc.line_items.push({
      type: 'qualified_demo',
      event_id: row.id,
      date: payDate!,
      lead_name: row.lead_name,
      lead_phone: row.phone,
      unit_pay: acc.rates.pay_per_qualified_demo,
    });
  }

  for (const row of closes) {
    const payDate = dateOnly(row.closed_at);
    if (!inDateRange(payDate, startDate, endDate)) continue;

    const name = resolveSetter(row.setter_name);
    if (!name) {
      unassigned.closes++;
      continue;
    }

    const acc = agentByName.get(name);
    if (!acc) continue;

    acc.counts.closes++;
    acc.line_items.push({
      type: 'close',
      event_id: row.id,
      date: payDate!,
      lead_name: row.lead_id ? (leadNames.get(row.lead_id) ?? null) : null,
      lead_phone: null,
      unit_pay: acc.rates.pay_per_close,
    });
  }

  const agents = [...agentByName.values()]
    .map(finalizeRow)
    .filter(
      a =>
        a.counts.qualified_demos > 0 ||
        a.counts.closes > 0 ||
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
