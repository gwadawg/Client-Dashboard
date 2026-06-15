import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireManageUsers } from '@/lib/api-auth';

const VALID_CATEGORY = ['form', 'sop', 'document', 'template', 'other'] as const;

function cleanString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s || null;
}

function cleanCategory(v: unknown): (typeof VALID_CATEGORY)[number] | null {
  const s = cleanString(v);
  if (!s) return null;
  return VALID_CATEGORY.includes(s as (typeof VALID_CATEGORY)[number])
    ? (s as (typeof VALID_CATEGORY)[number])
    : null;
}

/** Normalize tags from a string[] or comma-separated string into a clean, de-duped lowercase list. */
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

// Viewing the library only requires the 'resources' tab permission.
export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'resources');
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from('resources')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

// Adding a resource is admin/owner only.
export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const title = cleanString(body.title);
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const url = cleanString(body.url);
  if (!url) return NextResponse.json({ error: 'url is required' }, { status: 400 });

  const category = cleanCategory(body.category) ?? 'document';
  if (!VALID_CATEGORY.includes(category)) {
    return NextResponse.json(
      { error: `category must be one of: ${VALID_CATEGORY.join(', ')}` },
      { status: 400 },
    );
  }

  const row = {
    title,
    url,
    category,
    description: cleanString(body.description),
    tags: cleanTags(body.tags),
    created_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from('resources')
    .insert(row)
    .select()
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
