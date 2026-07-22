import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission } from '@/lib/api-auth';
import {
  canTransition,
  isMeetingCommitmentStatus,
  type MeetingCommitment,
  type MeetingCommitmentConstraintType,
  type MeetingCommitmentOwnerRole,
  type MeetingCommitmentSeverity,
  type MeetingCommitmentStatus,
} from '@/lib/meeting-commitments';

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

type RouteCtx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, routeCtx: RouteCtx) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'team_meetings');
  if (denied) return denied;

  const { id } = await routeCtx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { data: existing, error: loadErr } = await ctx.service
    .from('meeting_commitments')
    .select(SELECT_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const row = existing as MeetingCommitment;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  const meetingId = optionalText(body.meeting_id);
  if (meetingId) patch.last_touched_meeting_id = meetingId;

  // Field updates
  if (typeof body.why === 'string') patch.why = body.why.trim();
  if (typeof body.plan === 'string') patch.plan = body.plan.trim();
  if (typeof body.constraint_label === 'string') {
    patch.constraint_label = body.constraint_label.trim();
  }
  if (typeof body.success_signal === 'string') {
    patch.success_signal = body.success_signal.trim();
  }
  if (typeof body.due_date === 'string' && body.due_date.trim()) {
    patch.due_date = body.due_date.trim();
  }
  if (typeof body.clickup_url === 'string') {
    patch.clickup_url = body.clickup_url.trim() || null;
  }
  if (typeof body.founder_ask === 'string') {
    patch.founder_ask = body.founder_ask.trim() || null;
  }
  if (typeof body.founder_note === 'string') {
    patch.founder_note = body.founder_note.trim() || null;
  }
  if (typeof body.check_note === 'string') {
    patch.check_note = body.check_note.trim() || null;
  }
  if (typeof body.needs_founder === 'boolean') {
    patch.needs_founder = body.needs_founder;
  }
  if (
    typeof body.severity === 'string' &&
    SEVERITIES.includes(body.severity as MeetingCommitmentSeverity)
  ) {
    patch.severity = body.severity;
  }
  if (
    typeof body.constraint_type === 'string' &&
    CONSTRAINT_TYPES.includes(body.constraint_type as MeetingCommitmentConstraintType)
  ) {
    patch.constraint_type = body.constraint_type;
  }
  if (
    typeof body.owner_role === 'string' &&
    OWNER_ROLES.includes(body.owner_role as MeetingCommitmentOwnerRole)
  ) {
    patch.owner_role = body.owner_role;
  }

  // Status transition
  if (body.status !== undefined) {
    if (!isMeetingCommitmentStatus(body.status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    const nextStatus = body.status as MeetingCommitmentStatus;
    const needsFounder =
      typeof patch.needs_founder === 'boolean'
        ? patch.needs_founder
        : row.needs_founder;

    const check = canTransition(row.status, nextStatus, { needsFounder });
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }

    patch.status = nextStatus;

    if (typeof body.founder_note === 'string') {
      patch.founder_note = body.founder_note.trim() || null;
    }
    if (typeof body.check_note === 'string') {
      patch.check_note = body.check_note.trim() || null;
    }

    if (nextStatus === 'approved' && meetingId) {
      patch.approved_in_meeting_id = meetingId;
    }
    if (
      (nextStatus === 'rejected' || nextStatus === 'needs_clarification') &&
      !optionalText(body.founder_note) &&
      !row.founder_note
    ) {
      return NextResponse.json(
        { error: 'founder_note is required for reject / needs_clarification' },
        { status: 400 },
      );
    }
  }

  const { data, error } = await ctx.service
    .from('meeting_commitments')
    .update(patch)
    .eq('id', id)
    .select(SELECT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: client } = await ctx.service
    .from('clients')
    .select('id, name')
    .eq('id', (data as MeetingCommitment).client_id)
    .maybeSingle();

  return NextResponse.json({
    row: {
      ...(data as MeetingCommitment),
      client_name: (client as { name?: string } | null)?.name ?? null,
    },
  });
}
