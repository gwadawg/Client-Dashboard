import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  attachCallRepPendingDisposition,
  buildCommissionReport,
  type AgentCommissionRow,
  type RosterAgentWithPay,
  type UnifiedPayrollReport,
} from '@/lib/agent-commissions';
import {
  attachB2BPendingDisposition,
  buildB2BSetterCommissionReport,
  type B2BSetterCommissionRow,
  type RosterB2BSetterWithPay,
} from '@/lib/b2b-setter-commissions';
import { computeFixedPay, type PendingDispositionItem } from '@/lib/payroll-common';
import {
  attachSalariedPending,
  buildSalariedCommissionReport,
  type RosterSalariedEmployee,
} from '@/lib/salaried-commissions';
import {
  bucketB2BSetterPendingDisposition,
  bucketCallRepPendingDisposition,
  CREDIT_QUEUE_OR_FILTER,
  CREDIT_QUEUE_UNCREDITED_FILTER,
} from '@/lib/payroll-pending-disposition';
import {
  isSalariedPosition,
  normalizeEmployeePosition,
  type EmployeePosition,
} from '@/lib/employee-positions';

const EVENT_FIELDS =
  'id, client_id, event_type, agent_name, occurred_at, scheduled_at, lead_name, lead_phone, raw, calendar_name';

