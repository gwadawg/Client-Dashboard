import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { buildCommissionReport, type RosterAgentWithPay } from '@/lib/agent-commissions';

const EVENT_FIELDS =
  'id, client_id, event_type, agent_name, occurred_at, scheduled_at, lead_name, lead_phone, raw';

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
  ] = await Promise.all([
    ctx.service
      .from('agents')
      .select('id, name, phone, base_salary, pay_per_booking, pay_per_show, pay_per_live_transfer')
      .order('name'),
    ctx.service.from('clients').select('id, name'),
    ctx.service
      .from('events')
      .select(EVENT_FIELDS)
      .in('event_type', ['appointment_booked', 'live_transfer'])
      .gte('occurred_at', `${startDate}T00:00:00.000Z`)
      .lte('occurred_at', `${endDate}T23:59:59.999Z`),
    // Shows dated by scheduled_at; null scheduled_at rows are filtered in buildCommissionReport via fallback dates.
    ctx.service
      .from('events')
      .select(EVENT_FIELDS)
      .eq('event_type', 'show')
      .or(
        `and(scheduled_at.gte.${startDate}T00:00:00.000Z,scheduled_at.lte.${endDate}T23:59:59.999Z),scheduled_at.is.null`,
      ),
  ]);

  if (rosterError) return NextResponse.json({ error: rosterError.message }, { status: 500 });
  if (clientsError) return NextResponse.json({ error: clientsError.message }, { status: 500 });
  if (btError) return NextResponse.json({ error: btError.message }, { status: 500 });
  if (showError) return NextResponse.json({ error: showError.message }, { status: 500 });

  const report = buildCommissionReport(
    (roster ?? []) as RosterAgentWithPay[],
    clients ?? [],
    bookingTransferEvents ?? [],
    showEvents ?? [],
    startDate,
    endDate,
  );

  return NextResponse.json(report);
}
