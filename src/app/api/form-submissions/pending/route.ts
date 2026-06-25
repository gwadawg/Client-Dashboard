import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  applyPendingOnboardingToClient,
  createClientAndApplyPendingOnboarding,
} from '@/lib/apply-onboarding';
import { countUnmappedOnboarding, listUnmappedOnboardingSubmissions } from '@/lib/form-submissions';

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  try {
    const [submissions, total, clientsRes] = await Promise.all([
      listUnmappedOnboardingSubmissions(ctx.service),
      countUnmappedOnboarding(ctx.service),
      ctx.service.from('clients').select('id, name, email, phone').order('name'),
    ]);
    return NextResponse.json({
      total,
      submissions,
      clients: clientsRes.data ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = typeof body.action === 'string' ? body.action : '';
  const submissionId = typeof body.submission_id === 'string' ? body.submission_id : '';
  if (!submissionId) {
    return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });
  }

  const submittedBy = ctx.userId;

  try {
    if (action === 'assign') {
      const clientId = typeof body.client_id === 'string' ? body.client_id : '';
      if (!clientId) {
        return NextResponse.json({ error: 'client_id is required for assign' }, { status: 400 });
      }
      const submission = await applyPendingOnboardingToClient(
        ctx.service,
        submissionId,
        clientId,
        submittedBy,
      );
      const { data: client } = await ctx.service
        .from('clients')
        .select('id, name')
        .eq('id', clientId)
        .single();
      return NextResponse.json({ submission, client });
    }

    if (action === 'create_client') {
      const result = await createClientAndApplyPendingOnboarding(
        ctx.service,
        submissionId,
        submittedBy,
      );
      return NextResponse.json(result);
    }

    if (action === 'dismiss') {
      const { data, error } = await ctx.service
        .from('client_form_submissions')
        .update({ status: 'dismissed' })
        .eq('id', submissionId)
        .eq('form_type', 'onboarding')
        .eq('status', 'unmapped')
        .select('id, status')
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) throw new Error('Submission not found or already resolved');
      return NextResponse.json({ submission: data });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
