/**
 * Virtual Card — draft / published submission helpers.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { FORM_SUBMISSION_FIELDS, type FormSubmissionRow } from "@/lib/form-submissions";

export async function getLatestVirtualCardDraft(
  service: SupabaseClient,
  clientId: string,
): Promise<FormSubmissionRow | null> {
  const { data, error } = await service
    .from("client_form_submissions")
    .select(FORM_SUBMISSION_FIELDS)
    .eq("client_id", clientId)
    .eq("form_type", "virtual_card")
    .eq("status", "draft")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FormSubmissionRow | null) ?? null;
}

export async function getLatestPublishedVirtualCard(
  service: SupabaseClient,
  clientId: string,
): Promise<FormSubmissionRow | null> {
  const { data, error } = await service
    .from("client_form_submissions")
    .select(FORM_SUBMISSION_FIELDS)
    .eq("client_id", clientId)
    .eq("form_type", "virtual_card")
    .eq("status", "applied")
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as FormSubmissionRow | null) ?? null;
}

/** Public lookup: published card responses by slug. */
export async function getPublishedCardBySlug(
  service: SupabaseClient,
  slug: string,
): Promise<{ clientId: string | null; responses: Record<string, unknown> } | null> {
  const key = slug.trim().toLowerCase();
  if (!key) return null;

  // Prefer clients.virtual_card_slug → latest applied submission
  const { data: clientRow } = await service
    .from("clients")
    .select("id, virtual_card_slug")
    .eq("virtual_card_slug", key)
    .maybeSingle();

  if (clientRow?.id) {
    const published = await getLatestPublishedVirtualCard(service, clientRow.id as string);
    if (published?.responses) {
      return { clientId: clientRow.id as string, responses: published.responses };
    }
  }

  // Fallback: scan applied virtual_card responses for matching slug
  const { data, error } = await service
    .from("client_form_submissions")
    .select(FORM_SUBMISSION_FIELDS)
    .eq("form_type", "virtual_card")
    .eq("status", "applied")
    .order("submitted_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as FormSubmissionRow[]) {
    const s = typeof row.responses?.slug === "string" ? row.responses.slug.trim().toLowerCase() : "";
    if (s === key) {
      return { clientId: row.client_id, responses: row.responses };
    }
  }
  return null;
}

/** True if another client already owns this slug. */
export async function isSlugTaken(
  service: SupabaseClient,
  slug: string,
  exceptClientId?: string,
): Promise<boolean> {
  const key = slug.trim().toLowerCase();
  if (!key) return false;

  let q = service
    .from("clients")
    .select("id")
    .eq("virtual_card_slug", key)
    .limit(1);
  if (exceptClientId) q = q.neq("id", exceptClientId);
  const { data } = await q.maybeSingle();
  if (data?.id) return true;

  const published = await getPublishedCardBySlug(service, key);
  if (!published) return false;
  if (exceptClientId && published.clientId === exceptClientId) return false;
  return !!published.clientId || !!published.responses;
}
