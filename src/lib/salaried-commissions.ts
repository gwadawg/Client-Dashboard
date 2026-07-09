import { computeFixedPay, type PendingDisposition } from '@/lib/payroll-common';
import type { EmployeePosition } from '@/lib/employee-positions';

export type SalariedPayRates = {
  base_salary: number;
  monthly_bonus: number;
};

export type RosterSalariedEmployee = {
  id: string;
  name: string;
  phone: string;
  pay_type: EmployeePosition;
  base_salary_prorate_days?: number | null;
} & SalariedPayRates;

export type SalariedCommissionRow = {
  agent_id: string;
  agent_name: string;
  position: EmployeePosition;
  rates: SalariedPayRates;
  amounts: { base: number; bonus: number; total: number };
  pending_disposition: PendingDisposition;
};

export type SalariedCommissionReport = {
  period: { startDate: string; endDate: string };
  agents: SalariedCommissionRow[];
};

function emptyRow(employee: RosterSalariedEmployee, periodStart: string): SalariedCommissionRow {
  const rates: SalariedPayRates = {
    base_salary: Number(employee.base_salary) || 0,
    monthly_bonus: Number(employee.monthly_bonus) || 0,
  };
  const fixed = computeFixedPay(
    rates.base_salary,
    rates.monthly_bonus,
    employee.base_salary_prorate_days,
    periodStart,
  );
  return {
    agent_id: employee.id,
    agent_name: employee.name,
    position: employee.pay_type,
    rates,
    amounts: {
      base: fixed.base,
      bonus: fixed.bonus,
      total: fixed.base + fixed.bonus,
    },
    pending_disposition: { count: 0, items: [] },
  };
}

export function buildSalariedCommissionReport(
  roster: RosterSalariedEmployee[],
  startDate: string,
  endDate: string,
): SalariedCommissionReport {
  const agents = roster
    .map(e => emptyRow(e, startDate))
    .filter(a => a.rates.base_salary > 0 || a.rates.monthly_bonus > 0)
    .sort((a, b) => b.amounts.total - a.amounts.total);

  return { period: { startDate, endDate }, agents };
}

export function attachSalariedPending(
  rows: SalariedCommissionRow[],
  pendingByAgentId: Map<string, import('@/lib/payroll-common').PendingDispositionItem[]>,
  roster: RosterSalariedEmployee[],
  periodStart: string,
): SalariedCommissionRow[] {
  const existing = new Set(rows.map(r => r.agent_id));
  const merged = rows.map(row => {
    const items = pendingByAgentId.get(row.agent_id) ?? [];
    return { ...row, pending_disposition: { count: items.length, items } };
  });

  for (const employee of roster) {
    const items = pendingByAgentId.get(employee.id) ?? [];
    if (items.length === 0 || existing.has(employee.id)) continue;
    merged.push({ ...emptyRow(employee, periodStart), pending_disposition: { count: items.length, items } });
  }

  return merged.sort((a, b) => b.amounts.total - a.amounts.total);
}
