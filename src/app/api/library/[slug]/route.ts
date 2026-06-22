import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requireManageUsers, requirePermission } from "@/lib/api-auth";
import {
  parsePastedContent,
  processLibraryDoc,
  slugFromTitle,
  type LibraryDocInput,
  type LibraryDocumentRow,
} from "@/lib/library-processor";
import type {
  LibraryArtifactType,
  LibraryDepartment,
  LibraryOwner,
  LibraryStatus,
  RelatedDoc,
} from "@/lib/library-manifest";

const VALID_OWNERS: LibraryOwner[] = ["setter", "closer", "sales-leadership", "operations"];
const VALID_STATUSES: LibraryStatus[] = ["active", "draft"];
const VALID_ARTIFACT_TYPES: LibraryArtifactType[] = [
  "script", "sop", "checklist", "reference", "framework", "doctrine", "prompt", "hub", "document",
];
const VALID_DEPARTMENTS: LibraryDepartment[] = ["sales", "call-center", "media-buying", "client-success"];

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s || null;
}

function cleanTags(v: unknown): string[] {
  let raw: string[] = [];
  if (Array.isArray(v)) raw = v.filter((t): t is string => typeof t === "string");
  else if (typeof v === "string") raw = v.split(",");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

function cleanRelatedDocs(v: unknown): RelatedDoc[] {
  if (!Array.isArray(v)) return [];
  return v.filter(
    (r): r is RelatedDoc =>
      r &&
      typeof r === "object" &&
      typeof (r as RelatedDoc).slug === "string" &&
      typeof (r as RelatedDoc).label === "string",
  );
}

async function buildSlugMap(
  service: ReturnType<typeof import("@/lib/supabase").createServiceClient>,
  excludeSlug?: string,
): Promise<Map<string, string>> {
  const { data } = await service.from("library_documents").select("slug");
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    if (excludeSlug && row.slug === excludeSlug) continue;
    map.set(row.slug, row.slug);
    map.set(`${row.slug}.md`, row.slug);
  }
  return map;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, "resources");
  if (denied) return denied;

  const { slug } = await params;
  const { data, error } = await ctx.service
    .from("library_documents")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json(data as LibraryDocumentRow);
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { slug: currentSlug } = await params;

  const { data: existing } = await ctx.service
    .from("library_documents")
    .select("*")
    .eq("slug", currentSlug)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let rawBody = typeof body.body === "string" ? body.body : existing.body;
  let meta = body;

  if (typeof body.body === "string" && rawBody.trim().startsWith("---")) {
    const parsed = parsePastedContent(rawBody);
    rawBody = parsed.body;
    meta = { ...parsed.metadata, ...body, body: rawBody };
  }

  const title = "title" in meta ? cleanString(meta.title) : existing.title;
  if (!title) return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });

  const newSlug =
    "slug" in meta ? (cleanString(meta.slug) ?? slugFromTitle(title)) : existing.slug;

  const ownerRaw = "owner" in meta ? cleanString(meta.owner) : existing.owner;
  if (!ownerRaw || !VALID_OWNERS.includes(ownerRaw as LibraryOwner)) {
    return NextResponse.json({ error: `owner must be one of: ${VALID_OWNERS.join(", ")}` }, { status: 400 });
  }

  const artifactRaw = "artifact_type" in meta ? cleanString(meta.artifact_type) : existing.artifact_type;
  if (!artifactRaw || !VALID_ARTIFACT_TYPES.includes(artifactRaw as LibraryArtifactType)) {
    return NextResponse.json(
      { error: `artifact_type must be one of: ${VALID_ARTIFACT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const statusRaw = "status" in meta ? cleanString(meta.status) : existing.status;
  const status =
    statusRaw && VALID_STATUSES.includes(statusRaw as LibraryStatus)
      ? (statusRaw as LibraryStatus)
      : existing.status;

  const deptRaw = "department" in meta ? cleanString(meta.department) : existing.department;
  const department =
    deptRaw === null
      ? null
      : deptRaw && VALID_DEPARTMENTS.includes(deptRaw as LibraryDepartment)
        ? (deptRaw as LibraryDepartment)
        : existing.department;

  const input: LibraryDocInput = {
    slug: newSlug,
    title,
    description: "description" in meta ? cleanString(meta.description) : existing.description,
    body: rawBody,
    domain: "domain" in meta ? (cleanString(meta.domain) ?? existing.domain) : existing.domain,
    owner: ownerRaw as LibraryOwner,
    status,
    artifact_type: artifactRaw as LibraryArtifactType,
    department,
    review_cycle: "review_cycle" in meta ? cleanString(meta.review_cycle) : existing.review_cycle,
    script_version: "script_version" in meta ? cleanString(meta.script_version) : existing.script_version,
    related_docs: "related_docs" in meta ? cleanRelatedDocs(meta.related_docs) : existing.related_docs,
    featured: "featured" in meta ? meta.featured === true : existing.featured,
    bundle: "bundle" in meta ? cleanString(meta.bundle) : existing.bundle,
    tags: "tags" in meta ? cleanTags(meta.tags) : existing.tags,
  };

  const slugMap = await buildSlugMap(ctx.service, currentSlug);
  const processed = processLibraryDoc(input, slugMap);

  const updates = {
    slug: processed.slug,
    title: processed.title,
    description: processed.description,
    body: processed.body,
    domain: processed.domain ?? "acquisition",
    owner: processed.owner,
    status: processed.status ?? "draft",
    artifact_type: processed.artifact_type,
    department: processed.department ?? null,
    review_cycle: processed.review_cycle ?? null,
    script_version: processed.script_version ?? null,
    related_docs: processed.related_docs,
    headings: processed.headings,
    stage_nav: processed.stage_nav,
    opening_pills: processed.opening_pills,
    icp_pills: processed.icp_pills,
    featured: processed.featured ?? false,
    bundle: processed.bundle ?? null,
    tags: processed.tags ?? [],
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from("library_documents")
    .update(updates)
    .eq("slug", currentSlug)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A document with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as LibraryDocumentRow);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  const { slug } = await params;
  const { error } = await ctx.service.from("library_documents").delete().eq("slug", slug);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
