import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { isYmd } from '@/lib/billing-work-report';
import { loadClientReportItemized } from '@/lib/client-report-itemized';

/**
 * Authenticated itemized lists for the client report builder.
 * Query: client_id, start_date, end_date, include_work=1, include_leads=1
 */
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['dashboard', 'agents', 'client_report_builder']);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id')?.trim() ?? '';
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const includeWork = searchParams.get('include_work') === '1';
  const includeLeads = searchParams.get('include_leads') === '1';

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }
  if (!isYmd(startDate) || !isYmd(endDate)) {
    return NextResponse.json(
      { error: 'start_date and end_date (YYYY-MM-DD) are required' },
      { status: 400 },
    );
  }
  if (startDate > endDate) {
    return NextResponse.json(
      { error: 'start_date must be on or before end_date' },
      { status: 400 },
    );
  }
  if (!includeWork && !includeLeads) {
    return NextResponse.json(
      { error: 'At least one of include_work or include_leads must be 1' },
      { status: 400 },
    );
  }

  const { data: client, error: clientErr } = await ctx.service
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle();

  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  try {
    const data = await loadClientReportItemized(ctx.service, {
      clientId: client.id,
      clientName: client.name,
      periodStart: startDate,
      periodEnd: endDate,
      includeWork,
      includeLeads,
    });
    return NextResponse.json(data);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load itemized report';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
