import { NextRequest, NextResponse } from 'next/server';
import { assertCsmAuth, getCsmAuthContext } from '@/lib/csm-auth';
import { CSM_API_EXCLUSIONS, parseCsmRange, requireCsmApiAccess } from '@/lib/csm-api';
import { executeDataChatTool } from '@/lib/ai/data-chat';

export const dynamic = 'force-dynamic';

/**
 * GET /api/csm/team-performance?start_date=&end_date=&clientId=&live_only=1
 *
 * Team dials, conversions (scorecards), and dial performance for CSM Cursor.
 * Optional clientId scopes to one account.
 */
export async function GET(req: NextRequest) {
  const ctx = await getCsmAuthContext(req);
  if (!assertCsmAuth(ctx)) return ctx;

  const denied = requireCsmApiAccess(ctx);
  if (denied) return denied;

  const filters = parseCsmRange(req);
  const input = filters.client_id ? { client_id: filters.client_id } : {};

  try {
    const [dial_performance, agent_scorecards] = await Promise.all([
      executeDataChatTool(ctx, 'call_rep_questions', 'get_dial_performance', input, filters),
      executeDataChatTool(ctx, 'call_rep_questions', 'get_agent_scorecards', input, filters),
    ]);

    return NextResponse.json({
      range: { start_date: filters.start_date, end_date: filters.end_date },
      client_id: filters.client_id,
      live_only: filters.live_only ?? false,
      dial_performance,
      agent_scorecards,
      exclusions: [...CSM_API_EXCLUSIONS],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Team performance failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
