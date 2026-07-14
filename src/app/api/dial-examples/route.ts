import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission, requireManageUsers } from '@/lib/api-auth';
import {
  DIAL_EXAMPLE_FIELDS,
  cleanDialExampleTags,
  domainMatchesSource,
  isValidDialExampleDomain,
  isValidDialExampleGrade,
  isValidDialExampleLeadType,
  isValidDialExampleSource,
  normalizeDialHighlights,
} from '@/lib/dial-examples';

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

function requireReadAccess(
  ctx: Parameters<typeof requireAnyPermission>[0],
  domain: string | null,
) {
  if (domain === 'call_center') return requireAnyPermission(ctx, ['recordings', 'agents']);
  if (domain === 'b2b') return requireAnyPermission(ctx, ['acquisition']);
  return requireAnyPermission(ctx, ['recordings', 'agents', 'acquisition']);
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const domain = searchParams.get('domain')?.trim() || null;
  const leadType = searchParams.get('leadType')?.trim().toUpperCase() || null;
  const grade = searchParams.get('grade')?.trim() || null;
  const search = searchParams.get('search')?.trim();
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const page = Math.max(1, Number(searchParams.get('page') ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const offset = (page - 1) * pageSize;

  if (domain && !isValidDialExampleDomain(domain)) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 });
  }
  if (leadType && !isValidDialExampleLeadType(leadType)) {
    return NextResponse.json({ error: 'Invalid leadType' }, { status: 400 });
  }
  if (grade && !isValidDialExampleGrade(grade)) {
    return NextResponse.json({ error: 'Invalid grade' }, { status: 400 });
  }

  const denied = requireReadAccess(ctx, domain);
  if (denied) return denied;

  let query = ctx.service
    .from('dial_examples')
    .select(DIAL_EXAMPLE_FIELDS, { count: 'exact' })
    .is('deleted_at', null)
    .order('called_at', { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (domain) query = query.eq('domain', domain);
  if (leadType) query = query.eq('lead_type', leadType);
  if (grade) query = query.eq('grade', grade);
  if (startDate) query = query.gte('called_at', `${startDate}T00:00:00.000Z`);
  if (endDate) query = query.lte('called_at', `${endDate}T23:59:59.999Z`);
  if (search) {
    const safe = search.replace(/[^\w\s-]/g, ' ').trim();
    if (safe) {
      query = query.or(
        `title.ilike.%${safe}%,agent_name.ilike.%${safe}%,lead_name.ilike.%${safe}%,summary.ilike.%${safe}%`,
      );
    }
  }

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []).map(row => ({
    ...row,
    highlights: normalizeDialHighlights(row.highlights),
  }));

  return NextResponse.json({ rows, total: count ?? 0 });
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

  const domain = optionalText(body.domain);
  const source = optionalText(body.source);
  const sourceId = optionalText(body.source_id);
  const title = optionalText(body.title);
  const recordingUrl = optionalText(body.recording_url);
  const calledAt = parseCalledAt(body.called_at);

  if (!domain || !isValidDialExampleDomain(domain)) {
    return NextResponse.json({ error: 'Invalid domain' }, { status: 400 });
  }
  if (!source || !isValidDialExampleSource(source)) {
    return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
  }
  if (!domainMatchesSource(domain, source)) {
    return NextResponse.json({ error: 'domain/source mismatch' }, { status: 400 });
  }
  if (!sourceId) return NextResponse.json({ error: 'source_id is required' }, { status: 400 });
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  if (!recordingUrl) {
    return NextResponse.json({ error: 'recording_url is required' }, { status: 400 });
  }
  if (!calledAt) return NextResponse.json({ error: 'Invalid called_at' }, { status: 400 });

  const leadType = optionalText(body.lead_type);
  if (domain === 'call_center' && (!leadType || !isValidDialExampleLeadType(leadType))) {
    return NextResponse.json(
      { error: 'lead_type (RM, DSCR, or HE) is required for call_center' },
      { status: 400 },
    );
  }
  if (leadType && !isValidDialExampleLeadType(leadType)) {
    return NextResponse.json({ error: 'Invalid lead_type' }, { status: 400 });
  }

  const grade = optionalText(body.grade);
  if (!grade || !isValidDialExampleGrade(grade)) {
    return NextResponse.json({ error: 'grade (A+, A, A-, or B) is required' }, { status: 400 });
  }

  let duration_seconds: number | null = null;
  if (body.duration_seconds !== null && body.duration_seconds !== undefined && body.duration_seconds !== '') {
    const n = Number(body.duration_seconds);
    duration_seconds = Number.isFinite(n) ? Math.floor(n) : null;
  }

  const row = {
    domain,
    source,
    source_id: sourceId,
    title,
    recording_url: recordingUrl,
    called_at: calledAt,
    duration_seconds,
    agent_name: optionalText(body.agent_name),
    lead_name: optionalText(body.lead_name),
    lead_phone: optionalText(body.lead_phone),
    lead_type: leadType,
    call_type: optionalText(body.call_type),
    grade,
    summary: optionalText(body.summary),
    transcript: optionalText(body.transcript),
    highlights: normalizeDialHighlights(body.highlights),
    tags: cleanDialExampleTags(body.tags),
    client_id: optionalText(body.client_id),
    lead_id: optionalText(body.lead_id),
    created_by: ctx.userId,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from('dial_examples')
    .insert(row)
    .select(DIAL_EXAMPLE_FIELDS)
    .single();

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This recording is already saved in the examples library' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { example: { ...data, highlights: normalizeDialHighlights(data.highlights) } },
    { status: 201 },
  );
}