const ROSTER_FIELDS =
  'id, name, phone, pay_type, base_salary, monthly_bonus, base_salary_prorate_days, pay_per_booking, pay_per_show, pay_per_live_transfer, pay_per_qualified_demo, pay_per_close';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_agent_payroll');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');

  if (!startDate || !endDate) {
    return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
  }

  const [
    { data: roster, error: rosterError },
    { data: clients, error: clientsError },
    { data: bookingTransferEvents, error: btError },
    { data: showEvents, error: showError },
    { data: uncreditedEvents, error: uncreditedError },
    { data: b2bDemos, error: b2bDemosError },
    { data: b2bCloses, error: b2bClosesError },
    { data: pendingB2BDemos, error: pendingB2BError },
  ] = await Promise.all([
    ctx.service.from('agents').select(ROSTER_FIELDS).order('name'),
    ctx.service.from('clients').select('id, name'),
    ctx.service
      .from('events')
      .select(EVENT_FIELDS)
      .in('event_type', ['appointment_booked', 'live_transfer'])
      .gte('occurred_at', `${startDate}T00:00:00.000Z`)
      .lte('occurred_at', `${endDate}T23:59:59.999Z`),
    ctx.service
      .from('events')
      .select(EVENT_FIELDS)
      .eq('event_type', 'show')
      .or(
        `and(scheduled_at.gte.${startDate}T00:00:00.000Z,scheduled_at.lte.${endDate}T23:59:59.999Z),scheduled_at.is.null`,
      ),
    ctx.service
      .from('events')
      .select('id, event_type, occurred_at, scheduled_at, calendar_name, lead_name, agent_name')
      .or(CREDIT_QUEUE_OR_FILTER)
      .or(CREDIT_QUEUE_UNCREDITED_FILTER)
      .gte('occurred_at', `${startDate}T00:00:00.000Z`)
      .lte('occurred_at', `${endDate}T23:59:59.999Z`),
    ctx.service
      .from('acquisition_appointments')
      .select('id, lead_name, phone, scheduled_at, status, qualified, setter_name, call_taken_by')
      .eq('appointment_type', 'demo')
      .or(
        `and(scheduled_at.gte.${startDate}T00:00:00.000Z,scheduled_at.lte.${endDate}T23:59:59.999Z),scheduled_at.is.null`,
      ),
    ctx.service
      .from('acquisition_closes')
      .select('id, lead_id, closed_at, setter_name')
      .gte('closed_at', `${startDate}T00:00:00.000Z`)
      .lte('closed_at', `${endDate}T23:59:59.999Z`),
    ctx.service
      .from('acquisition_appointments')
      .select('id, lead_name, scheduled_at, setter_name, call_taken_by, intro_call_id')
      .eq('appointment_type', 'demo')
      .is('intro_call_id', null)
      .or(
        `and(scheduled_at.gte.${startDate}T00:00:00.000Z,scheduled_at.lte.${endDate}T23:59:59.999Z),scheduled_at.is.null`,
      ),
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  if (btError) return NextResponse.json({ error: btError.message }, { status: 500 });
  if (showError) return NextResponse.json({ error: showError.message }, { status: 500 });
  if (uncreditedError) return NextResponse.json({ error: uncreditedError.message }, { status: 500 });
  if (b2bDemosError) return NextResponse.json({ error: b2bDemosError.message }, { status: 500 });
  if (b2bClosesError) return NextResponse.json({ error: b2bClosesError.message }, { status: 500 });
  if (pendingB2BError) return NextResponse.json({ error: pendingB2BError.message }, { status: 500 });

  const allRoster = (roster ?? []) as RosterAgentWithPay[];
  const callRepRoster = allRoster.filter(a => normalizeEmployeePosition(a.pay_type) === 'call_rep');
  const b2bRoster: RosterB2BSetterWithPay[] = allRoster
    .filter(a => normalizeEmployeePosition(a.pay_type) === 'b2b_setter')
    .map(a => ({
      id: a.id,
      name: a.name,
      phone: a.phone,
      base_salary: Number(a.base_salary) || 0,
      monthly_bonus: Number(a.monthly_bonus) || 0,
      pay_per_qualified_demo: Number(a.pay_per_qualified_demo) || 0,
      pay_per_close: Number(a.pay_per_close) || 0,
      base_salary_prorate_days: a.base_salary_prorate_days,
    }));

  const salariedRoster: RosterSalariedEmployee[] = allRoster
    .filter(a => isSalariedPosition(normalizeEmployeePosition(a.pay_type)))
    .map(a => ({
      id: a.id,
      name: a.name,
      phone: a.phone,
      pay_type: normalizeEmployeePosition(a.pay_type) as EmployeePosition,
      base_salary: Number(a.base_salary) || 0,
      monthly_bonus: Number(a.monthly_bonus) || 0,
      base_salary_prorate_days: a.base_salary_prorate_days,
    }));

  const callRepPending = bucketCallRepPendingDisposition(
    callRepRoster,
    uncreditedEvents ?? [],
    startDate,
    endDate,
  );

  let callReps = buildCommissionReport(
    callRepRoster,
    clients ?? [],
    bookingTransferEvents ?? [],
    showEvents ?? [],
    startDate,
    endDate,
  );
  callReps = {
    ...callReps,
    agents: mergePendingOnlyRows(
      attachCallRepPendingDisposition(callReps.agents, callRepPending),
      callRepRoster,
      callRepPending,
      startDate,
      'call_rep',
    ),
  };

  const leadIds = [...new Set((b2bCloses ?? []).map(c => c.lead_id).filter(Boolean))] as string[];
  let leadNames = new Map<string, string>();
  if (leadIds.length > 0) {
    const { data: leads } = await ctx.service
      .from('acquisition_leads')
      .select('id, lead_name')
      .in('id', leadIds);
    leadNames = new Map((leads ?? []).map(l => [l.id, l.lead_name ?? '']));
  }

  const b2bPending = bucketB2BSetterPendingDisposition(
    b2bRoster,
    pendingB2BDemos ?? [],
    startDate,
    endDate,
  );

  let b2bSetters = buildB2BSetterCommissionReport(
    b2bRoster,
    b2bDemos ?? [],
    b2bCloses ?? [],
    leadNames,
    startDate,
    endDate,
  );
  b2bSetters = {
    ...b2bSetters,
    agents: mergePendingOnlyB2BRows(
      attachB2BPendingDisposition(b2bSetters.agents, b2bPending),
      b2bRoster,
      b2bPending,
      startDate,
    ),
  };

  let salaried = buildSalariedCommissionReport(salariedRoster, startDate, endDate);
  salaried = {
    ...salaried,
    agents: attachSalariedPending(salaried.agents, new Map(), salariedRoster, startDate),
  };

  const callRepsTotal = callReps.agents.reduce((s, a) => s + a.amounts.total, 0);
  const b2bSettersTotal = b2bSetters.agents.reduce((s, a) => s + a.amounts.total, 0);
  const salariedTotal = salaried.agents.reduce((s, a) => s + a.amounts.total, 0);

  const report: UnifiedPayrollReport = {
    period: { startDate, endDate },
    summary: {
      call_reps_total: callRepsTotal,
      b2b_setters_total: b2bSettersTotal,
      salaried_total: salariedTotal,
      grand_total: callRepsTotal + b2bSettersTotal + salariedTotal,
      call_rep_count: callReps.agents.length,
      b2b_setter_count: b2bSetters.agents.length,
      salaried_count: salaried.agents.length,
    },
    call_reps: callReps,
    b2b_setters: b2bSetters,
    salaried,
    agents: callReps.agents,
  };

  return NextResponse.json(report);
}

function mergePendingOnlyRows(
  agents: AgentCommissionRow[],
  roster: RosterAgentWithPay[],
  pendingByAgentId: Map<string, PendingDispositionItem[]>,
  periodStart: string,
  _kind: 'call_rep',
): AgentCommissionRow[] {
  const existing = new Set(agents.map(a => a.agent_id));
  const extra: AgentCommissionRow[] = [];

  for (const agent of roster) {
    const items = pendingByAgentId.get(agent.id) ?? [];
    if (items.length === 0 || existing.has(agent.id)) continue;
    const fixed = computeFixedPay(
      Number(agent.base_salary) || 0,
      Number(agent.monthly_bonus) || 0,
      agent.base_salary_prorate_days,
      periodStart,
    );
    extra.push({
      agent_id: agent.id,
      agent_name: agent.name,
      rates: {
        base_salary: Number(agent.base_salary) || 0,
        monthly_bonus: Number(agent.monthly_bonus) || 0,
        pay_per_booking: Number(agent.pay_per_booking) || 0,
        pay_per_show: Number(agent.pay_per_show) || 0,
        pay_per_live_transfer: Number(agent.pay_per_live_transfer) || 0,
      },
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
      pending_disposition: { count: items.length, items },
    });
  }

  return [...agents, ...extra].sort((a, b) => b.amounts.total - a.amounts.total);
}

function mergePendingOnlyB2BRows(
  agents: B2BSetterCommissionRow[],
  roster: RosterB2BSetterWithPay[],
  pendingByAgentId: Map<string, PendingDispositionItem[]>,
  periodStart: string,
): B2BSetterCommissionRow[] {
  const existing = new Set(agents.map(a => a.agent_id));
  const extra: B2BSetterCommissionRow[] = [];

  for (const agent of roster) {
    const items = pendingByAgentId.get(agent.id) ?? [];
    if (items.length === 0 || existing.has(agent.id)) continue;
    const fixed = computeFixedPay(
      Number(agent.base_salary) || 0,
      Number(agent.monthly_bonus) || 0,
      agent.base_salary_prorate_days,
      periodStart,
    );
    extra.push({
      agent_id: agent.id,
      agent_name: agent.name,
      rates: {
        base_salary: Number(agent.base_salary) || 0,
        monthly_bonus: Number(agent.monthly_bonus) || 0,
        pay_per_qualified_demo: Number(agent.pay_per_qualified_demo) || 0,
        pay_per_close: Number(agent.pay_per_close) || 0,
      },
      counts: { qualified_demos: 0, closes: 0 },
      amounts: {
        base: fixed.base,
        bonus: fixed.bonus,
        qualified_demos: 0,
        closes: 0,
        total: fixed.base + fixed.bonus,
      },
      line_items: [],
      pending_disposition: { count: items.length, items },
    });
  }

  return [...agents, ...extra].sort((a, b) => b.amounts.total - a.amounts.total);
}
