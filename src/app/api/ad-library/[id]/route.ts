import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import { resolveAdFormatSlug } from '@/lib/ad-formats-db';
import { replaceLibraryTags, resolveTagSlugs, withLibraryTags } from '@/lib/ad-tags-db';

const VALID_STATUS = ['active', 'winner', 'paused', 'archived'] as const;
const VALID_PRODUCT = ['reverse', 'dscr', 'broad_forward'] as const;

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

function cleanEnum<T extends readonly string[]>(
  v: unknown,
  allowed: T,
): T[number] | null {
  const s = cleanString(v);
  if (!s) return null;
  return allowed.includes(s as T[number]) ? (s as T[number]) : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
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
  if ('status' in body) {
    const status = cleanString(body.status);
    if (!status || !VALID_STATUS.includes(status as (typeof VALID_STATUS)[number])) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUS.join(', ')}` },
        { status: 400 },
      );
    }
    updates.status = status;
  }
  if ('ad_format' in body) {
    const formatResult = await resolveAdFormatSlug(ctx.service, body.ad_format);
    if (formatResult.error) {
      return NextResponse.json({ error: formatResult.error }, { status: 400 });
    }
    updates.ad_format = formatResult.slug;
  }
  if ('product' in body) {
    if (body.product == null || body.product === '') {
      updates.product = null;
    } else {
      const product = cleanEnum(body.product, VALID_PRODUCT);
      if (!product) {
        return NextResponse.json(
          { error: `product must be one of: ${VALID_PRODUCT.join(', ')}` },
          { status: 400 },
        );
      }
      updates.product = product;
    }
  }
  for (const key of ['platform', 'summary', 'visual_notes', 'drive_url', 'thumbnail_url'] as const) {
    if (key in body) updates[key] = cleanString(body[key]);
  }

  let nextTags: string[] | null = null;
  if ('tags' in body) {
    const tagResult = await resolveTagSlugs(ctx.service, body.tags);
    if (tagResult.error) {
      return NextResponse.json({ error: tagResult.error }, { status: 400 });
    }
    nextTags = tagResult.slugs;
  }

  const { data, error } = await ctx.service
    .from('ad_library')
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

  if (nextTags !== null) {
    const tagWrite = await replaceLibraryTags(ctx.service, id, nextTags);
    if (tagWrite.error) {
      return NextResponse.json({ error: tagWrite.error }, { status: 500 });
    }
  }

  const withTags = await withLibraryTags(ctx.service, [data]);
  return NextResponse.json(withTags.data[0] ?? { ...data, tags: [] });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from('ad_library').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
