import { NextRequest, NextResponse } from 'next/server';
import { assertCsmAuth, getCsmAuthContext } from '@/lib/csm-auth';
import { CSM_API_EXCLUSIONS, parseCsmRange, requireCsmApiAccess } from '@/lib/csm-api';
import { executeDataChatTool } from '@/lib/ai/data-chat';

export const dynamic = 'force-dynamic';

/**
 * GET /api/csm/client-brief?clientId=&start_date=&end_date=&include=calls,dials,scorecards
 *
 * Client history for CSM Cursor: profile, health, funnel/conversions, dials,
 * scorecards, and account calls. No MRR/billing/expenses/CEO revenue.
 */
export async function GET(req: NextRequest) {
  const ctx = await getCsmAuthContext(req);
  if (!assertCsmAuth(ctx)) return ctx;

  const denied = requireCsmApiAccess(ctx);
  if (denied) return denied;

  const clientId = req.nextUrl.searchParams.get('clientId')?.trim();
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const includeRaw = (req.nextUrl.searchParams.get('include') || 'calls,dials,scorecards')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const include = new Set(includeRaw);

  const filters = parseCsmRange(req);
  filters.client_id = clientId;
  const input = { client_id: clientId };

  try {
    const base = await Promise.all([
      executeDataChatTool(ctx, 'client_success', 'get_client_profile', input, filters),
      executeDataChatTool(ctx, 'client_success', 'get_fulfillment_metrics', input, filters),
      executeDataChatTool(ctx, 'client_success', 'get_client_health_summary', input, filters),
      executeDataChatTool(
        ctx,
        'client_success',
        'get_client_notes',
        { ...input, limit: 10 },
        filters,
      ),
      executeDataChatTool(
        ctx,
        'client_success',
        'get_client_interventions',
        { ...input, limit: 10 },
        filters,
      ),
    ]);

    const [profile, metricsRaw, health, notes, interventions] = base;
    const metrics = metricsRaw as {
      funnel?: unknown;
      dials?: unknown;
      cost?: unknown;
      range?: unknown;
      scope?: unknown;
    };

    const extras: Record<string, unknown> = {};
    const extraJobs: Promise<void>[] = [];

    if (include.has('dials')) {
      extraJobs.push(
        executeDataChatTool(ctx, 'call_rep_questions', 'get_dial_performance', input, filters).then(
          v => {
            extras.dial_performance = v;
          },
        ),
      );
    }
    if (include.has('scorecards')) {
      extraJobs.push(
        executeDataChatTool(ctx, 'call_rep_questions', 'get_agent_scorecards', input, filters).then(
          v => {
            extras.agent_scorecards = v;
          },
        ),
      );
    }
    if (include.has('calls')) {
      extraJobs.push(
        executeDataChatTool(
          ctx,
          'client_questions',
          'search_client_calls',
          { ...input, limit: 15 },
          filters,
        ).then(v => {
          extras.calls = v;
        }),
      );
    }
    await Promise.all(extraJobs);

    return NextResponse.json({
      clientId,
      range: { start_date: filters.start_date, end_date: filters.end_date },
      profile,
      health,
      // Funnel = conversions (leads → books → shows). dials on metrics = account dial KPIs.
      metrics: {
        range: metrics.range,
        scope: metrics.scope,
        funnel: metrics.funnel,
        dials: metrics.dials,
        // Client ad CPL/spend for account coaching — not Waiz P&L / expense ledger
        fulfillment_ad_kpis: metrics.cost,
      },
      notes,
      interventions,
      ...extras,
      exclusions: [...CSM_API_EXCLUSIONS],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Brief failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
