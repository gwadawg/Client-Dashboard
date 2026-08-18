import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { createAdTag, listAdTags } from '@/lib/ad-tags-db';

const TAG_PERMS = ['media_buyer', 'acquisition_marketing'] as const;

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...TAG_PERMS]);
  if (denied) return denied;

  const { data, error } = await listAdTags(ctx.service);
  if (error) {
    const hint = error.message.includes('does not exist')
      ? ' Run migration add_ad_tags_catalog.sql on Supabase.'
      : '';
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...TAG_PERMS]);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const result = await createAdTag(ctx.service, body.label);
  if (result.error || !result.data) {
    return NextResponse.json({ error: result.error ?? 'Failed to create tag' }, { status: result.status });
  }
  return NextResponse.json(result.data, { status: 201 });
}
