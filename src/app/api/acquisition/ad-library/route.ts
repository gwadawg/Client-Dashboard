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

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'acquisition_marketing');
  if (denied) return denied;

  const [{ data: library, error: libError }, { data: aliases, error: aliasError }, { data: angles }] =
    await Promise.all([
      ctx.service
        .from('acquisition_ad_library')
        .select('*')
        .order('updated_at', { ascending: false }),
      ctx.service
        .from('acquisition_ad_library_aliases')
        .select('id, library_id, alias_name, created_at'),
      ctx.service
        .from('acquisition_ad_angles')
        .select('id, label')
        .eq('is_active', true),
    ]);

  if (libError || aliasError) {
    return NextResponse.json({ error: libError?.message ?? aliasError?.message }, { status: 500 });
  }

  const angleLabels = new Map((angles ?? []).map((a) => [a.id, a.label]));
  const aliasesByLibrary = new Map<string, { id: string; alias_name: string; created_at: string }[]>();
  for (const a of aliases ?? []) {
    const list = aliasesByLibrary.get(a.library_id) ?? [];
    list.push({ id: a.id, alias_name: a.alias_name, created_at: a.created_at });
    aliasesByLibrary.set(a.library_id, list);
  }

  const data = (library ?? []).map((entry) => ({
    ...entry,
    angle_label: entry.angle_id ? angleLabels.get(entry.angle_id as string) ?? null : null,
    aliases: aliasesByLibrary.get(entry.id as string) ?? [],
  }));

  return NextResponse.json(data);
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

  const ad_name = cleanString(body.ad_name);
  if (!ad_name) {
    return NextResponse.json({ error: 'ad_name is required' }, { status: 400 });
  }

  if ('ad_format' in body && body.ad_format != null && body.ad_format !== '') {
    const ad_format = cleanEnum(body.ad_format, VALID_AD_FORMAT);
    if (!ad_format) {
      return NextResponse.json({ error: `ad_format must be one of: ${VALID_AD_FORMAT.join(', ')}` }, { status: 400 });
    }
  }

  const row = {
    ad_name,
    drive_url: cleanString(body.drive_url),
    ad_format: cleanEnum(body.ad_format, VALID_AD_FORMAT),
    angle_id: cleanString(body.angle_id),
    creative_created_at: cleanDate(body.creative_created_at),
    created_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from('acquisition_ad_library')
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'An ad with that name already exists in the library.' }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
