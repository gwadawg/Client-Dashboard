import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

const VALID_STATUS = ['active', 'winner', 'paused', 'archived'] as const;

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('ad_library')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const ad_name = cleanString(body.ad_name);
  if (!ad_name) {
    return NextResponse.json({ error: 'ad_name is required' }, { status: 400 });
  }

  const status = cleanString(body.status) ?? 'active';
  if (!VALID_STATUS.includes(status as (typeof VALID_STATUS)[number])) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUS.join(', ')}` },
      { status: 400 },
    );
  }

  const row = {
    ad_name,
    platform: cleanString(body.platform) ?? 'facebook',
    status,
    summary: cleanString(body.summary),
    visual_notes: cleanString(body.visual_notes),
    drive_url: cleanString(body.drive_url),
    thumbnail_url: cleanString(body.thumbnail_url),
    created_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from('ad_library')
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: `An ad named "${ad_name}" already exists in the library.` },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(data, { status: 201 });
}
