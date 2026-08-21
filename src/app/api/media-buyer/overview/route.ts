import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { loadMediaBuyerBoard } from '@/lib/media-buyer-window';

export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (isAuthError(ctx)) return ctx;
    const denied = requirePermission(ctx, 'media_buyer');
    if (denied) return denied;

    const { searchParams } = new URL(req.url);
    const client_id = searchParams.get('client_id');
    const start_date = searchParams.get('start_date');
    const end_date = searchParams.get('end_date');

    const board = await loadMediaBuyerBoard(ctx.service, {
      clientId: client_id,
      startDate: start_date,
      endDate: end_date,
    });

    if (board.error || !board.data) {
      return NextResponse.json({ error: board.error ?? 'Failed to load' }, { status: 500 });
    }

    return NextResponse.json(
      { ...board.data.overview, truncated: board.data.truncated },
      { headers: { 'Cache-Control': 'private, max-age=20' } },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load creative intel' },
      { status: 500 },
    );
  }
}
