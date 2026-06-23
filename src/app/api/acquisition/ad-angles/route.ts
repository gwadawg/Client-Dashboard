import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('acquisition_ad_angles')
    .select('id, label, sort_order, is_active, created_at')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const label = cleanString(body.label);
  if (!label) return NextResponse.json({ error: 'label is required' }, { status: 400 });

  const sort_order = typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
    ? body.sort_order
    : 0;

  const { data, error } = await ctx.service
    .from('acquisition_ad_angles')
    .insert({ label, sort_order })
    .select('id, label, sort_order, is_active, created_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An angle with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
