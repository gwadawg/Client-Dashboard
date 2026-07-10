import type { UnifiedPayrollReport } from '@/lib/agent-commissions';
import type { AgentCommissionRow } from '@/lib/agent-commissions';
import type { B2BSetterCommissionRow } from '@/lib/b2b-setter-commissions';
import type { SalariedCommissionRow } from '@/lib/salaried-commissions';

export type PayrollRunStatus = 'open' | 'closed';

export type PayrollRunSummary = {
  grand_total: number;
  call_reps_total: number;
  b2b_setters_total: number;
  salaried_total: number;
  employee_count: number;
  submitted_count?: number;
};

export type PayrollRunListItem = {
  id: string;
  period_month: string;
  start_date: string;
  end_date: string;
  summary: PayrollRunSummary;
  status?: PayrollRunStatus;
  finalized_at: string;
  finalized_by: string | null;
  finalized_by_email?: string | null;
  notes: string | null;
};

export type PayrollRunRecord = PayrollRunListItem & {
  report: UnifiedPayrollReport;
};

export type PayrollSubmittedEmployee = {
  agent_id: string;
  agent_name: string;
  section: 'call_rep' | 'b2b_setter' | 'salaried';
  submitted_at: string;
  submitted_by: string | null;
  submitted_by_email?: string | null;
  total_pay: number;
  amounts: Record<string, number>;
  counts: Record<string, number>;
  rates: Record<string, number>;
  line_items: unknown[];
  line_item_exclusions?: import('@/lib/payroll-line-item-duplicates').LineItemExclusion[];
  pending_disposition: { count: number; items: unknown[] } | null;
  row: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow;
};

export type PayrollEmployeeHistoryRow = {
  payroll_run_id: string;
  period_month: string;
  start_date: string;
  end_date: string;
  agent_id: string | null;
  agent_name: string;
  pay_type: string;
  section: 'call_rep' | 'b2b_setter' | 'salaried';
  total_pay: number;
  amounts: Record<string, number>;
  counts: Record<string, number>;
  rates: Record<string, number>;
  line_items: unknown[];
  pending_disposition: { count: number; items: unknown[] } | null;
  line_item_exclusions?: import('@/lib/payroll-line-item-duplicates').LineItemExclusion[];
  finalized_at: string;
  submitted_at?: string | null;
};

export type PayrollEmployeeSnapshot = {
  section: 'call_rep' | 'b2b_setter' | 'salaried';
  row: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow;
};

export function extractEmployeeSnapshots(report: UnifiedPayrollReport): PayrollEmployeeSnapshot[] {
  const out: PayrollEmployeeSnapshot[] = [];
  for (const row of report.call_reps.agents) out.push({ section: 'call_rep', row });
  for (const row of report.b2b_setters.agents) out.push({ section: 'b2b_setter', row });
  for (const row of report.salaried.agents) out.push({ section: 'salaried', row });
  return out;
}

export function buildRunSummary(report: UnifiedPayrollReport, submittedCount?: number): PayrollRunSummary {
  return {
    grand_total: report.summary.grand_total,
    call_reps_total: report.summary.call_reps_total,
    b2b_setters_total: report.summary.b2b_setters_total,
    salaried_total: report.summary.salaried_total,
    employee_count:
      report.summary.call_rep_count +
      report.summary.b2b_setter_count +
      report.summary.salaried_count,
    submitted_count: submittedCount,
  };
}

export function payTypeForSection(
  section: 'call_rep' | 'b2b_setter' | 'salaried',
  row: AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow,
): string {
  if (section === 'salaried') return (row as SalariedCommissionRow).position;
  if (section === 'b2b_setter') return 'b2b_setter';
  return 'call_rep';
}

