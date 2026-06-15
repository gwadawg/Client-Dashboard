import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers } from '@/lib/api-auth';

const VALID_CATEGORY = ['form', 'sop', 'document', 'template', 'other'] as const;

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

function cleanTags(v: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(v)) raw = v.filter((t): t is string => typeof t === 'string');
  else if (typeof v === 'string') raw = v.split(',');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('title' in body) {
    const title = cleanString(body.title);
    if (!title) return NextResponse.json({ error: 'title cannot be empty' }, { status: 400 });
    updates.title = title;
  }
  if ('url' in body) {
    const url = cleanString(body.url);
    if (!url) return NextResponse.json({ error: 'url cannot be empty' }, { status: 400 });
    updates.url = url;
  }
  if ('category' in body) {
    const category = cleanString(body.category);
    if (!category || !VALID_CATEGORY.includes(category as (typeof VALID_CATEGORY)[number])) {
      return NextResponse.json(
        { error: `category must be one of: ${VALID_CATEGORY.join(', ')}` },
        { status: 400 },
      );
    }
    updates.category = category;
  }
  if ('description' in body) updates.description = cleanString(body.description);
  if ('tags' in body) updates.tags = cleanTags(body.tags);

  const { data, error } = await ctx.service
    .from('resources')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Resource not found' }, { status: 404 });
  return NextResponse.json(data);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { id } = await params;
  const { error } = await ctx.service.from('resources').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
