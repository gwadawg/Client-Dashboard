import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers } from '@/lib/api-auth';
import {
  invalidateOfferCatalogCache,
  loadOfferCatalog,
  type OfferCatalogKind,
  type OfferCatalogRow,
} from '@/lib/offer-catalog';

function cleanString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function cleanStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map(x => String(x).trim()).filter(Boolean);
}

function cleanBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return fallback;
}

function cleanInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const catalog = await loadOfferCatalog(ctx.service);
  return NextResponse.json({ catalog });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const body = await req.json();
  const kind = cleanString(body.kind) as OfferCatalogKind | null;
  const code = cleanString(body.code);
  const label = cleanString(body.label);

  if (!kind || (kind !== 'product' && kind !== 'sales_package')) {
    return NextResponse.json({ error: 'kind must be product or sales_package' }, { status: 400 });
  }
  if (!code || !label) {
    return NextResponse.json({ error: 'code and label are required' }, { status: 400 });
  }

  const insert = {
    kind,
    code,
    label,
    short_label: cleanString(body.short_label),
    description: cleanString(body.description),
    color: cleanString(body.color),
    background: cleanString(body.background),
    ghl_aliases: cleanStringArray(body.ghl_aliases),
    applies_to: cleanStringArray(body.applies_to),
    is_downsell: cleanBool(body.is_downsell, false),
    is_active: cleanBool(body.is_active, true),
    sort_order: cleanInt(body.sort_order, 0),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from('offer_catalog')
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateOfferCatalogCache();
  return NextResponse.json({ row: data as OfferCatalogRow });
}

export async function PATCH(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const body = await req.json();
  const id = cleanString(body.id);
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.label !== undefined) patch.label = cleanString(body.label);
  if (body.short_label !== undefined) patch.short_label = cleanString(body.short_label);
  if (body.description !== undefined) patch.description = cleanString(body.description);
  if (body.color !== undefined) patch.color = cleanString(body.color);
  if (body.background !== undefined) patch.background = cleanString(body.background);
  if (body.ghl_aliases !== undefined) patch.ghl_aliases = cleanStringArray(body.ghl_aliases);
  if (body.applies_to !== undefined) patch.applies_to = cleanStringArray(body.applies_to);
  if (body.is_downsell !== undefined) patch.is_downsell = cleanBool(body.is_downsell, false);
  if (body.is_active !== undefined) patch.is_active = cleanBool(body.is_active, true);
  if (body.sort_order !== undefined) patch.sort_order = cleanInt(body.sort_order, 0);

  const { data, error } = await ctx.service
    .from('offer_catalog')
    .update(patch)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  invalidateOfferCatalogCache();
  return NextResponse.json({ row: data as OfferCatalogRow });
}