export function employeeRowFromDb(
  section: 'call_rep' | 'b2b_setter' | 'salaried',
  row: {
    agent_id: string | null;
    agent_name: string;
    amounts: Record<string, number>;
    counts: Record<string, number>;
    rates: Record<string, number>;
    line_items: unknown[];
    pending_disposition: { count: number; items: unknown[] } | null;
    total_pay: number;
  },
  payType?: string,
): AgentCommissionRow | B2BSetterCommissionRow | SalariedCommissionRow {
  const base = {
    agent_id: row.agent_id ?? '',
    agent_name: row.agent_name,
    rates: row.rates,
    amounts: row.amounts,
    pending_disposition: row.pending_disposition ?? { count: 0, items: [] },
  };

  if (section === 'call_rep') {
    return {
      ...base,
      rates: row.rates as AgentCommissionRow['rates'],
      counts: row.counts as AgentCommissionRow['counts'],
      amounts: row.amounts as AgentCommissionRow['amounts'],
      line_items: (row.line_items ?? []) as AgentCommissionRow['line_items'],
      pending_disposition: (row.pending_disposition ?? { count: 0, items: [] }) as AgentCommissionRow['pending_disposition'],
    };
  }

  if (section === 'b2b_setter') {
    return {
      ...base,
      rates: row.rates as B2BSetterCommissionRow['rates'],
      counts: row.counts as B2BSetterCommissionRow['counts'],
      amounts: row.amounts as B2BSetterCommissionRow['amounts'],
      line_items: (row.line_items ?? []) as B2BSetterCommissionRow['line_items'],
      pending_disposition: (row.pending_disposition ?? { count: 0, items: [] }) as B2BSetterCommissionRow['pending_disposition'],
    };
  }

  return {
    agent_id: row.agent_id ?? '',
    agent_name: row.agent_name,
    position: (payType ?? 'admin') as SalariedCommissionRow['position'],
    rates: {
      base_salary: Number(row.rates.base_salary) || 0,
      monthly_bonus: Number(row.rates.monthly_bonus) || 0,
    },
    amounts: row.amounts as SalariedCommissionRow['amounts'],
    pending_disposition: (row.pending_disposition ?? { count: 0, items: [] }) as SalariedCommissionRow['pending_disposition'],
  };
}

export function mergeReportWithSubmissions(
  live: UnifiedPayrollReport,
  submitted: PayrollSubmittedEmployee[],
): UnifiedPayrollReport {
  const byId = new Map(submitted.map(s => [s.agent_id, s]));

  const mergeSection = <T extends { agent_id: string }>(
    agents: T[],
    section: PayrollSubmittedEmployee['section'],
    pickRow: (s: PayrollSubmittedEmployee) => T,
  ): T[] =>
    agents.map(agent => {
      const frozen = byId.get(agent.agent_id);
      if (frozen && frozen.section === section) return pickRow(frozen);
      return agent;
    });

  return {
    ...live,
    call_reps: {
      ...live.call_reps,
      agents: mergeSection(live.call_reps.agents, 'call_rep', s => s.row as AgentCommissionRow),
    },
    b2b_setters: {
      ...live.b2b_setters,
      agents: mergeSection(live.b2b_setters.agents, 'b2b_setter', s => s.row as B2BSetterCommissionRow),
    },
    salaried: {
      ...live.salaried,
      agents: mergeSection(live.salaried.agents, 'salaried', s => s.row as SalariedCommissionRow),
    },
    agents: mergeSection(live.call_reps.agents, 'call_rep', s => s.row as AgentCommissionRow),
  };
}

export function rebuildReportFromSubmissions(
  submitted: PayrollSubmittedEmployee[],
  startDate: string,
  endDate: string,
): UnifiedPayrollReport {
  const callReps = submitted.filter(s => s.section === 'call_rep').map(s => s.row as AgentCommissionRow);
  const b2bSetters = submitted.filter(s => s.section === 'b2b_setter').map(s => s.row as B2BSetterCommissionRow);
  const salaried = submitted.filter(s => s.section === 'salaried').map(s => s.row as SalariedCommissionRow);

  const callRepsTotal = callReps.reduce((sum, row) => sum + row.amounts.total, 0);
  const b2bSettersTotal = b2bSetters.reduce((sum, row) => sum + row.amounts.total, 0);
  const salariedTotal = salaried.reduce((sum, row) => sum + row.amounts.total, 0);

  const report: UnifiedPayrollReport = {
    period: { startDate, endDate },
    summary: {
      call_reps_total: callRepsTotal,
      b2b_setters_total: b2bSettersTotal,
      salaried_total: salariedTotal,
      grand_total: callRepsTotal + b2bSettersTotal + salariedTotal,
      call_rep_count: callReps.length,
      b2b_setter_count: b2bSetters.length,
      salaried_count: salaried.length,
    },
    call_reps: {
      period: { startDate, endDate },
      agents: callReps,
      unassigned: { bookings: 0, shows: 0, live_transfers: 0 },
    },
    b2b_setters: {
      period: { startDate, endDate },
      agents: b2bSetters,
      unassigned: { qualified_demos: 0, closes: 0 },
    },
    salaried: {
      period: { startDate, endDate },
      agents: salaried,
    },
    agents: callReps,
  };

  return report;
}
