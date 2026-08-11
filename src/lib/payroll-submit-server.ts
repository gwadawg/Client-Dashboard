import type { AgentCommissionRow } from '@/lib/agent-commissions';
import type { B2BSetterCommissionRow } from '@/lib/b2b-setter-commissions';
import type { createServiceClient } from '@/lib/supabase';
import type { UnifiedPayrollReport } from '@/lib/agent-commissions';
import { monthBounds } from '@/lib/payroll-period';
import { buildUnifiedPayrollReport } from '@/lib/payroll-report-builder';
import {
  applyPayrollExclusions,
  type LineItemExclusion,
} from '@/lib/payroll-line-item-duplicates';
import {
  autoExcludeBannedShowPays,
  claimShowPayLeads,
  fetchPaidShowLeadKeys,
  payingShowLines,
  releaseShowPayClaimsForEvents,
  SHOW_CLAIM_LOST_REASON,
} from '@/lib/payroll-show-once';
import {
  buildRunSummary,
  employeeRowFromDb,
  extractEmployeeSnapshots,
  payTypeForSection,
  rebuildReportFromSubmissions,
  type PayrollSubmittedEmployee,
} from '@/lib/payroll-runs';

type ServiceClient = ReturnType<typeof createServiceClient>;

type DbEmployeeRow = {
  agent_id: string | null;
  agent_name: string;
  pay_type: string;
  section: 'call_rep' | 'b2b_setter' | 'salaried';
  total_pay: number;
  amounts: Record<string, number>;
  counts: Record<string, number>;
  rates: Record<string, number>;
  line_items: unknown[];
  line_item_exclusions?: import('@/lib/payroll-line-item-duplicates').LineItemExclusion[];
  pending_disposition: { count: number; items: unknown[] } | null;
  non_show_appointments?: { count: number; items: unknown[] } | null;
  submitted_at: string | null;
  submitted_by: string | null;
};

export async function loadPeriodPayrollState(
  service: ServiceClient,
  periodMonth: string,
): Promise<
  | {
      status: 'none';
      live: UnifiedPayrollReport;
      submitted: PayrollSubmittedEmployee[];
    }
  | {
      status: 'open' | 'closed';
      run: {
        id: string;
        period_month: string;
        start_date: string;
        end_date: string;
        status: 'open' | 'closed';
        summary: ReturnType<typeof buildRunSummary>;
        finalized_at: string;
        finalized_by: string | null;
        notes: string | null;
        report: UnifiedPayrollReport;
      };
      submitted: PayrollSubmittedEmployee[];
      live: UnifiedPayrollReport | null;
    }
> {
  const { startDate, endDate } = monthBounds(periodMonth);

  const { data: run } = await service
    .from('payroll_runs')
    .select('id, period_month, start_date, end_date, status, summary, report, finalized_at, finalized_by, notes')
    .eq('period_month', `${periodMonth}-01`)
    .maybeSingle();

  if (!run) {
    const built = await buildUnifiedPayrollReport(service, startDate, endDate);
    if ('error' in built) throw new Error(built.error);
    return { status: 'none', live: built.report, submitted: [] };
  }

  const submitted = await loadSubmittedEmployees(service, run.id);

  if (run.status === 'closed') {
    return {
      status: 'closed',
      run: {
        id: run.id,
        period_month: String(run.period_month).slice(0, 10),
        start_date: String(run.start_date).slice(0, 10),
        end_date: String(run.end_date).slice(0, 10),
        status: 'closed',
        summary: run.summary as ReturnType<typeof buildRunSummary>,
        finalized_at: run.finalized_at,
        finalized_by: run.finalized_by,
        notes: run.notes,
        report: run.report as UnifiedPayrollReport,
      },
      submitted,
      live: null,
    };
  }

  const built = await buildUnifiedPayrollReport(service, startDate, endDate);
  if ('error' in built) throw new Error(built.error);

  return {
    status: 'open',
    run: {
      id: run.id,
      period_month: String(run.period_month).slice(0, 10),
      start_date: String(run.start_date).slice(0, 10),
      end_date: String(run.end_date).slice(0, 10),
      status: 'open',
      summary: run.summary as ReturnType<typeof buildRunSummary>,
      finalized_at: run.finalized_at,
      finalized_by: run.finalized_by,
      notes: run.notes,
      report: run.report as UnifiedPayrollReport,
    },
    submitted,
    live: built.report,
  };
}

