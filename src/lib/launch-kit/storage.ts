/**
 * Launch Kit — Supabase Storage helpers. Bucket is private; access is via signed URLs.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { FORM_SUBMISSION_FIELDS, type FormSubmissionRow } from '@/lib/form-submissions';
import { launchKitSlug, launchKitStoragePath } from './intake';

export const LAUNCH_KIT_BUCKET = 'client-launch-kits';

/** 7 days — the Slack link lifetime. Drive is the permanent home per the SOP. */
export const LAUNCH_KIT_SLACK_LINK_TTL_SEC = 7 * 24 * 60 * 60;
/** Short-lived redirect for in-app downloads. */
export const LAUNCH_KIT_DOWNLOAD_TTL_SEC = 15 * 60;

export type LaunchKitVersionRow = {
  submission_id: string;
  version: number;
  storage_path: string;
  template_version: string | null;
  submitted_at: string;
  submitted_by: string | null;
  sent_to_client_at: string | null;
  variant: { product: string; dialOwner: string } | null;
};

export function versionRowFromSubmission(row: FormSubmissionRow): LaunchKitVersionRow | null {
  const r = row.responses ?? {};
  const path = typeof r.storage_path === 'string' ? r.storage_path : null;
  const version = typeof r.version === 'number' ? r.version : Number(r.version);
  if (!path || !Number.isFinite(version)) return null;
  const variant = r.variant && typeof r.variant === 'object' ? (r.variant as { product: string; dialOwner: string }) : null;
  return {
    submission_id: row.id,
    version,
    storage_path: path,
    template_version: typeof r.template_version === 'string' ? r.template_version : null,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    sent_to_client_at: typeof r.sent_to_client_at === 'string' ? r.sent_to_client_at : null,
    variant,
  };
}

/** All generated (status=applied) kits for a client, newest first. */
export async function listLaunchKitVersions(
  service: SupabaseClient,
  clientId: string,
): Promise<{ rows: FormSubmissionRow[]; versions: LaunchKitVersionRow[] }> {
  const { data, error } = await service
    .from('client_form_submissions')
    .select(FORM_SUBMISSION_FIELDS)
    .eq('client_id', clientId)
    .eq('form_type', 'launch_kit')
    .eq('status', 'applied')
    .order('submitted_at', { ascending: false });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as FormSubmissionRow[];
  const versions = rows.map(versionRowFromSubmission).filter((v): v is LaunchKitVersionRow => !!v);
  return { rows, versions };
}

/** Latest saved draft (status=draft) for prefill, if any. */
export async function getLatestLaunchKitDraft(
  service: SupabaseClient,
  clientId: string,
): Promise<FormSubmissionRow | null> {
  const { data, error } = await service
    .from('client_form_submissions')
    .select(FORM_SUBMISSION_FIELDS)
    .eq('client_id', clientId)
    .eq('form_type', 'launch_kit')
    .eq('status', 'draft')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FormSubmissionRow | null) ?? null;
}

export function nextLaunchKitVersion(versions: LaunchKitVersionRow[]): number {
  return versions.reduce((max, v) => Math.max(max, v.version), 0) + 1;
}

export async function uploadLaunchKitPdf(
  service: SupabaseClient,
  params: { clientId: string; companyName: string; clientName: string; version: number; pdf: Buffer },
): Promise<{ path: string; slug: string }> {
  const slug = launchKitSlug(params.companyName, params.clientName);
  const path = launchKitStoragePath(params.clientId, slug, params.version);
  const { error } = await service.storage.from(LAUNCH_KIT_BUCKET).upload(path, params.pdf, {
    contentType: 'application/pdf',
    upsert: false,
  });
  if (error) throw new Error(`Launch Kit upload failed: ${error.message}`);
  return { path, slug };
}

export async function signLaunchKitUrl(
  service: SupabaseClient,
  path: string,
  expiresSec: number,
  downloadName?: string,
): Promise<string> {
  const { data, error } = await service.storage
    .from(LAUNCH_KIT_BUCKET)
    .createSignedUrl(path, expiresSec, downloadName ? { download: downloadName } : undefined);
  if (error || !data?.signedUrl) throw new Error(`Launch Kit signed URL failed: ${error?.message ?? 'unknown'}`);
  return data.signedUrl;
}

export function launchKitFileName(path: string): string {
  return path.split('/').pop() ?? 'launch-kit.pdf';
}
