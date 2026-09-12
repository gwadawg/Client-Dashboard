import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { FORM_SUBMISSION_FIELDS, type FormSubmissionRow } from '@/lib/form-submissions';
import {
  LAUNCH_KIT_DOWNLOAD_TTL_SEC,
  launchKitFileName,
  signLaunchKitUrl,
  versionRowFromSubmission,
} from '@/lib/launch-kit/storage';

const PERMISSION_KEYS = ['admin_clients', 'admin_billing', 'client_health'];

/** Team download: mints a fresh short-lived signed URL and redirects. Works after the Slack link expires. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, PERMISSION_KEYS);
  if (denied) return denied;

  const { id: clientId } = await params;
  const url = new URL(req.url);
  const submissionId = url.searchParams.get('submission')?.trim();
  const inline = url.searchParams.get('inline') === '1';

  let query = ctx.service
    .from('client_form_submissions')
    .select(FORM_SUBMISSION_FIELDS)
    .eq('client_id', clientId)
    .eq('form_type', 'launch_kit')
    .eq('status', 'applied')
    .order('submitted_at', { ascending: false })
    .limit(1);
  if (submissionId) query = query.eq('id', submissionId);

  const { data, error } = await query.maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'No Launch Kit found for this client' }, { status: 404 });

  const version = versionRowFromSubmission(data as FormSubmissionRow);
  if (!version) return NextResponse.json({ error: 'Launch Kit file is missing on this version' }, { status: 404 });

  const signed = await signLaunchKitUrl(
    ctx.service,
    version.storage_path,
    LAUNCH_KIT_DOWNLOAD_TTL_SEC,
    inline ? undefined : launchKitFileName(version.storage_path),
  );
  return NextResponse.redirect(signed, 302);
}
