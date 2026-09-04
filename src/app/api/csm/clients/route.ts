import { NextRequest, NextResponse } from 'next/server';
import { assertCsmAuth, getCsmAuthContext } from '@/lib/csm-auth';
import { requireCsmApiAccess } from '@/lib/csm-api';
import { executeDataChatTool, type DataChatFilters } from '@/lib/ai/data-chat';

export const dynamic = 'force-dynamic';

/**
 * GET /api/csm/clients?search=
 * Thin list_clients wrapper for CSM kit name → id lookup.
 */
export async function GET(req: NextRequest) {
  const ctx = await getCsmAuthContext(req);
  if (!assertCsmAuth(ctx)) return ctx;

  const denied = requireCsmApiAccess(ctx);
  if (denied) return denied;

  const search = req.nextUrl.searchParams.get('search')?.trim() || undefined;
  const filters: DataChatFilters = {
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
  };

  try {
    const result = await executeDataChatTool(
      ctx,
      'client_success',
      'list_clients',
      search ? { search } : {},
      filters,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
