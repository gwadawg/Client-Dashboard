import { DSCR_GITHUB_REPO, LANDING_SCHEMA_VERSION } from "./products";
import { parseLandingDraft } from "./intake";
import type { LandingDraft, LandingPublishMeta } from "./types";

export function emptyPublish(): LandingPublishMeta {
  return { pr_url: null, pr_number: null, head_sha: null, merged: false, error: null };
}

export function toLandingResponses(draft: LandingDraft, publish: LandingPublishMeta = emptyPublish()) {
  return {
    schema_version: LANDING_SCHEMA_VERSION,
    product: "DSCR" as const,
    template_repo: DSCR_GITHUB_REPO,
    template_id: draft.theme,
    fields: draft,
    publish,
  };
}

export function fieldsFromResponses(responses: Record<string, unknown> | null | undefined): LandingDraft | null {
  if (!responses || typeof responses.fields !== "object" || responses.fields === null) return null;
  return parseLandingDraft(responses.fields);
}

export function publishMetaFromResponses(
  responses: Record<string, unknown> | null | undefined,
): LandingPublishMeta {
  const raw = responses?.publish;
  const p = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    pr_url: typeof p.pr_url === "string" ? p.pr_url : null,
    pr_number: typeof p.pr_number === "number" ? p.pr_number : null,
    head_sha: typeof p.head_sha === "string" ? p.head_sha : null,
    merged: p.merged === true,
    error: typeof p.error === "string" ? p.error : null,
  };
}
