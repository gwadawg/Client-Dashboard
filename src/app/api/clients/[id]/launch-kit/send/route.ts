import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { FORM_SUBMISSION_FIELDS, type FormSubmissionRow } from '@/lib/form-submissions';
import { draftFromResponses } from '@/lib/launch-kit/intake';
import {
  LAUNCH_KIT_SLACK_LINK_TTL_SEC,
  launchKitFileName,
  signLaunchKitUrl,
  versionRowFromSubmission,
} from '@/lib/launch-kit/storage';
import { notifyMrWaizActivity, resolveActorDisplayName } from '@/lib/mr-waiz-activity-notify';
import { formatLaunchKitClientSlackMessage, isSlackConfigured, postSlackMessage } from '@/lib/slack-notify';

const PERMISSION_KEYS = ['admin_clients', 'admin_billing'];

/** Post the kit to the client's Slack channel. Called by the CSM on the Launch Call — never automatic. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, PERMISSION_KEYS);
  if (denied) return denied;

  if (!isSlackConfigured()) {
    return NextResponse.json({ error: 'Slack is not configured (SLACK_BOT_TOKEN missing)' }, { status: 503 });
  }

  const { id: clientId } = await params;
  const body = (await req.json().catch(() => null)) as { submission_id?: string } | null;
  const submissionId = body?.submission_id?.trim();
  if (!submissionId) return NextResponse.json({ error: 'submission_id is required' }, { status: 400 });

  const [{ data: client }, { data: subData }] = await Promise.all([
    ctx.service.from('clients').select('id, name, slack_id').eq('id', clientId).single(),
    ctx.service
      .from('client_form_submissions')
      .select(FORM_SUBMISSION_FIELDS)
      .eq('id', submissionId)
      .eq('client_id', clientId)
      .eq('form_type', 'launch_kit')
      .eq('status', 'applied')
      .maybeSingle(),
  ]);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  if (!subData) return NextResponse.json({ error: 'Launch Kit version not found' }, { status: 404 });
  if (!client.slack_id) {
    return NextResponse.json(
      { error: 'This client has no Slack channel mapped. Set it in Admin → Automations → Client channels first.' },
      { status: 400 },
    );
  }

  const submission = subData as FormSubmissionRow;
  const version = versionRowFromSubmission(submission);
  if (!version) return NextResponse.json({ error: 'Launch Kit file is missing on this version' }, { status: 400 });

  const draft = draftFromResponses(submission.responses);
  const downloadUrl = await signLaunchKitUrl(
    ctx.service,
    version.storage_path,
    LAUNCH_KIT_SLACK_LINK_TTL_SEC,
    launchKitFileName(version.storage_path),
  );

  const text = formatLaunchKitClientSlackMessage({
    contact_first_name: draft.contact_first_name || null,
    company_name: draft.company_name || client.name,
    download_url: downloadUrl,
    launch_kit_folder_url:
      draft.launch_kit_folder_url && !draft.property_na.launch_kit_folder_url ? draft.launch_kit_folder_url : null,
    csm_name: draft.csm_name || null,
  });

  const result = await postSlackMessage({ channel: client.slack_id, text });
  if (!result.ok) {
    return NextResponse.json({ error: `Slack post failed: ${result.error}` }, { status: 502 });
  }

  const sentAt = new Date().toISOString();
  const { error: updErr } = await ctx.service
    .from('client_form_submissions')
    .update({
      responses: { ...submission.responses, sent_to_client_at: sentAt, sent_by: ctx.userId },
    })
    .eq('id', submissionId);
  if (updErr) console.error('[launch-kit] sent_to_client_at update failed', updErr.message);

  const actor = await resolveActorDisplayName(ctx.service, { userId: ctx.userId });
  void notifyMrWaizActivity(ctx.service, {
    eventKey: 'client.launch_kit_sent',
    actor: { userId: ctx.userId, label: actor },
    fields: { client_name: client.name, version: String(version.version), channel: client.slack_id },
  });

  return NextResponse.json({ ok: true, sent_to_client_at: sentAt, channel: result.channel });
}
