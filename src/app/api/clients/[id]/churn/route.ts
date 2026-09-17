import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { CLIENT_CALL_FIELDS } from '@/lib/client-calls';
import { isValidReasonCode } from '@/lib/client-feedback';
import {
  churnDraftToResponses,
  churnChecklistValidationError,
  formatChurnHistoryNote,
  isChurnFormComplete,
  parseChurnDraftFromBody,
} from '@/lib/churn-form';
import { runChurnSideEffects } from '@/lib/churn-side-effects';
import { insertFormSubmission } from '@/lib/form-submissions';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;

  const [clientRes, churnSubRes] = await Promise.all([
    ctx.service
      .from('clients')
      .select('id, name, lifecycle_status, mrr, churned_at')
      .eq('id', clientId)
      .single(),
    ctx.service
      .from('client_form_submissions')
      .select('id, submitted_at, responses')
      .eq('client_id', clientId)
      .eq('form_type', 'churn')
      .eq('status', 'applied')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (clientRes.error) {
    const status = clientRes.error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientRes.error.message }, { status });
  }

  const alreadyChurned = clientRes.data.lifecycle_status === 'churned';

  return NextResponse.json({
    client: clientRes.data,
    already_churned: alreadyChurned,
    default_effective_date: new Date().toISOString().slice(0, 10),
    existing_submission: churnSubRes.data ?? null,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json();
  const draft = parseChurnDraftFromBody(body);

  if (!isChurnFormComplete(draft)) {
    return NextResponse.json(
      {
        error:
          churnChecklistValidationError(draft) ??
          'Complete all required fields and checklist items before submitting',
      },
      { status: 400 },
    );
  }

  if (!isValidReasonCode(draft.reason_code)) {
    return NextResponse.json({ error: 'A valid churn reason is required' }, { status: 400 });
  }

  const { data: client, error: clientErr } = await ctx.service
    .from('clients')
    .select('id, name, lifecycle_status, mrr, clickup_task_id, ghl_contact_id, slack_id')
    .eq('id', clientId)
    .single();

  if (clientErr || !client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  if (client.lifecycle_status === 'churned') {
    return NextResponse.json({ error: 'Client is already marked as churned' }, { status: 409 });
  }

  const previousLifecycle = client.lifecycle_status ?? null;
  const lifecycleStatus = 'churned';
  const historyNote = formatChurnHistoryNote(draft);
  const responses = churnDraftToResponses(draft);
  const calledAt = `${draft.effective_churn_date}T12:00:00.000Z`;
  const churnedAt = calledAt;

  const { error: updateErr } = await ctx.service
    .from('clients')
    .update({
      lifecycle_status: lifecycleStatus,
      churned_at: churnedAt,
      is_live: syncIsLiveWithLifecycle(lifecycleStatus),
    })
    .eq('id', clientId);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Prefer the trigger row just created; fall back to any matching transition so
  // we can still backdate changed_at to the form's effective churn date.
  let historyId: string | null = null;
  {
    const { data: triggerRows, error: historyError } = await ctx.service
      .from('client_status_history')
      .select('id')
      .eq('client_id', clientId)
      .eq('previous_status', previousLifecycle)
      .eq('new_status', lifecycleStatus)
      .eq('source', 'trigger')
      .order('changed_at', { ascending: false })
      .limit(1);

    if (historyError) {
      return NextResponse.json({ error: historyError.message }, { status: 500 });
    }
    historyId = triggerRows?.[0]?.id ?? null;

    if (!historyId) {
      const { data: fallbackRows, error: fallbackError } = await ctx.service
        .from('client_status_history')
        .select('id')
        .eq('client_id', clientId)
        .eq('new_status', lifecycleStatus)
        .order('changed_at', { ascending: false })
        .limit(1);
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      historyId = fallbackRows?.[0]?.id ?? null;
    }
  }

  if (historyId) {
    const { error: enrichError } = await ctx.service
      .from('client_status_history')
      .update({
        source: 'manual',
        changed_by: ctx.userId,
        changed_at: calledAt,
        reason_code: draft.reason_code,
        note: historyNote,
      })
      .eq('id', historyId);

    if (enrichError) {
      return NextResponse.json({ error: enrichError.message }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  const { data: churnCall, error: callErr } = await ctx.service
    .from('client_calls')
    .insert({
      client_id: clientId,
      call_type: 'churn',
      called_at: calledAt,
      disposition: 'completed',
      recording_url: draft.recording_url.trim() || null,
      transcript: draft.transcript.trim() || null,
      notes: draft.client_feedback.trim(),
      status_history_id: historyId ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      updated_at: now,
    })
    .select(CLIENT_CALL_FIELDS)
    .single();

  if (callErr) return NextResponse.json({ error: callErr.message }, { status: 500 });

  const submission = await insertFormSubmission(ctx.service, {
    client_id: clientId,
    form_type: 'churn',
    status: 'applied',
    submitted_by: ctx.userId,
    responses,
    applied_patch: {
      lifecycle_status: lifecycleStatus,
      effective_churn_date: draft.effective_churn_date,
      reason_code: draft.reason_code,
    },
  });

  void runChurnSideEffects(
    {
      id: client.id,
      name: client.name,
      clickup_task_id: client.clickup_task_id,
      ghl_contact_id: client.ghl_contact_id,
      mrr: client.mrr,
    },
    draft,
    responses,
    ctx.service,
  );

  return NextResponse.json({
    client_id: clientId,
    churn_call: churnCall,
    submission,
  });
}
