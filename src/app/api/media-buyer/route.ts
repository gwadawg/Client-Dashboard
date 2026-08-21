import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  AdLibraryResolver,
  aggregateAdPerformance,
  buildAdDrilldown,
  buildMultiAdDrilldown,
  rollupAdPerformanceByLibrary,
} from '@/lib/ad-performance';
import {
  loadLibraryVariants,
  loadMediaBuyerDrilldownRows,
  loadMediaBuyerWindow,
  uniqueAdNames,
} from '@/lib/media-buyer-window';

function stripClientIds<T extends { client_ids?: string[] }>(row: T): Omit<T, 'client_ids'> {
  const rest = { ...row };
  delete rest.client_ids;
  return rest;
}

export async function GET(req: Request) {
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

  // ── Leaderboard: shared window with Creative Command ──────────────────────
  const window = await loadMediaBuyerWindow(ctx.service, scope);
  if (window.error || !window.data) {
    return NextResponse.json({ error: window.error ?? 'Failed to load' }, { status: 500 });
  }

  const { events, meta, library, aliases, tagsById, truncated } = window.data;
  const resolver = new AdLibraryResolver(library, aliases);
  const perName = aggregateAdPerformance(meta, events);
  const ads = rollupAdPerformanceByLibrary(perName, resolver).map((row) => {
    const stripped = stripClientIds(row);
    if (row.library) {
      return {
        ...stripped,
        library: {
          id: row.library.id,
          status: row.library.status,
          ad_format: row.library.ad_format,
          product: row.library.product,
          summary: row.library.summary,
          visual_notes: row.library.visual_notes,
          drive_url: row.library.drive_url,
          thumbnail_url: row.library.thumbnail_url,
          tags: tagsById.get(row.library.id) ?? [],
        },
      };
    }
    return stripped;
  });

  return respond({ ads, truncated });
}
