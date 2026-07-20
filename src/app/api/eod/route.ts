import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  EOD_DEPARTMENT_POSITIONS,
  EOD_SELECT,
  isEodDepartment,
  type EodDepartment,
  type EodFormSubmission,
  validateDepartmentCustom,
  validateSharedResponses,
} from '@/lib/eod-forms';

function todayLocalDate(): string {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  return new Date(d.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

/** Public: list active agents eligible for a department EOD form. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const department = searchParams.get('department');
  const agentId = searchParams.get('agent_id');
  const from = searchParams.get('from');
  const to = searchParams.get('to');
  const workDate = searchParams.get('work_date');
  const listAgents = searchParams.get('list_agents') === '1';

  const service = createServiceClient();

  if (listAgents) {
    if (!isEodDepartment(department)) {
      return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
    }
    const positions = EOD_DEPARTMENT_POSITIONS[department];
    const { data, error } = await service
      .from('agents')
      .select('id, name, pay_type')
      .eq('active', true)
      .in('pay_type', positions)
      .order('name');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      agents: (data ?? []).map(a => ({ id: a.id as string, name: a.name as string })),
    });
  }

  // History requires auth
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const adminDenied = requireAnyPermission(ctx, ['admin_agents', 'admin_clients']);
  const isAdminViewer = !adminDenied;

  let query = service
    .from('eod_form_submissions')
    .select(EOD_SELECT)
    .order('work_date', { ascending: false })
    .limit(200);

  if (department && isEodDepartment(department)) {
    query = query.eq('department', department);
  }
  if (agentId) query = query.eq('agent_id', agentId);
  if (workDate) query = query.eq('work_date', workDate);
  if (from) query = query.gte('work_date', from);
  if (to) query = query.lte('work_date', to);

  if (!isAdminViewer) {
    // Linked employee can only see own rows
    const { data: me } = await service
      .from('agents')
      .select('id')
      .eq('user_id', ctx.userId)
      .maybeSingle();
    if (!me?.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    query = query.eq('agent_id', me.id);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const submissions = (data ?? []) as unknown as EodFormSubmission[];
  const agentIds = [...new Set(submissions.map(s => s.agent_id))];
  const nameById = new Map<string, string>();
  if (agentIds.length > 0) {
    const { data: agents } = await service.from('agents').select('id, name').in('id', agentIds);
    for (const a of agents ?? []) {
      nameById.set(a.id as string, a.name as string);
    }
  }

  return NextResponse.json({
    submissions: submissions.map(s => ({
      ...s,
      agent_name: nameById.get(s.agent_id) ?? null,
    })),
  });
}

/** Public POST — upsert EOD for the day. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const department = body.department;
  if (!isEodDepartment(department as string)) {
    return NextResponse.json({ error: 'Invalid department' }, { status: 400 });
  }
  const dept = department as EodDepartment;

  const agentId = String(body.agent_id ?? '').trim();
  if (!agentId) {
    return NextResponse.json({ error: 'Select who you are.' }, { status: 400 });
  }

  const workDate = String(body.work_date ?? todayLocalDate()).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return NextResponse.json({ error: 'Invalid work_date' }, { status: 400 });
  }

  const responsesRaw =
    body.responses && typeof body.responses === 'object' && !Array.isArray(body.responses)
      ? (body.responses as Record<string, unknown>)
      : body;

  const shared = validateSharedResponses(responsesRaw);
  if (!shared.ok) {
    return NextResponse.json({ error: shared.error }, { status: 400 });
  }
  const custom = validateDepartmentCustom(dept, responsesRaw);
  if (!custom.ok) {
    return NextResponse.json({ error: custom.error }, { status: 400 });
  }

  const service = createServiceClient();
  const positions = EOD_DEPARTMENT_POSITIONS[dept];
  const { data: agent, error: agentErr } = await service
    .from('agents')
    .select('id, name, pay_type, active, user_id')
    .eq('id', agentId)
    .maybeSingle();

  if (agentErr) {
    return NextResponse.json({ error: agentErr.message }, { status: 500 });
  }
  if (!agent || agent.active === false) {
    return NextResponse.json({ error: 'Team member not found or inactive.' }, { status: 400 });
  }
  if (!positions.includes(agent.pay_type as (typeof positions)[number])) {
    return NextResponse.json(
      { error: `That person is not assigned to the ${dept} EOD form.` },
      { status: 400 }
    );
  }

  let submittedByUserId: string | null = null;
  const auth = await getAuthContext();
  if (!isAuthError(auth)) {
    submittedByUserId = auth.userId;
  }

  const submittedByLabel =
    String(body.submitted_by_label ?? '').trim() || (agent.name as string);

  const responses = {
    ...shared.shared,
    ...custom.custom,
  };

  const now = new Date().toISOString();
  const row = {
    agent_id: agentId,
    department: dept,
    work_date: workDate,
    status: 'submitted' as const,
    submitted_by_user_id: submittedByUserId,
    submitted_by_label: submittedByLabel,
    responses,
    submitted_at: now,
    updated_at: now,
  };

  const { data, error } = await service
    .from('eod_form_submissions')
    .upsert(row, { onConflict: 'agent_id,department,work_date' })
    .select(EOD_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, submission: data });
}
