import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAuthContext, isAuthError, requireAnyPermission } from "@/lib/api-auth";
import { yamlExistsOnMain, openLandingPull } from "@/lib/landing-page/github";
import { headshotRepoFile } from "@/lib/landing-page/headshot";
import {
  draftForPublish,
  parseLandingDraft,
  prefillLandingDraft,
  validateForPublish,
} from "@/lib/landing-page/intake";
import { landingPageUrl, SLUG_PATTERN, thankYouPageUrl, yamlPath } from "@/lib/landing-page/products";
import { fieldsFromResponses, publishMetaFromResponses } from "@/lib/landing-page/responses";
import {
  getLatestAppliedLanding,
  getLatestLandingDraft,
  getOpenLandingSubmission,
  insertLandingPublish,
  saveLandingDraft,
  settleMergedLanding,
  slugTakenByOtherClient,
} from "@/lib/landing-page/storage";
import { LANDING_CLIENT_FIELDS, type LandingClient, type LandingDraft } from "@/lib/landing-page/types";
import { draftToYaml } from "@/lib/landing-page/yaml";

const PERMISSION_KEYS = ["admin_clients", "admin_billing"];

async function loadClient(service: SupabaseClient, clientId: string) {
  const { data, error } = await service
    .from("clients")
    .select(LANDING_CLIENT_FIELDS)
    .eq("id", clientId)
    .single();
  if (error || !data) return null;
  return data as unknown as LandingClient;
}