export async function loadSubmittedEmployees(
  service: ServiceClient,
  payrollRunId: string,
): Promise<PayrollSubmittedEmployee[]> {
  const { data, error } = await service
    .from('payroll_run_employees')
    .select(
      'agent_id, agent_name, pay_type, section, total_pay, amounts, counts, rates, line_items, line_item_exclusions, pending_disposition, non_show_appointments, submitted_at, submitted_by',
    )
    .eq('payroll_run_id', payrollRunId)
    .not('submitted_at', 'is', null)
    .order('submitted_at', { ascending: true });

  if (error) throw new Error(error.message);

  return (data ?? []).map(row => {
    const section = row.section as PayrollSubmittedEmployee['section'];
    const employeeRow = employeeRowFromDb(section, row as DbEmployeeRow, row.pay_type);
    return {
      agent_id: row.agent_id ?? '',
      agent_name: row.agent_name,
      section,
      submitted_at: row.submitted_at as string,
      submitted_by: row.submitted_by,
      total_pay: Number(row.total_pay),
      amounts: row.amounts as Record<string, number>,
      counts: row.counts as Record<string, number>,
      rates: row.rates as Record<string, number>,
      line_items: row.line_items ?? [],
      line_item_exclusions: (row.line_item_exclusions ?? []) as import('@/lib/payroll-line-item-duplicates').LineItemExclusion[],
      pending_disposition: row.pending_disposition as PayrollSubmittedEmployee['pending_disposition'],
      non_show_appointments: (row as DbEmployeeRow).non_show_appointments ?? null,
      row: employeeRow,
    };
  });
}

