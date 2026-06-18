import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  buildAcquisitionLeadProfile,
  matchesFunnelStageFilter,
  type AcquisitionLeadProfile,
} from '@/lib/acquisition-lead-profiles';
import {
  isAcquisitionLeadSource,
  normalizeAcquisitionLeadSource,
} from '@/lib/acquisition-lead-source';

const PAGE_SIZE = 50;
const MAX_LEADS = 5_000;

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const start_date = searchParams.get('start_date');
  const end_date = searchParams.get('end_date');
  const funnel_stage = searchParams.get('funnel_stage')?.trim() ?? '';
  const search = searchParams.get('search')?.trim();
  const safeSearch = search ? search.replace(/[,()*]/g, ' ').trim() : '';
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));

  let q = ctx.service
    .from('acquisition_leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(MAX_LEADS);

  if (!safeSearch) {
    if (start_date) q = q.gte('created_at', `${start_date}T00:00:00.000Z`);
    if (end_date) q = q.lte('created_at', `${end_date}T23:59:59.999Z`);
  } else {
    q = q.or(
      `lead_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%`,
    );
  }

  const { data: leadRows, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const leads = leadRows ?? [];
  if (leads.length === 0) {
    return NextResponse.json({
      rows: [],
      total: 0,
      page,
      page_size: PAGE_SIZE,
      leads_loaded: 0,
      capped: false,
    });
  }

  const leadIds = leads.map(l => l.id);

  const convertedLeadIds = leads.filter(l => l.converted_client_id).map(l => l.id);

  const [apptsRes, offersRes, closesRes, dialsRes, callsRes, journeyRes] = await Promise.all([
    ctx.service.from('acquisition_appointments').select('*').in('lead_id', leadIds),
    ctx.service.from('acquisition_offers').select('*').in('lead_id', leadIds),
    ctx.service.from('acquisition_closes').select('*').in('lead_id', leadIds),
    ctx.service.from('acquisition_dials').select('*').in('lead_id', leadIds),
    ctx.service.from('acquisition_calls').select('*').in('lead_id', leadIds),
    convertedLeadIds.length > 0
      ? ctx.service
          .from('v_lead_journey')
          .select('*')
          .in('lead_id', convertedLeadIds)
          .eq('domain', 'client')
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (apptsRes.error) return NextResponse.json({ error: apptsRes.error.message }, { status: 500 });
  if (offersRes.error) return NextResponse.json({ error: offersRes.error.message }, { status: 500 });
  if (closesRes.error) return NextResponse.json({ error: closesRes.error.message }, { status: 500 });
  if (dialsRes.error) return NextResponse.json({ error: dialsRes.error.message }, { status: 500 });
  if (callsRes.error) return NextResponse.json({ error: callsRes.error.message }, { status: 500 });
  if (journeyRes.error) return NextResponse.json({ error: journeyRes.error.message }, { status: 500 });

  const apptsByLead = groupBy(leadIds, apptsRes.data ?? [], 'lead_id');
  const offersByLead = groupBy(leadIds, offersRes.data ?? [], 'lead_id');
  const closesByLead = groupBy(leadIds, closesRes.data ?? [], 'lead_id');
  const dialsByLead = groupBy(leadIds, dialsRes.data ?? [], 'lead_id');
  const callsByLead = groupBy(leadIds, callsRes.data ?? [], 'lead_id');
  const journeyByLead = groupBy(leadIds, journeyRes.data ?? [], 'lead_id');

  let profiles: AcquisitionLeadProfile[] = leads.map(lead =>
    buildAcquisitionLeadProfile(
      lead,
      apptsByLead.get(lead.id) ?? [],
      offersByLead.get(lead.id) ?? [],
      closesByLead.get(lead.id) ?? [],
      dialsByLead.get(lead.id) ?? [],
      callsByLead.get(lead.id) ?? [],
      journeyByLead.get(lead.id) ?? [],
    ),
  );

  if (funnel_stage) {
    profiles = profiles.filter(p => matchesFunnelStageFilter(p, funnel_stage));
  }

  const total = profiles.length;
  const offset = (page - 1) * PAGE_SIZE;
  const pageRows = profiles.slice(offset, offset + PAGE_SIZE);

  return NextResponse.json({
    rows: pageRows,
    total,
    page,
    page_size: PAGE_SIZE,
    leads_loaded: leads.length,
    capped: leads.length >= MAX_LEADS,
  });
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition');
  if (denied) return denied;

  let payload: { lead_id?: string; source?: string | null };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const leadId = payload.lead_id?.trim();
  if (!leadId) {
    return NextResponse.json({ error: 'lead_id is required' }, { status: 400 });
  }

  const rawSource = payload.source;
  if (rawSource === undefined) {
    return NextResponse.json({ error: 'source is required (use null to clear)' }, { status: 400 });
  }

  const source =
    rawSource === null || rawSource === ''
      ? null
      : isAcquisitionLeadSource(rawSource)
        ? rawSource
        : normalizeAcquisitionLeadSource(rawSource);

  if (rawSource !== null && rawSource !== '' && !source) {
    return NextResponse.json(
      { error: 'source must be organic, Meta, Referral, Cold, or null' },
      { status: 400 },
    );
  }

  const { data: existing } = await ctx.service
    .from('acquisition_leads')
    .select('id, raw')
    .eq('id', leadId)
    .maybeSingle();

  if (!existing) {
    return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  }

  const raw =
    existing.raw && typeof existing.raw === 'object' && !Array.isArray(existing.raw)
      ? { ...(existing.raw as Record<string, unknown>) }
      : {};

  const { data, error } = await ctx.service
    .from('acquisition_leads')
    .update({
      source,
      raw: { ...raw, lead_source_manual: source, lead_source_updated_at: new Date().toISOString(), lead_source_updated_via: 'dashboard' },
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
    .select('id, source')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, lead_id: data.id, source: data.source });
}

function groupBy<T extends { lead_id: string | null }>(
  leadIds: string[],
  rows: T[],
  key: keyof T,
): Map<string, T[]> {
  const allowed = new Set(leadIds);
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = row[key] as string | null;
    if (!id || !allowed.has(id)) continue;
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}
