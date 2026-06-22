import { NextResponse } from "next/server";
import { getAuthContext, isAuthError, requireManageUsers, requirePermission } from "@/lib/api-auth";
import {
  parsePastedContent,
  processLibraryDoc,
  slugFromTitle,
  type LibraryDocInput,
  type LibraryDocumentRow,
  type ProcessedLibraryDoc,
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
): Promise<Map<string, string>> {
  const { data } = await service.from("library_documents").select("slug");
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    map.set(row.slug, row.slug);
    map.set(`${row.slug}.md`, row.slug);
  }
  return map;
}

function parseInput(body: Record<string, unknown>, slugMap: Map<string, string>): ProcessedLibraryDoc | NextResponse {
  let rawBody = typeof body.body === "string" ? body.body : "";
  let meta = body;

  if (rawBody.trim().startsWith("---")) {
    const parsed = parsePastedContent(rawBody);
    rawBody = parsed.body;
    meta = { ...parsed.metadata, ...body, body: rawBody };
  }

  const title = cleanString(meta.title);
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  const slug = cleanString(meta.slug) ?? slugFromTitle(title);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json({ error: "slug must be lowercase alphanumeric with hyphens" }, { status: 400 });
  }

  const owner = cleanString(meta.owner);
  if (!owner || !VALID_OWNERS.includes(owner as LibraryOwner)) {
    return NextResponse.json({ error: `owner must be one of: ${VALID_OWNERS.join(", ")}` }, { status: 400 });
  }

  const artifactType = cleanString(meta.artifact_type);
  if (!artifactType || !VALID_ARTIFACT_TYPES.includes(artifactType as LibraryArtifactType)) {
    return NextResponse.json(
      { error: `artifact_type must be one of: ${VALID_ARTIFACT_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const statusRaw = cleanString(meta.status);
  const status = statusRaw && VALID_STATUSES.includes(statusRaw as LibraryStatus)
    ? (statusRaw as LibraryStatus)
    : "draft";

  const deptRaw = cleanString(meta.department);
  const department =
    deptRaw && VALID_DEPARTMENTS.includes(deptRaw as LibraryDepartment)
      ? (deptRaw as LibraryDepartment)
      : null;

  if (!rawBody.trim()) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const input: LibraryDocInput = {
    slug,
    title,
    description: cleanString(meta.description),
    body: rawBody,
    domain: cleanString(meta.domain) ?? "acquisition",
    owner: owner as LibraryOwner,
    status,
    artifact_type: artifactType as LibraryArtifactType,
    department,
    review_cycle: cleanString(meta.review_cycle),
    script_version: cleanString(meta.script_version),
    related_docs: cleanRelatedDocs(meta.related_docs),
    featured: meta.featured === true,
    bundle: cleanString(meta.bundle),
    tags: cleanTags(meta.tags),
  };

  return processLibraryDoc(input, slugMap);
}

export async function GET() {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, "resources");
  if (denied) return denied;

  const { data, error } = await ctx.service
    .from("library_documents")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireManageUsers(ctx);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slugMap = await buildSlugMap(ctx.service);
  const processed = parseInput(body, slugMap);
  if (processed instanceof NextResponse) return processed;

  const row = {
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
    created_by: ctx.userId,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await ctx.service
    .from("library_documents")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "A document with this slug already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data as LibraryDocumentRow, { status: 201 });
}
