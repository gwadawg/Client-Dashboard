import type { UnifiedPayrollReport } from '@/lib/agent-commissions';
import type { AgentCommissionRow } from '@/lib/agent-commissions';
import type { B2BSetterCommissionRow } from '@/lib/b2b-setter-commissions';
import type { SalariedCommissionRow } from '@/lib/salaried-commissions';

export type PayrollRunSummary = {
  grand_total: number;
  call_reps_total: number;
  b2b_setters_total: number;
  salaried_total: number;
  employee_count: number;
};

export type PayrollRunListItem = {
  id: string;
  period_month: string;
  start_date: string;
  end_date: string;
  summary: PayrollRunSummary;
  finalized_at: string;
  finalized_by: string | null;
  finalized_by_email?: string | null;
  notes: string | null;
};

export type PayrollRunRecord = PayrollRunListItem & {
  report: UnifiedPayrollReport;
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
  finalized_at: string;
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

export function buildRunSummary(report: UnifiedPayrollReport): PayrollRunSummary {
  return {
    grand_total: report.summary.grand_total,
    call_reps_total: report.summary.call_reps_total,
    b2b_setters_total: report.summary.b2b_setters_total,
    salaried_total: report.summary.salaried_total,
    employee_count:
      report.summary.call_rep_count +
      report.summary.b2b_setter_count +
      report.summary.salaried_count,
  };
}
