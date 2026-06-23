import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { normalizeAdName } from '@/lib/ad-performance';

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { id: library_id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const alias_name = cleanString(body.alias_name);
  if (!alias_name) {
    return NextResponse.json({ error: 'alias_name is required' }, { status: 400 });
  }

  const { data: lib, error: libError } = await ctx.service
    .from('acquisition_ad_library')
    .select('id, ad_name')
    .eq('id', library_id)
    .maybeSingle();

  if (libError) return NextResponse.json({ error: libError.message }, { status: 500 });
  if (!lib) return NextResponse.json({ error: 'Library entry not found' }, { status: 404 });

  if (normalizeAdName(lib.ad_name)?.toLowerCase() === alias_name.toLowerCase()) {
    return NextResponse.json(
      { error: 'This name is already the primary ad name for this library entry.' },
      { status: 400 },
    );
  }

  const { data: existingLib } = await ctx.service
    .from('acquisition_ad_library')
    .select('id')
    .ilike('ad_name', alias_name)
    .maybeSingle();

  if (existingLib) {
    return NextResponse.json(
      { error: `Another library entry already uses the name "${alias_name}".` },
      { status: 409 },
    );
  }

  const { data, error } = await ctx.service
    .from('acquisition_ad_library_aliases')
    .insert({ library_id, alias_name })
    .select('id, library_id, alias_name, created_at')
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `"${alias_name}" is already linked to another creative.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
