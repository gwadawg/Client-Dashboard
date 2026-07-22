import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  canTransition,
  filterNeedsFounder,
  filterOpenForWeek,
  isMeetingCommitmentStatus,
  softDuplicateWarn,
  type MeetingCommitment,
  type MeetingCommitmentConstraintType,
  type MeetingCommitmentOwnerRole,
  type MeetingCommitmentSeverity,
  type MeetingCommitmentStatus,
} from '@/lib/meeting-commitments';
import { CALL_CENTER_TIMEZONE, todayYmdInCallCenterTz } from '@/lib/time';
import { addDaysToYmd } from '@/lib/team-meetings';

const SELECT_FIELDS =
  'id, client_id, severity, why, constraint_type, constraint_label, plan, owner_role, due_date, needs_founder, founder_ask, status, success_signal, origin_meeting_id, approved_in_meeting_id, last_touched_meeting_id, clickup_url, founder_note, check_note, created_by, created_at, updated_at';

const SEVERITIES: MeetingCommitmentSeverity[] = ['911', 'below'];
const CONSTRAINT_TYPES: MeetingCommitmentConstraintType[] = ['system', 'quality', 'data'];
const OWNER_ROLES: MeetingCommitmentOwnerRole[] = [
  'client_success',
  'media_buyer',
  'ccm',
  'ops',
  'founder',
];

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t || null;
}

function requiredText(value: unknown, field: string): string | NextResponse {
  if (typeof value !== 'string' || !value.trim()) {
    return NextResponse.json({ error: `${field} is required` }, { status: 400 });
  }
  return value.trim();
}

/** Monday–Sunday week containing ymd (call-center calendar). */
export function weekBoundsContaining(ymd: string): { fromYmd: string; toYmd: string } {
  const [y, m, d] = ymd.split('-').map(Number);
  // Use noon UTC to avoid DST edge when reading weekday in Sao Paulo
  const probe = new Date(Date.UTC(y, m - 1, d, 15, 0, 0));
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: CALL_CENTER_TIMEZONE,
    weekday: 'short',
  }).format(probe);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const offset = map[weekday] ?? 0;
  const fromYmd = addDaysToYmd(ymd, -offset);
  const toYmd = addDaysToYmd(fromYmd, 6);
  return { fromYmd, toYmd };
}

function attachClientNames(
  rows: MeetingCommitment[],
  clients: { id: string; name: string }[],
): MeetingCommitment[] {
  const map = new Map(clients.map(c => [c.id, c.name]));
  return rows.map(r => ({ ...r, client_name: map.get(r.client_id) ?? null }));
}

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  const url = new URL(req.url);
  const meetingId = url.searchParams.get('meeting_id');
  const view = url.searchParams.get('view'); // needs_founder | open_week | history
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let query = ctx.service.from('meeting_commitments').select(SELECT_FIELDS).order('created_at', {
    ascending: false,
  });

  if (meetingId) {
    // History for an instance: linked via any of the three meeting FKs
    query = query.or(
      `origin_meeting_id.eq.${meetingId},approved_in_meeting_id.eq.${meetingId},last_touched_meeting_id.eq.${meetingId}`,
    );
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let rows = (data ?? []) as MeetingCommitment[];

  const today = todayYmdInCallCenterTz();
  const bounds =
    from && to
      ? { fromYmd: from, toYmd: to }
      : weekBoundsContaining(today);

  if (view === 'needs_founder') {
    rows = filterNeedsFounder(rows);
  } else if (view === 'open_week') {
    rows = filterOpenForWeek(rows, bounds.fromYmd, bounds.toYmd);
  }

  const clientIds = [...new Set(rows.map(r => r.client_id))];
  let clients: { id: string; name: string }[] = [];
  if (clientIds.length) {
    const { data: clientRows } = await ctx.service
      .from('clients')
      .select('id, name')
      .in('id', clientIds);
    clients = (clientRows ?? []) as { id: string; name: string }[];
  }

  return NextResponse.json({
    rows: attachClientNames(rows, clients),
    week: bounds,
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const clientId = requiredText(body.client_id, 'client_id');
  if (clientId instanceof NextResponse) return clientId;

  const severity = body.severity;
  if (typeof severity !== 'string' || !SEVERITIES.includes(severity as MeetingCommitmentSeverity)) {
    return NextResponse.json({ error: 'severity must be 911 or below' }, { status: 400 });
  }

  const constraintType = body.constraint_type;
  if (
    typeof constraintType !== 'string' ||
    !CONSTRAINT_TYPES.includes(constraintType as MeetingCommitmentConstraintType)
  ) {
    return NextResponse.json(
      { error: 'constraint_type must be system, quality, or data' },
      { status: 400 },
    );
  }

  const ownerRole = body.owner_role;
  if (
    typeof ownerRole !== 'string' ||
    !OWNER_ROLES.includes(ownerRole as MeetingCommitmentOwnerRole)
  ) {
    return NextResponse.json({ error: 'Invalid owner_role' }, { status: 400 });
  }

  const why = requiredText(body.why, 'why');
  if (why instanceof NextResponse) return why;
  const constraintLabel = requiredText(body.constraint_label, 'constraint_label');
  if (constraintLabel instanceof NextResponse) return constraintLabel;
  const plan = requiredText(body.plan, 'plan');
  if (plan instanceof NextResponse) return plan;
  const dueDate = requiredText(body.due_date, 'due_date');
  if (dueDate instanceof NextResponse) return dueDate;
  const successSignal = requiredText(body.success_signal, 'success_signal');
  if (successSignal instanceof NextResponse) return successSignal;

  const needsFounder = Boolean(body.needs_founder);
  const founderAsk = optionalText(body.founder_ask);
  if (needsFounder && !founderAsk) {
    return NextResponse.json(
      { error: 'founder_ask is required when needs_founder is true' },
      { status: 400 },
    );
  }

  const meetingId = optionalText(body.meeting_id) ?? optionalText(body.origin_meeting_id);

  const week = weekBoundsContaining(dueDate);
  const { data: openRows } = await ctx.service
    .from('meeting_commitments')
    .select('client_id, constraint_label, status, due_date, created_at')
    .eq('client_id', clientId);

  const duplicate = softDuplicateWarn(
    (openRows ?? []) as {
      client_id: string;
      constraint_label: string;
      status: MeetingCommitmentStatus;
      due_date?: string | null;
      created_at?: string | null;
    }[],
    clientId,
    constraintLabel,
    week,
  );

  const insert = {
    client_id: clientId,
    severity: severity as MeetingCommitmentSeverity,
    why,
    constraint_type: constraintType as MeetingCommitmentConstraintType,
    constraint_label: constraintLabel,
    plan,
    owner_role: ownerRole as MeetingCommitmentOwnerRole,
    due_date: dueDate,
    needs_founder: needsFounder,
    founder_ask: founderAsk,
    status: 'proposed' as const,
    success_signal: successSignal,
    origin_meeting_id: meetingId,
    last_touched_meeting_id: meetingId,
    created_by: ctx.userId,
  };

  const { data, error } = await ctx.service
    .from('meeting_commitments')
    .insert(insert)
    .select(SELECT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: client } = await ctx.service
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle();

  return NextResponse.json({
    row: {
      ...(data as MeetingCommitment),
      client_name: (client as { name?: string } | null)?.name ?? null,
    },
    warning: duplicate
      ? 'An open commitment for this client + constraint already exists this week'
      : null,
  });
}