async function loadOnboardingFirstName(
  service: SupabaseClient,
  clientId: string,
): Promise<string | null> {
  const { data } = await service
    .from("client_form_submissions")
    .select("responses")
    .eq("client_id", clientId)
    .eq("form_type", "onboarding")
    .in("status", ["applied", "submitted"])
    .order("submitted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const responses = data?.responses as Record<string, unknown> | null;
  const first = responses?.first_name;
  return typeof first === "string" ? first.trim() : null;
}

function payload(
  draft: LandingDraft,
  extras: {
    locked: boolean;
    hasApplied: boolean;
    publish: ReturnType<typeof publishMetaFromResponses>;
    landingPageUrl: string | null;
    thankYouPageUrl: string | null;
    submissionId: string | null;
  },
) {
  return { draft, ...extras };
}

async function downloadHeadshot(url: string): Promise<{
  bytes: Buffer;
  contentType: string;
  filename: string;
}> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Could not download the headshot");
  const bytes = Buffer.from(await res.arrayBuffer());
  if (!bytes.length) throw new Error("Headshot file is empty");
  let filename = "headshot";
  try {
    filename = new URL(url).pathname;
  } catch {
    filename = "headshot";
  }
  return {
    bytes,
    contentType: res.headers.get("content-type") ?? "",
    filename,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, PERMISSION_KEYS);
  if (denied) return denied;

  const { id: clientId } = await params;
  const client = await loadClient(ctx.service, clientId);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (client.reporting_type !== "DSCR") {
    return NextResponse.json({ error: "Landing pages are for DSCR clients" }, { status: 400 });
  }

  const [draftRow, appliedRow, submittedRow, firstName] = await Promise.all([
    getLatestLandingDraft(ctx.service, clientId),
    getLatestAppliedLanding(ctx.service, clientId),
    getOpenLandingSubmission(ctx.service, clientId),
    loadOnboardingFirstName(ctx.service, clientId),
  ]);

  const locked = !!submittedRow;
  const source = submittedRow ?? draftRow ?? appliedRow;
  const saved = fieldsFromResponses(source?.responses ?? null);
  const draft = prefillLandingDraft(client, saved, firstName);
  const publish = publishMetaFromResponses((submittedRow ?? appliedRow)?.responses ?? null);

  return NextResponse.json(
    payload(draft, {
      locked,
      hasApplied: !!appliedRow,
      publish,
      landingPageUrl: client.landing_page_url,
      thankYouPageUrl: client.thank_you_page_url,
      submissionId: source?.id ?? null,
    }),
  );
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, PERMISSION_KEYS);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = (await req.json().catch(() => null)) as {
    action?: string;
    draft?: unknown;
  } | null;
  const action = body?.action;

  const client = await loadClient(ctx.service, clientId);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });
  if (client.reporting_type !== "DSCR") {
    return NextResponse.json({ error: "Landing pages are for DSCR clients" }, { status: 400 });
  }

  if (action === "check") {
    const submitted = await getOpenLandingSubmission(ctx.service, clientId);
    if (!submitted) {
      return NextResponse.json({ error: "No open publish to check" }, { status: 404 });
    }
    const meta = publishMetaFromResponses(submitted.responses);
    if (!meta.merged) {
      return NextResponse.json(
        { error: "The pull request is not merged yet", publish: meta },
        { status: 409 },
      );
    }
    const result = await settleMergedLanding(ctx.service, submitted, 1);
    const fresh = await loadClient(ctx.service, clientId);
    return NextResponse.json({
      result,
      landingPageUrl: fresh?.landing_page_url ?? null,
      thankYouPageUrl: fresh?.thank_you_page_url ?? null,
    });
  }

  if (action !== "save" && action !== "publish") {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const open = await getOpenLandingSubmission(ctx.service, clientId);
  if (open) {
    return NextResponse.json(
      { error: "A publish is already open. Wait until it merges or is closed.", pr_url: publishMetaFromResponses(open.responses).pr_url },
      { status: 409 },
    );
  }

  const parsed = parseLandingDraft(body?.draft);

  if (action === "save") {
    const row = await saveLandingDraft(ctx.service, clientId, parsed, ctx.userId);
    return NextResponse.json({
      draft: fieldsFromResponses(row.responses),
      submissionId: row.id,
    });
  }

  const applied = await getLatestAppliedLanding(ctx.service, clientId);
  const ready = draftForPublish(parsed, !!applied);
  const fieldErrors = validateForPublish(ready, {
    slugTaken: false,
    repoYamlExists: false,
    clientOwnsSlug: false,
  });
  if (fieldErrors.length || !SLUG_PATTERN.test(ready.slug)) {
    return NextResponse.json({ error: fieldErrors[0] || "Slug is required", errors: fieldErrors }, { status: 400 });
  }

  try {
    const [slugTaken, repoYamlExists] = await Promise.all([
      slugTakenByOtherClient(ctx.service, ready.slug, clientId),
      yamlExistsOnMain(ready.slug),
    ]);
    const ownedSlug = fieldsFromResponses(applied?.responses ?? null)?.slug === ready.slug;
    const errors = validateForPublish(ready, {
      slugTaken,
      repoYamlExists,
      clientOwnsSlug: ownedSlug,
    });
    if (errors.length) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 });
    }

    const files: { path: string; bytes: Buffer }[] = [
      { path: yamlPath(ready.slug), bytes: Buffer.from(draftToYaml(ready), "utf8") },
    ];
    if (client.headshot_url) {
      const shot = await downloadHeadshot(client.headshot_url);
      const file = headshotRepoFile(ready.slug, {
        contentType: shot.contentType,
        filename: shot.filename,
      });
      files.push({ path: file.path, bytes: shot.bytes });
    }

    const opened = await openLandingPull({
      slug: ready.slug,
      files,
      title: `Landing page: ${ready.slug}`,
      body: [
        "Published from Mr. Waiz.",
        "",
        `Live URL after merge: ${landingPageUrl(ready.slug)}`,
        `Thank-you: ${thankYouPageUrl(ready.slug)}`,
        `Search indexing: ${ready.preview ? "hidden (preview)" : "on"}`,
        "",
        "Vercel builds the HTML. Do not hand-edit generated pages.",
      ].join("\n"),
    });

    const publish = {
      pr_url: opened.prUrl,
      pr_number: opened.prNumber,
      head_sha: opened.headSha,
      merged: false,
      error: null,
    };
    const row = await insertLandingPublish(ctx.service, clientId, ready, publish, ctx.userId);
    return NextResponse.json({
      draft: ready,
      submissionId: row.id,
      locked: true,
      publish,
      pr_url: opened.prUrl,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Publish failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
