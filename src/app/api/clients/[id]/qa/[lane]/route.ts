import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  addClickUpTaskComment,
  applyClickUpFieldMap,
  getClickUpToken,
} from '@/lib/clickup';
import { insertFormSubmission } from '@/lib/form-submissions';
import {
  formatQaClickUpComment,
  getQaFormConfig,
  isQaChecklistComplete,
  isQaCompleteForCycle,
  isQaLane,
  isQaLifecycle,
  qaDraftToResponses,
  type QaFormDraft,
} from '@/lib/qa-form';

const QA_PERMISSION_KEYS = ['admin_clients', 'admin_billing'];
const QA_CYCLE_FORM_TYPES = ['tech_qa', 'marketing_qa', 'reinstate'] as const;

function optionalText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseQaDraft(body: Record<string, unknown>): QaFormDraft {
  const rawChecklist = body.checklist;
  return {
    completed_by_label: optionalText(body.completed_by_label),
    checklist:
      rawChecklist && typeof rawChecklist === 'object' && !Array.isArray(rawChecklist)
        ? Object.fromEntries(
            Object.entries(rawChecklist as Record<string, unknown>).map(([key, value]) => [key, value === true]),
          )
        : {},
    evidence: optionalText(body.evidence),
    blockers: optionalText(body.blockers),
    notes: optionalText(body.notes),
    final_confirmation: optionalText(body.final_confirmation),
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; lane: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, QA_PERMISSION_KEYS);
  if (denied) return denied;

  const { id: clientId, lane } = await params;
  if (!isQaLane(lane)) {
    return NextResponse.json({ error: 'Unknown QA lane' }, { status: 404 });
  }

  const config = getQaFormConfig(lane);
  const [clientRes, cycleRes, userRes] = await Promise.all([
    ctx.service
      .from('clients')
      .select('id, name, lifecycle_status, onboarding_clickup_task_id')
      .eq('id', clientId)
      .single(),
    ctx.service
      .from('client_form_submissions')
      .select('id, form_type, submitted_at, submitted_by, status, responses')
      .eq('client_id', clientId)
      .in('form_type', [...QA_CYCLE_FORM_TYPES])
      .in('status', ['applied', 'submitted'])
      .order('submitted_at', { ascending: false }),
    ctx.service.auth.admin.getUserById(ctx.userId),
  ]);

  if (clientRes.error) {
    const status = clientRes.error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientRes.error.message }, { status });
  }

  const cycleRows = cycleRes.data ?? [];
  const latestSubmission =
    cycleRows.find(row => row.form_type === config.formType) ?? null;

  return NextResponse.json({
    client: clientRes.data,
    qa_config: config,
    lifecycle_ok: isQaLifecycle(clientRes.data.lifecycle_status),
    already_complete: isQaCompleteForCycle(cycleRows, config.formType),
    latest_submission: latestSubmission,
    default_completed_by: userRes.data.user?.email ?? ctx.userId,
  });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; lane: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, QA_PERMISSION_KEYS);
  if (denied) return denied;

  const { id: clientId, lane } = await params;
  if (!isQaLane(lane)) {
    return NextResponse.json({ error: 'Unknown QA lane' }, { status: 404 });
  }

  const config = getQaFormConfig(lane);
  const body = await req.json();
  const draft = parseQaDraft(body);

  if (!isQaChecklistComplete(draft, config)) {
    return NextResponse.json(
      { error: `Complete every ${config.shortLabel} item and type QA to submit.` },
      { status: 400 },
    );
  }

  const [clientRes, cycleRes] = await Promise.all([
    ctx.service
      .from('clients')
      .select('id, name, lifecycle_status, onboarding_clickup_task_id')
      .eq('id', clientId)
      .single(),
    ctx.service
      .from('client_form_submissions')
      .select('form_type, submitted_at, status')
      .eq('client_id', clientId)
      .in('form_type', [...QA_CYCLE_FORM_TYPES])
      .in('status', ['applied', 'submitted']),
  ]);

  if (clientRes.error || !clientRes.data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }
  if (!isQaLifecycle(clientRes.data.lifecycle_status)) {
    return NextResponse.json(
      { error: `${config.shortLabel} is only available while the client is in onboarding.` },
      { status: 400 },
    );
  }
  if (isQaCompleteForCycle(cycleRes.data ?? [], config.formType)) {
    return NextResponse.json(
      { error: `${config.shortLabel} is already complete for this onboarding cycle.` },
      { status: 409 },
    );
  }

  const taskId = clientRes.data.onboarding_clickup_task_id?.trim();
  if (!taskId) {
    return NextResponse.json(
      { error: 'Client is missing a ClickUp onboarding task ID. QA writes only to the onboarding task, not the retired Client Hub task.' },
      { status: 400 },
    );
  }

  const token = getClickUpToken();
  if (!token) {
    return NextResponse.json(
      { error: 'CLICKUP_API_TOKEN is not configured; QA cannot trigger ClickUp automation.' },
      { status: 500 },
    );
  }

  const wrote = await applyClickUpFieldMap(
    taskId,
    token,
    { [config.clickupFieldKey]: 'Complete' },
    '[qa-form]',
  );
  if (wrote < 1) {
    return NextResponse.json(
      {
        error: `${config.shortLabel} ClickUp field is not configured in CLICKUP_OB_FIELD_MAP.`,
      },
      { status: 500 },
    );
  }

  await addClickUpTaskComment(
    taskId,
    token,
    formatQaClickUpComment(clientRes.data, config, draft),
  );

  const responses = qaDraftToResponses(draft, config);
  const submission = await insertFormSubmission(ctx.service, {
    client_id: clientId,
    form_type: config.formType,
    status: 'applied',
    submitted_by: ctx.userId,
    responses,
    applied_patch: {
      onboarding_clickup_task_id: taskId,
      clickup_field: config.clickupFieldKey,
      clickup_value: 'Complete',
    },
  });

  return NextResponse.json({ submission, clickup_task_id: taskId });
}

