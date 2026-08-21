import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildAdDrilldown,
  buildMultiAdDrilldown,
} from '@/lib/ad-performance';
import {
  loadLibraryVariants,
  loadMediaBuyerBoard,
  loadMediaBuyerDrilldownRows,
  uniqueAdNames,
} from '@/lib/media-buyer-window';

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
    const adParam = searchParams.get('ad');
    const libraryIdParam = searchParams.get('library_id');
    // Optional hint from the client — still verified against library aliases when
    // library_id is present, but unsourced rows can pass their known names.
    const variantsParam = searchParams.get('variants');

    const scope = { clientId: client_id, startDate: start_date, endDate: end_date };

    const respond = (payload: unknown) =>
      NextResponse.json(payload, {
        headers: { 'Cache-Control': 'private, max-age=20' },
      });

    const attachClientNames = async (
      drilldown: ReturnType<typeof buildAdDrilldown>,
    ) => {
      const clientIds = drilldown.perClient.map((r) => r.client_id);
      let names = new Map<string, string>();
      if (clientIds.length) {
        const { data: clients } = await ctx.service
          .from('clients')
          .select('id, name')
          .in('id', clientIds);
        names = new Map((clients ?? []).map((c) => [c.id, c.name]));
      }
      return {
        ...drilldown,
        perClient: drilldown.perClient.map((r) => ({
          ...r,
          client_name: names.get(r.client_id) ?? '—',
        })),
      };
    };

    // ── Drilldown: only the creative's variants, not the whole YTD window ─────
    if (libraryIdParam || adParam) {
      let displayName = adParam?.trim() || '';
      let variantNames = uniqueAdNames(
        variantsParam ? variantsParam.split('\n').map((s) => s.trim()) : adParam ? [adParam] : [],
      );
      let libraryId: string | null = libraryIdParam;

      if (libraryIdParam) {
        const resolved = await loadLibraryVariants(ctx.service, libraryIdParam);
        if (resolved.error) {
          return NextResponse.json(
            { error: resolved.error },
            { status: resolved.status ?? 500 },
          );
        }
        displayName = resolved.data!.library.ad_name;
        variantNames = resolved.data!.variantNames;
        libraryId = resolved.data!.library.id;
      }

      if (!displayName && variantNames[0]) displayName = variantNames[0];

      const slim = await loadMediaBuyerDrilldownRows(ctx.service, scope, variantNames);
      if (slim.error || !slim.data) {
        return NextResponse.json({ error: slim.error ?? 'Drilldown failed' }, { status: 500 });
      }

      const drilldown = libraryId
        ? buildMultiAdDrilldown(
            displayName,
            variantNames,
            slim.data.meta,
            slim.data.events,
            libraryId,
            { startDate: start_date, endDate: end_date },
          )
        : buildAdDrilldown(displayName, slim.data.meta, slim.data.events, {
            startDate: start_date,
            endDate: end_date,
          });

      return respond({
        ...(await attachClientNames(drilldown)),
        truncated: slim.data.truncated,
      });
    }

    // ── Leaderboard: shared derived board with Creative Command ───────────────
    const board = await loadMediaBuyerBoard(ctx.service, scope);
    if (board.error || !board.data) {
      return NextResponse.json({ error: board.error ?? 'Failed to load' }, { status: 500 });
    }

    return respond({ ads: board.data.ads, truncated: board.data.truncated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to load' },
      { status: 500 },
    );
  }
}
