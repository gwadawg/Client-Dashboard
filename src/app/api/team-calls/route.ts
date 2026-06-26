import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers, requirePermission } from '@/lib/api-auth';
import {
  TEAM_CALL_FIELDS,
  cleanTeamCallTags,
  highlightsToSearchText,
  isValidTeamCallType,
  normalizeHighlights,
} from '@/lib/team-calls';

function optionalText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseCalledAt(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

async function fetchAllTags(service: { from: (table: string) => unknown }) {
  const q = service.from('team_calls') as {
    select: (cols: string) => {
      is: (col: string, val: null) => Promise<{ data: { tags: string[] | null }[] | null }>;
    };
  };
  const { data } = await q.select('tags').is('deleted_at', null);
  const tagSet = new Set<string>();
  for (const row of data ?? []) {
    for (const tag of row.tags ?? []) {
      if (typeof tag === 'string' && tag.trim()) tagSet.add(tag);
    }
  }
  return [...tagSet].sort();
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'call_library');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const callType = searchParams.get('callType');
  const tag = searchParams.get('tag')?.trim().toLowerCase();
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const search = searchParams.get('search')?.trim();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? (page - 1) * pageSize));

  if (callType && !isValidTeamCallType(callType)) {
    return NextResponse.json({ error: 'Invalid callType' }, { status: 400 });
  }

  let query = ctx.service
    .from('team_calls')
    .select(TEAM_CALL_FIELDS, { count: 'exact' })
    .is('deleted_at', null)
    .order('called_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (callType) query = query.eq('call_type', callType);
  if (tag) query = query.contains('tags', [tag]);
  if (startDate) query = query.gte('called_at', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.lte('called_at', `${endDate}T23:59:59.999Z`);
  if (search) {
    const safe = search.replace(/[^\w\s-]/g, ' ').trim();
    if (safe) {
      const tsQuery = safe.split(/\s+/).filter(Boolean).join(' & ');
      if (tsQuery) {
        query = query.textSearch('search_vector', tsQuery, { type: 'plain' });
      } else {
        query = query.or(
          `title.ilike.%${safe}%,transcript.ilike.%${safe}%,summary.ilike.%${safe}%,participants.ilike.%${safe}%,highlights_text.ilike.%${safe}%`,
        );
      }
    }
  }

  const [{ data, count, error }, tags] = await Promise.all([query, fetchAllTags(ctx.service)]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map(row => ({
    ...row,
    highlights: normalizeHighlights(row.highlights),
  }));

  return NextResponse.json({ rows, total: count ?? 0, tags });
}

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

  const title = optionalText(body.title);
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });

  const callType = optionalText(body.call_type);
  if (!callType || !isValidTeamCallType(callType)) {
    return NextResponse.json({ error: 'Invalid call_type' }, { status: 400 });
  }

  const calledAt = parseCalledAt(body.called_at);
  if (!calledAt) return NextResponse.json({ error: 'Invalid called_at' }, { status: 400 });

  const highlights = normalizeHighlights(body.highlights);
  const durationRaw = body.duration_seconds;
  let duration_seconds: number | null = null;
  if (durationRaw !== null && durationRaw !== undefined && durationRaw !== '') {
    const n = Number(durationRaw);
    duration_seconds = Number.isFinite(n) ? Math.floor(n) : null;
  }

  const row = {
    title,
    call_type: callType,
    called_at: calledAt,
    participants: optionalText(body.participants),
    recording_url: optionalText(body.recording_url),
    transcript: optionalText(body.transcript),
    summary: optionalText(body.summary),
    highlights,
    highlights_text: highlightsToSearchText(highlights) || null,
    tags: cleanTeamCallTags(body.tags),
    duration_seconds,
    created_by: ctx.userId,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from('team_calls')
    .insert(row)
    .select(TEAM_CALL_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(
    { call: { ...data, highlights: normalizeHighlights(data.highlights) } },
    { status: 201 },
  );
}
