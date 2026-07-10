import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildAcquisitionEventRows,
  toAcquisitionMetaRows,
} from '@/lib/acquisition-ad-performance';
import { applyActiveCloseFilters } from '@/lib/acquisition-close-filter';
import {
  AdLibraryResolver,
  aggregateAdPerformance,
  buildAdDrilldown,
  buildMultiAdDrilldown,
  rollupAdPerformanceByLibrary,
  type AdLibraryAliasRow,
  type AdLibraryMeta,
} from '@/lib/ad-performance';

const META_SELECT = 'ad_name, insight_date, spend, impressions, clicks';
const LIBRARY_SELECT = 'id, ad_name, ad_format, drive_url';
const LEAD_SELECT = 'id, ad_name, created_at, qualified';
const APPT_SELECT = 'lead_id, appointment_type, booked_at, scheduled_at, status';
const CLOSE_SELECT = 'lead_id, closed_at';

function toLibraryMeta(row: {
  id: string;
  ad_name: string;
  ad_format?: string | null;
  drive_url?: string | null;
  angle_id?: string | null;
  angle_label?: string | null;
  creative_created_at?: string | null;
}): AdLibraryMeta & {
  angle_id?: string | null;
  angle_label?: string | null;
  creative_created_at?: string | null;
} {
  return {
    id: row.id,
    ad_name: row.ad_name,
    status: 'active',
    platform: 'facebook',
    ad_format: row.ad_format ?? null,
    product: null,
    summary: null,
    visual_notes: null,
    drive_url: row.drive_url ?? null,
    thumbnail_url: null,
    angle_id: row.angle_id ?? null,
    angle_label: row.angle_label ?? null,
    creative_created_at: row.creative_created_at ?? null,
  };
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const adParam = searchParams.get('ad');
  const libraryIdParam = searchParams.get('library_id');

  let metaQuery = ctx.service.from('acquisition_meta_ad_insights').select(META_SELECT);
  let leadsQuery = ctx.service.from('acquisition_leads').select(LEAD_SELECT);
  let apptsQuery = ctx.service.from('acquisition_appointments').select(APPT_SELECT);
  let closesQuery = applyActiveCloseFilters(ctx.service.from('acquisition_closes').select(CLOSE_SELECT));

  if (start_date) {
    metaQuery = metaQuery.gte('insight_date', start_date);
    leadsQuery = leadsQuery.gte('created_at', `${start_date}T00:00:00.000Z`);
    apptsQuery = apptsQuery.or(`booked_at.gte.${start_date}T00:00:00.000Z,scheduled_at.gte.${start_date}T00:00:00.000Z`);
    closesQuery = closesQuery.gte('closed_at', `${start_date}T00:00:00.000Z`);
  }
  if (end_date) {
    metaQuery = metaQuery.lte('insight_date', end_date);
    leadsQuery = leadsQuery.lte('created_at', `${end_date}T23:59:59.999Z`);
    apptsQuery = apptsQuery.lte('scheduled_at', `${end_date}T23:59:59.999Z`);
    closesQuery = closesQuery.lte('closed_at', `${end_date}T23:59:59.999Z`);
  }

  metaQuery = metaQuery.limit(100000);
  leadsQuery = leadsQuery.limit(100000);
  apptsQuery = apptsQuery.limit(100000);
  closesQuery = closesQuery.limit(100000);

  const [
    { data: meta, error: metaError },
    { data: leads, error: leadsError },
    { data: appts, error: apptsError },
    { data: closes, error: closesError },
    { data: library, error: libError },
    { data: aliases, error: aliasError },
    { data: angles },
  ] = await Promise.all([
    metaQuery,
    leadsQuery,
    apptsQuery,
    closesQuery,
    ctx.service.from('acquisition_ad_library').select(`${LIBRARY_SELECT}, angle_id, creative_created_at`),
    ctx.service.from('acquisition_ad_library_aliases').select('id, library_id, alias_name'),
    ctx.service.from('acquisition_ad_angles').select('id, label').eq('is_active', true),
  ]);

  if (metaError || leadsError || apptsError || closesError || libError || aliasError) {
    return NextResponse.json(
      { error: metaError?.message ?? leadsError?.message ?? apptsError?.message ?? closesError?.message ?? libError?.message ?? aliasError?.message },
      { status: 500 },
    );
  }

  const angleLabels = new Map((angles ?? []).map((a) => [a.id, a.label]));
  const metaRows = toAcquisitionMetaRows(meta ?? []);
  const eventRows = buildAcquisitionEventRows(leads ?? [], appts ?? [], closes ?? []);
  const libraryRows = (library ?? []).map((row) =>
    toLibraryMeta({
      ...row,
      angle_label: row.angle_id ? angleLabels.get(row.angle_id) ?? null : null,
    }),
  ) as AdLibraryMeta[];
  const aliasRows = (aliases ?? []) as AdLibraryAliasRow[];
  const resolver = new AdLibraryResolver(libraryRows, aliasRows);

  if (libraryIdParam) {
    const lib = libraryRows.find((l) => l.id === libraryIdParam);
    if (!lib) {
      return NextResponse.json({ error: 'Library entry not found' }, { status: 404 });
    }
    const variantNames = resolver.variantNamesFor(lib.id, lib.ad_name);
    const drilldown = buildMultiAdDrilldown(lib.ad_name, variantNames, metaRows, eventRows, lib.id);
    return NextResponse.json({ ...drilldown, perClient: [] });
  }

  if (adParam) {
    const drilldown = buildAdDrilldown(adParam, metaRows, eventRows);
    return NextResponse.json({ ...drilldown, perClient: [] });
  }

  const perName = aggregateAdPerformance(metaRows, eventRows);
  const ads = rollupAdPerformanceByLibrary(perName, resolver).map((row) => {
    const { client_ids: _omit, client_count: _cc, ...rest } = row;
    if (row.library) {
      const ext = row.library as AdLibraryMeta & {
        angle_id?: string | null;
        angle_label?: string | null;
        creative_created_at?: string | null;
      };
      return {
        ...rest,
        library: {
          id: ext.id,
          ad_format: ext.ad_format,
          drive_url: ext.drive_url,
          angle_id: ext.angle_id ?? null,
          angle_label: ext.angle_label ?? null,
          creative_created_at: ext.creative_created_at ?? null,
        },
      };
    }
    return rest;
  });

  return NextResponse.json({ ads });
}
