import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { FORM_SUBMISSION_FIELDS } from '@/lib/form-submissions';
import { mergeCsChecklistPatch } from '@/lib/reinstate-form';

// PATCH /api/form-submissions/[id] — CS checklist toggles on a reinstate submission.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await ctx.service
    .from('client_form_submissions')
    .select(FORM_SUBMISSION_FIELDS)
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
  if (existing.form_type !== 'reinstate') {
    return NextResponse.json({ error: 'CS checklist is only on reinstate submissions' }, { status: 400 });
  }

  const responses = (existing.responses ?? {}) as Record<string, unknown>;
  const merged = mergeCsChecklistPatch(responses, body.cs_checklist);
  if (!merged) {
    return NextResponse.json({ error: 'cs_checklist with known keys is required' }, { status: 400 });
  }

  const nextResponses = { ...responses, cs_checklist: merged };
  const { data, error } = await ctx.service
    .from('client_form_submissions')
    .update({ responses: nextResponses })
    .eq('id', id)
    .select(FORM_SUBMISSION_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ submission: data, responses: nextResponses });
}
