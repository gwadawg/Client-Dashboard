import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';

const VALID_AD_FORMAT = ['static', 'ugc'] as const;

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

function cleanEnum<T extends readonly string[]>(v: unknown, allowed: T): T[number] | null {
  const s = cleanString(v);
  if (!s) return null;
  return allowed.includes(s as T[number]) ? (s as T[number]) : null;
}

function cleanDate(v: unknown): string | null {
  const s = cleanString(v);
  if (!s) return null;
  const dateOnly = s.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('ad_name' in body) {
    const ad_name = cleanString(body.ad_name);
    if (!ad_name) return NextResponse.json({ error: 'ad_name cannot be empty' }, { status: 400 });
    updates.ad_name = ad_name;
  }
  if ('ad_format' in body) {
    if (body.ad_format == null || body.ad_format === '') {
      updates.ad_format = null;
    } else {
      const ad_format = cleanEnum(body.ad_format, VALID_AD_FORMAT);
      if (!ad_format) {
        return NextResponse.json({ error: `ad_format must be one of: ${VALID_AD_FORMAT.join(', ')}` }, { status: 400 });
      }
      updates.ad_format = ad_format;
    }
  }
  if ('drive_url' in body) updates.drive_url = cleanString(body.drive_url);
  if ('angle_id' in body) {
    updates.angle_id = body.angle_id == null || body.angle_id === '' ? null : cleanString(body.angle_id);
  }
  if ('creative_created_at' in body) {
    updates.creative_created_at =
      body.creative_created_at == null || body.creative_created_at === ''
        ? null
        : cleanDate(body.creative_created_at);
  }

  const { data, error } = await ctx.service
    .from('acquisition_ad_library')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Another ad with that name already exists.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Ad not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from('acquisition_ad_library').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
