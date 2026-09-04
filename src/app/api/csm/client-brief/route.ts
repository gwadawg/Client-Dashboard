import { NextRequest, NextResponse } from 'next/server';
import {
  assertCsmAuth,
  getCsmAuthContext,
  requireCsmBriefAccess,
} from '@/lib/csm-auth';
import { executeDataChatTool, type DataChatFilters } from '@/lib/ai/data-chat';

export const dynamic = 'force-dynamic';

function defaultRange(): { start_date: string; end_date: string } {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - 29);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start_date: iso(start), end_date: iso(end) };
}

/**
 * GET /api/csm/client-brief?clientId=&start_date=&end_date=
 *
 * Guarded Client Success brief for Cursor / CSM kit.
 * Reuses Data Chat client_success executors — no billing/payroll/expenses.
 */
export async function GET(req: NextRequest) {
  const ctx = await getCsmAuthContext(req);
  if (!assertCsmAuth(ctx)) return ctx;

  const denied = requireCsmBriefAccess(ctx);
  if (denied) return denied;

  const clientId = req.nextUrl.searchParams.get('clientId')?.trim();
  if (!clientId) {
    return NextResponse.json({ error: 'clientId is required' }, { status: 400 });
  }

  const defaults = defaultRange();
  const start_date = req.nextUrl.searchParams.get('start_date')?.trim() || defaults.start_date;
  const end_date = req.nextUrl.searchParams.get('end_date')?.trim() || defaults.end_date;

  const filters: DataChatFilters = {
    start_date,
    end_date,
    client_id: clientId,
  };
  const input = { client_id: clientId };

  try {
    const [profile, metricsRaw, health, notes, interventions] = await Promise.all([
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

    const metrics = metricsRaw as {
      funnel?: unknown;
      dials?: unknown;
      cost?: unknown;
      range?: unknown;
      scope?: unknown;
    };

    return NextResponse.json({
      clientId,
      range: { start_date, end_date },
      profile,
      health,
      metrics: {
        range: metrics.range,
        scope: metrics.scope,
        funnel: metrics.funnel,
        dials: metrics.dials,
        // Fulfillment ad KPI money only (CPL etc.) — not billing/MRR/payroll
        cost: metrics.cost,
      },
      notes,
      interventions,
      exclusions: [
        'mrr',
        'invoices',
        'stripe',
        'payroll_amounts',
        'expenses',
        'retainers',
        'owner_pnl',
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Brief failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
