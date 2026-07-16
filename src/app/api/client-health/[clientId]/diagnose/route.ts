import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  fetchClientContextPackage,
  formatCrmContextForAi,
} from '@/lib/fetch-client-package';
import { buildClientHealthSnapshot } from '@/lib/client-health';
import { fetchCombinedTrendSpend } from '@/lib/spend';
import { runAiDiagnosis, type WindowMetrics } from '@/lib/ai-diagnose';
import type { ClientKpiBenchmarks } from '@/lib/client-health';
import type { EventRow } from '@/lib/metrics';

type DatedEvent = { event_type: string; occurred_at: string; is_qualified?: boolean | null };
type DailySpend = { spend_date: string; amount: number | string };

const FUNDED = new Set(['loan_funded', 'closed']);

function shift(anchor: string, days: number): string {
  const d = new Date(`${anchor}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().split('T')[0];
}

function windowCounts(
  events: DatedEvent[],
  spend: DailySpend[],
  start: string,
  end: string,
): WindowMetrics {
  const startIso = `${start}T00:00:00.000Z`;
  const endIso = `${end}T23:59:59.999Z`;
  const inRange = events.filter(e => e.occurred_at >= startIso && e.occurred_at <= endIso);
  const spendTotal = spend
    .filter(s => s.spend_date >= start && s.spend_date <= end)
    .reduce((sum, s) => sum + Number(s.amount), 0);

  const leadEvents = inRange.filter(e => e.event_type === 'lead');
  return {
    spend: Math.round(spendTotal * 100) / 100,
    leads: leadEvents.length,
    qualified_leads: leadEvents.filter(e => e.is_qualified === true).length,
    appts_booked: inRange.filter(e => e.event_type === 'appointment_booked').length,
    appts_showed: inRange.filter(e => e.event_type === 'show').length,
    no_shows: inRange.filter(e => e.event_type === 'no_show').length,
    live_transfers: inRange.filter(e => e.event_type === 'live_transfer').length,
    claimed: inRange.filter(e => e.event_type === 'claimed').length,
    lo_bailed: inRange.filter(e => e.event_type === 'lo_bailed').length,
    deals_closed: inRange.filter(e => FUNDED.has(e.event_type)).length,
    dials: inRange.filter(e => e.event_type === 'dial').length,
  };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ clientId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'client_health');
  if (denied) return denied;

  const { clientId } = await params;
  const body = await req.json().catch(() => ({}));
  const endDate: string = body?.end_date || new Date().toISOString().split('T')[0];
  const phase: 'launch' | 'stable' | 'scaling' = body?.phase || 'stable';

  const w30Start = shift(endDate, 29);

  const w14Start = shift(endDate, 13);
  const [{ data: client, error: clientError }, { data: events, error: eventsError }, spendDaily, crmRes] =
    await Promise.all([
      ctx.service.from('clients').select('id, name, kpi_benchmarks').eq('id', clientId).single(),
      ctx.service
        .from('events')
        .select(
          'event_type, occurred_at, is_qualified, is_pickup, is_conversation, speed_to_lead_seconds, is_hot, is_out_of_state, ghl_contact_id, lead_phone, lead_email, lead_name, client_id',
        )
        .eq('client_id', clientId)
        .gte('occurred_at', `${w30Start}T00:00:00.000Z`)
        .lte('occurred_at', `${endDate}T23:59:59.999Z`)
        .limit(200000),
      fetchCombinedTrendSpend(ctx.service, {
        client_id: clientId,
        start_date: w30Start,
        end_date: endDate,
      }),
      fetchClientContextPackage(ctx.service, clientId),
    ]);

  if (clientError || !client) {
    return NextResponse.json({ error: clientError?.message ?? 'Client not found' }, { status: 404 });
  }
  if (eventsError) {
    return NextResponse.json({ error: eventsError.message }, { status: 500 });
  }

  const evs = (events ?? []) as DatedEvent[];
  const input = {
    client: client.name,
    review_date: endDate,
    phase,
    windows: {
      w7: windowCounts(evs, spendDaily, shift(endDate, 6), endDate),
      w14: windowCounts(evs, spendDaily, shift(endDate, 13), endDate),
      w14_prior: windowCounts(evs, spendDaily, shift(endDate, 27), shift(endDate, 14)),
      w30: windowCounts(evs, spendDaily, w30Start, endDate),
    },
  };

  // Per-client benchmark overrides so the AI judges against the same bar as the
  // grader (closes redesign open Q3). Sparse: absent KPIs inherit global defaults.
  const benchmarks = (client.kpi_benchmarks ?? null) as ClientKpiBenchmarks | null;

  const crmContext =
    'error' in crmRes ? null : formatCrmContextForAi(crmRes.pkg);

  let diagnosis;
  try {
    diagnosis = await runAiDiagnosis(input, benchmarks, crmContext);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'AI diagnosis failed';
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  const w14Events = evs.filter(
    e => e.occurred_at >= `${w14Start}T00:00:00.000Z` && e.occurred_at <= `${endDate}T23:59:59.999Z`,
  );
  const w14Spend = spendDaily.filter(s => s.spend_date >= w14Start && s.spend_date <= endDate);
  const healthSnap = buildClientHealthSnapshot(
    w14Events as EventRow[],
    w14Spend,
    benchmarks,
  );

  const w14 = input.windows.w14;
  await ctx.service.from('client_health_snapshots').insert({
    client_id: clientId,
    period_start: w14Start,
    period_end: endDate,
    window_code: 'W14',
    cpconv: healthSnap.cpconv,
    cpql: healthSnap.cpql,
    cpl: healthSnap.metrics.cpl,
    conversation_yield: healthSnap.conversation_yield,
    show_rate: healthSnap.metrics.net_show_pct,
    booking_rate: healthSnap.metrics.appt_booking_rate,
    lead_to_qual: healthSnap.lead_to_qualified_pct,
    attention_score: healthSnap.attention_score,
    worst_tier: healthSnap.worst_tier,
    primary_constraint: diagnosis.primary_constraint,
    constraint_label: healthSnap.constraint_label,
    metrics: healthSnap.metrics,
    ai_diagnosis: diagnosis,
    created_by: ctx.userId,
  });

  return NextResponse.json({ input, diagnosis, crm_context_included: !!crmContext });
}
