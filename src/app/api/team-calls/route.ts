import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireManageUsers, requirePermission } from '@/lib/api-auth';
import {
  TEAM_CALL_FIELDS,
  cleanTeamCallTags,
  highlightsToSearchText,
  isValidTeamCallGrade,
  isValidTeamCallLeadType,
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

function parseBoolFlag(value: unknown): boolean {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'call_library');
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  const callType = searchParams.get('callType');
  const leadType = searchParams.get('leadType')?.trim().toUpperCase() || null;
  const grade = searchParams.get('grade')?.trim() || null;
  const tag = searchParams.get('tag')?.trim().toLowerCase();
  const importantOnly = searchParams.get('important') === '1' || searchParams.get('important') === 'true';
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const search = searchParams.get('search')?.trim();
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const offset = Math.max(0, Number(searchParams.get('offset') ?? (page - 1) * pageSize));

  if (callType && !isValidTeamCallType(callType)) {
    return NextResponse.json({ error: 'Invalid callType' }, { status: 400 });
  }
  if (leadType && !isValidTeamCallLeadType(leadType)) {
    return NextResponse.json({ error: 'Invalid leadType' }, { status: 400 });
  }
  if (grade && !isValidTeamCallGrade(grade)) {
    return NextResponse.json({ error: 'Invalid grade' }, { status: 400 });
  }

  let query = ctx.service
    .from('team_calls')
    .select(TEAM_CALL_FIELDS, { count: 'exact' })
    .is('deleted_at', null)
    .or(`is_private.eq.false,created_by.eq.${ctx.userId}`)
    .order('called_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (callType) query = query.eq('call_type', callType);
  if (leadType) query = query.eq('lead_type', leadType);
  if (grade) query = query.eq('grade', grade);
  if (importantOnly) query = query.eq('is_important', true);
  if (tag) query = query.contains('tags', [tag]);
  if (startDate) query = query.gte('called_at', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.lte('called_at', `${endDate}T23:59:59.999Z`);
  if (search) {
    const safe = search.replace(/[^\w\s-]/g, ' ').trim();
    if (safe) {
      const tsQuery = safe.split(/\s+/).filter(Boolean).join(' & ');
      if (tsQuery) {
        query = query.textSearch('search_vector', tsQuery, { type: 'plain' });
      }
    }
  }

  const [{ data, count, error }, tagsResult] = await Promise.all([
    query,
    ctx.service
      .from('team_calls')
      .select('tags')
      .is('deleted_at', null)
      .or(`is_private.eq.false,created_by.eq.${ctx.userId}`),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const tagSet = new Set<string>();
  for (const row of tagsResult.data ?? []) {
    for (const t of (row as { tags: string[] | null }).tags ?? []) {
      if (typeof t === 'string' && t.trim()) tagSet.add(t);
    }
  }
  const tags = [...tagSet].sort();

  const rows = (data ?? []).map(row => ({
    ...row,
    highlights: normalizeHighlights(row.highlights),
    is_private: !!(row as { is_private?: boolean }).is_private,
    is_important: !!(row as { is_important?: boolean }).is_important,
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

  const leadTypeRaw = optionalText(body.lead_type);
  if (body.lead_type !== undefined && body.lead_type !== null && body.lead_type !== '' && !isValidTeamCallLeadType(leadTypeRaw)) {
    return NextResponse.json({ error: 'Invalid lead_type (use RM, DSCR, or HE)' }, { status: 400 });
  }

  const gradeRaw = optionalText(body.grade);
  if (body.grade !== undefined && body.grade !== null && body.grade !== '' && !isValidTeamCallGrade(gradeRaw)) {
    return NextResponse.json({ error: 'Invalid grade (use A+, A, A-, or B)' }, { status: 400 });
  }

  const sourceEventId = optionalText(body.source_event_id);

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
    lead_type: isValidTeamCallLeadType(leadTypeRaw) ? leadTypeRaw : null,
    grade: isValidTeamCallGrade(gradeRaw) ? gradeRaw : null,
    source_event_id: sourceEventId,
    is_private: parseBoolFlag(body.is_private),
    is_important: parseBoolFlag(body.is_important),
    created_by: ctx.userId,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from('team_calls')
    .insert(row)
    .select(TEAM_CALL_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505' && sourceEventId) {
      return NextResponse.json(
        { error: 'This recording is already saved in the Call Library' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      call: {
        ...data,
        highlights: normalizeHighlights(data.highlights),
        is_private: !!(data as { is_private?: boolean }).is_private,
        is_important: !!(data as { is_important?: boolean }).is_important,
      },
    },
    { status: 201 },
  );
}
