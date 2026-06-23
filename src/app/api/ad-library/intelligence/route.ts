import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  AD_LIBRARY_INTELLIGENCE_SELECT,
  isValidAdKnowledgeCaptureStatus,
  isValidAdProduct,
} from '@/lib/ad-intelligence';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'media_buyer');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id')?.trim();
  const status = searchParams.get('status')?.trim();
  const product = searchParams.get('product')?.trim();
  const libraryStatus = searchParams.get('library_status')?.trim();
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

  if (status && !isValidAdKnowledgeCaptureStatus(status)) {
    return NextResponse.json({ error: 'Invalid knowledge_capture_status' }, { status: 400 });
  }
  if (product && !isValidAdProduct(product)) {
    return NextResponse.json({ error: 'Invalid product' }, { status: 400 });
  }

  let query = ctx.service
    .from('ad_library')
    .select(AD_LIBRARY_INTELLIGENCE_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (id) query = query.eq('id', id);
  if (status) query = query.eq('knowledge_capture_status', status);
  if (product) query = query.eq('product', product);
  if (libraryStatus) query = query.eq('status', libraryStatus);

  const { data: library, error, count } = await query;
  if (error) {
    const hint =
      error.message.includes('knowledge_capture_status') || error.message.includes('does not exist')
        ? ' Run migration add_ad_library_knowledge_capture.sql on Supabase.'
        : '';
    return NextResponse.json({ error: error.message + hint }, { status: 500 });
  }

  const ids = (library ?? []).map((r) => r.id);
  let aliasesByLibrary = new Map<string, { id: string; alias_name: string; created_at: string }[]>();
  if (ids.length > 0) {
    const { data: aliases, error: aliasError } = await ctx.service
      .from('ad_library_aliases')
      .select('id, library_id, alias_name, created_at')
      .in('library_id', ids);
    if (aliasError) {
      return NextResponse.json({ error: aliasError.message }, { status: 500 });
    }
    for (const a of aliases ?? []) {
      const list = aliasesByLibrary.get(a.library_id) ?? [];
      list.push({ id: a.id, alias_name: a.alias_name, created_at: a.created_at });
      aliasesByLibrary.set(a.library_id, list);
    }
  }

  const rows = (library ?? []).map((entry) => ({
    ...entry,
    aliases: aliasesByLibrary.get(entry.id) ?? [],
    supabase_ref: `supabase:ad:${entry.id}`,
  }));

  return NextResponse.json({
    rows,
    total: count ?? rows.length,
  });
}

export async function PATCH(req: Request) {
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

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.knowledge_capture_status === 'string') {
    if (!isValidAdKnowledgeCaptureStatus(body.knowledge_capture_status)) {
      return NextResponse.json({ error: 'Invalid knowledge_capture_status' }, { status: 400 });
    }
    patch.knowledge_capture_status = body.knowledge_capture_status;
    if (body.knowledge_capture_status === 'processed') {
      patch.captured_at = new Date().toISOString();
    }
  }

  if (Array.isArray(body.os_refs)) {
    patch.os_refs = body.os_refs.filter((r): r is string => typeof r === 'string');
  }

  const { data, error } = await ctx.service
    .from('ad_library')
    .update(patch)
    .eq('id', id)
    .select(AD_LIBRARY_INTELLIGENCE_SELECT)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(data);
}