export async function submitEmployeePayroll(
  service: ServiceClient,
  periodMonth: string,
  agentId: string,
  section: 'call_rep' | 'b2b_setter' | 'salaried',
  userId: string,
  lineItemExclusions: LineItemExclusion[] = [],
): Promise<{ closed: boolean; submitted_count: number; employee_count: number }> {
  const { startDate, endDate } = monthBounds(periodMonth);
  const built = await buildUnifiedPayrollReport(service, startDate, endDate);
  if ('error' in built) throw new Error(built.error);

  const live = built.report;
  const snapshot = extractEmployeeSnapshots(live).find(s => s.section === section && s.row.agent_id === agentId);
  if (!snapshot) {
    throw new Error('Employee not found in payroll for this period');
  }

  const row = snapshot.row;
  let effectiveExclusions = [...lineItemExclusions];

  if (section === 'call_rep' && 'line_items' in row) {
    const paidLeadKeys = await fetchPaidShowLeadKeys(service);
    effectiveExclusions = autoExcludeBannedShowPays(
      row.line_items,
      effectiveExclusions,
      paidLeadKeys,
    );
  }

  let adjusted =
    section === 'salaried'
      ? { counts: {} as Record<string, number>, amounts: row.amounts, total_pay: row.amounts.total }
      : applyPayrollExclusions(
          section,
          row as AgentCommissionRow | B2BSetterCommissionRow,
          effectiveExclusions,
        );

  // Race guard: claim lead keys before writing the submit row
  if (section === 'call_rep' && 'line_items' in row) {
    const paying = payingShowLines(row.line_items, effectiveExclusions);
    const { lostEventIds } = await claimShowPayLeads(
      service,
      paying.map(p => ({
        lead_key: p.lead_key,
        agent_id: row.agent_id,
        agent_name: row.agent_name,
        event_id: p.event_id,
        period_month: `${periodMonth}-01`,
      })),
    );
    if (lostEventIds.length > 0) {
      for (const event_id of lostEventIds) {
        if (!effectiveExclusions.some(e => e.event_id === event_id)) {
          effectiveExclusions.push({ event_id, reason: SHOW_CLAIM_LOST_REASON });
        }
      }
      adjusted = applyPayrollExclusions(
        section,
        row as AgentCommissionRow | B2BSetterCommissionRow,
        effectiveExclusions,
      );
    }
  }

  let runId: string;
  let runStatus: 'open' | 'closed' = 'open';

  const { data: existingRun } = await service
    .from('payroll_runs')
    .select('id, status')
    .eq('period_month', `${periodMonth}-01`)
    .maybeSingle();

  if (existingRun?.status === 'closed') {
    throw new Error('This month is already closed');
  }

  if (existingRun) {
    runId = existingRun.id;
    runStatus = existingRun.status as 'open' | 'closed';
  } else {
    const summary = buildRunSummary(live, 0);
    const { data: created, error: createError } = await service
      .from('payroll_runs')
      .insert({
        period_month: `${periodMonth}-01`,
        start_date: startDate,
        end_date: endDate,
        status: 'open',
        summary,
        report: live,
        finalized_by: userId,
        notes: null,
      })
      .select('id')
      .single();

    if (createError || !created) throw new Error(createError?.message ?? 'Failed to create payroll run');
    runId = created.id;
  }

  const { data: existingEmployee } = await service
    .from('payroll_run_employees')
    .select('id, submitted_at')
    .eq('payroll_run_id', runId)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (existingEmployee?.submitted_at) {
    throw new Error('This employee has already been submitted for this month');
  }

  const employeePayload = {
    payroll_run_id: runId,
    period_month: `${periodMonth}-01`,
    agent_id: row.agent_id,
    agent_name: row.agent_name,
    pay_type: payTypeForSection(section, row),
    section,
    total_pay: adjusted.total_pay,
    amounts: adjusted.amounts,
    counts: adjusted.counts,
    rates: row.rates,
    line_items: 'line_items' in row ? row.line_items : [],
    line_item_exclusions: effectiveExclusions,
    pending_disposition: row.pending_disposition ?? null,
    non_show_appointments:
      section === 'call_rep' && 'non_show_appointments' in row
        ? (row as AgentCommissionRow).non_show_appointments ?? null
        : null,
    submitted_at: new Date().toISOString(),
    submitted_by: userId,
  };

  if (existingEmployee) {
    const { error } = await service.from('payroll_run_employees').update(employeePayload).eq('id', existingEmployee.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await service.from('payroll_run_employees').insert(employeePayload);
    if (error) throw new Error(error.message);
  }

  const submitted = await loadSubmittedEmployees(service, runId);
  const employeeCount =
    live.summary.call_rep_count + live.summary.b2b_setter_count + live.summary.salaried_count;
  const allSubmitted = submitted.length >= employeeCount;

  if (allSubmitted) {
    const closedReport = rebuildReportFromSubmissions(submitted, startDate, endDate);
    const summary = buildRunSummary(closedReport, submitted.length);
    const { error } = await service
      .from('payroll_runs')
      .update({
        status: 'closed',
        summary,
        report: closedReport,
        finalized_at: new Date().toISOString(),
        finalized_by: userId,
      })
      .eq('id', runId);

    if (error) throw new Error(error.message);
    runStatus = 'closed';
  } else {
    const partialReport = rebuildReportFromSubmissions(submitted, startDate, endDate);
    const summary = buildRunSummary(partialReport, submitted.length);
    const { error } = await service
      .from('payroll_runs')
      .update({ summary, report: partialReport })
      .eq('id', runId);
    if (error) throw new Error(error.message);
  }

  return {
    closed: runStatus === 'closed',
    submitted_count: submitted.length,
    employee_count: employeeCount,
  };
}

/**
 * Unlock a previously submitted employee so pay can be re-reviewed and re-submitted.
 * Reopens a closed month if necessary. Does not touch business_expenses cash ledger.
 */
export async function unsubmitEmployeePayroll(
  service: ServiceClient,
  periodMonth: string,
  agentId: string,
  userId: string,
): Promise<{ reopened: boolean; submitted_count: number; employee_count: number }> {
  const { startDate, endDate } = monthBounds(periodMonth);

  const { data: existingRun } = await service
    .from('payroll_runs')
    .select('id, status')
    .eq('period_month', `${periodMonth}-01`)
    .maybeSingle();

  if (!existingRun) {
    throw new Error('No payroll run exists for this month');
  }

  const { data: existingEmployee } = await service
    .from('payroll_run_employees')
    .select('id, submitted_at, agent_name, line_items, line_item_exclusions')
    .eq('payroll_run_id', existingRun.id)
    .eq('agent_id', agentId)
    .maybeSingle();

  if (!existingEmployee?.submitted_at) {
    throw new Error('This employee is not submitted for this month');
  }

  // Free lifetime show claims from this locked snapshot so re-submit can re-claim.
  const releaseEvents = payingShowLines(
    existingEmployee.line_items as unknown[],
    (existingEmployee.line_item_exclusions ?? []) as LineItemExclusion[],
  ).map(p => p.event_id);
  await releaseShowPayClaimsForEvents(service, releaseEvents);

  const { error: clearError } = await service
    .from('payroll_run_employees')
    .update({
      submitted_at: null,
      submitted_by: null,
    })
    .eq('id', existingEmployee.id);

  if (clearError) throw new Error(clearError.message);

  const submitted = await loadSubmittedEmployees(service, existingRun.id);
  const built = await buildUnifiedPayrollReport(service, startDate, endDate);
  if ('error' in built) throw new Error(built.error);

  const live = built.report;
  const employeeCount =
    live.summary.call_rep_count + live.summary.b2b_setter_count + live.summary.salaried_count;

  const wasClosed = existingRun.status === 'closed';
  // Stored run report stays submission-only (or live when none left). Open period UI merges live + submitted on read.
  const reportForRun =
    submitted.length > 0 ? rebuildReportFromSubmissions(submitted, startDate, endDate) : live;
  const summary = buildRunSummary(reportForRun, submitted.length);

  const { error: runError } = await service
    .from('payroll_runs')
    .update({
      status: 'open',
      summary,
      report: reportForRun,
      ...(wasClosed
        ? {
            finalized_at: new Date().toISOString(),
            finalized_by: userId,
            notes: `Reopened: unlocked ${existingEmployee.agent_name ?? agentId}`,
          }
        : {}),
    })
    .eq('id', existingRun.id);

  if (runError) throw new Error(runError.message);

  return {
    reopened: wasClosed,
    submitted_count: submitted.length,
    employee_count: employeeCount,
  };
}
