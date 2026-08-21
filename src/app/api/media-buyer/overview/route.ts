import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { AdLibraryResolver } from '@/lib/ad-performance';
import { buildCreativeIntel } from '@/lib/ad-creative-intel';
import { loadMediaBuyerWindow } from '@/lib/media-buyer-window';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const client_id = searchParams.get('client_id');
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');

  const window = await loadMediaBuyerWindow(ctx.service, {
    clientId: client_id,
    startDate: start_date,
    endDate: end_date,
  });

  if (window.error || !window.data) {
    return NextResponse.json({ error: window.error ?? 'Failed to load' }, { status: 500 });
  }

  const { events, meta, library, aliases, tagsById, truncated } = window.data;

  // Tags ride on the library meta: concept clusters group by product × tag.
  for (const row of library) {
    row.tags = tagsById.get(row.id) ?? [];
  }

  const report = buildCreativeIntel({
    metaRows: meta,
    events,
    resolver: new AdLibraryResolver(library, aliases),
    start: start_date,
    end: end_date,
  });

  return NextResponse.json(
    { ...report, truncated },
    { headers: { 'Cache-Control': 'private, max-age=20' } },
  );
}
