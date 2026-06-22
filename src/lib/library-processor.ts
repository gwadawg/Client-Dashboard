import matter from "gray-matter";
import type {
  LibraryArtifactType,
  LibraryDepartment,
  LibraryHeading,
  LibraryNavPill,
  LibraryOwner,
  LibraryStatus,
  RelatedDoc,
} from "./library-manifest";

export type LibraryDocInput = {
  slug: string;
  title: string;
  description?: string | null;
  body: string;
  domain?: string;
  owner: LibraryOwner;
  status?: LibraryStatus;
  artifact_type: LibraryArtifactType;
  department?: LibraryDepartment | null;
  review_cycle?: string | null;
  script_version?: string | null;
  related_docs?: RelatedDoc[];
  featured?: boolean;
  bundle?: string | null;
  tags?: string[];
};

export type ProcessedLibraryDoc = LibraryDocInput & {
  description: string;
  headings: LibraryHeading[];
  stage_nav: LibraryHeading[];
  opening_pills: LibraryNavPill[];
  icp_pills: LibraryNavPill[];
  related_docs: RelatedDoc[];
};

export type ParsedPaste = {
  metadata: Partial<LibraryDocInput>;
  body: string;
};

const VALID_OWNERS: LibraryOwner[] = ["setter", "closer", "sales-leadership", "operations"];
const VALID_STATUSES: LibraryStatus[] = ["active", "draft"];
const VALID_ARTIFACT_TYPES: LibraryArtifactType[] = [
  "script", "sop", "checklist", "reference", "framework", "doctrine", "prompt", "hub", "document",
];
const VALID_DEPARTMENTS: LibraryDepartment[] = ["sales", "call-center", "media-buying", "client-success"];

export function slugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parsePastedContent(raw: string): ParsedPaste {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("---")) {
    return { metadata: {}, body: raw };
  }

  const { data, content } = matter(raw);
  const metadata: Partial<LibraryDocInput> = {};

  if (typeof data.title === "string") metadata.title = data.title.trim();
  if (typeof data.slug === "string") metadata.slug = data.slug.trim();
  if (typeof data.domain === "string") metadata.domain = data.domain.trim();
  if (typeof data.owner === "string" && VALID_OWNERS.includes(data.owner as LibraryOwner)) {
    metadata.owner = data.owner as LibraryOwner;
  }
  if (typeof data.status === "string" && VALID_STATUSES.includes(data.status as LibraryStatus)) {
    metadata.status = data.status as LibraryStatus;
  }
  if (typeof data.artifact_type === "string" && VALID_ARTIFACT_TYPES.includes(data.artifact_type as LibraryArtifactType)) {
    metadata.artifact_type = data.artifact_type as LibraryArtifactType;
  }
  if (typeof data.department === "string" && VALID_DEPARTMENTS.includes(data.department as LibraryDepartment)) {
    metadata.department = data.department as LibraryDepartment;
  }
  if (typeof data.review_cycle === "string") metadata.review_cycle = data.review_cycle;
  if (typeof data.script_version === "string") metadata.script_version = data.script_version;
  if (typeof data.bundle === "string") metadata.bundle = data.bundle;
  if (typeof data.featured === "boolean") metadata.featured = data.featured;
  if (Array.isArray(data.related_docs)) {
    metadata.related_docs = data.related_docs.filter(
      (r): r is RelatedDoc =>
        r && typeof r === "object" && typeof r.slug === "string" && typeof r.label === "string",
    );
  }
  if (Array.isArray(data.tags)) {
    metadata.tags = data.tags.filter((t): t is string => typeof t === "string");
  }

  return { metadata, body: content };
}

export function extractHeadings(body: string): LibraryHeading[] {
  const headings: LibraryHeading[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^(#{2,4})\s+(.+)$/);
    if (!m) continue;
    const level = m[1].length;
    const title = m[2].replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").trim();
    const id = title
      .toLowerCase()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    headings.push({ level, title, id });
  }
  return headings;
}

export function extractStageHeadings(headings: LibraryHeading[]): LibraryHeading[] {
  const h2 = headings.filter(
    (h) =>
      h.level === 2 &&
      (/^stage\s+1/i.test(h.title) ||
        /stages\s+2/i.test(h.title) ||
        /call checklist/i.test(h.title) ||
        /north star/i.test(h.title) ||
        /setter boundaries/i.test(h.title) ||
        /^icp tracks/i.test(h.title)),
  );
  const h3Stages = headings.filter((h) => h.level === 3 && /^stage\s+[2-7]/i.test(h.title));
  return [...h2, ...h3Stages];
}

function findHeadingId(headings: LibraryHeading[], pattern: RegExp): string | null {
  const hit = headings.find((h) => pattern.test(h.title));
  return hit?.id ?? null;
}

export function extractOpeningPills(headings: LibraryHeading[]): LibraryNavPill[] {
  const defs = [
    { label: "Booked", pattern: /opening\s*1/i },
    { label: "Confirm", pattern: /opening\s*2/i },
    { label: "Dialer", pattern: /opening\s*3/i },
    { label: "No-show", pattern: /opening\s*4/i },
  ];
  return defs
    .map((d) => {
      const resolved = findHeadingId(headings, d.pattern);
      return resolved ? { id: resolved, label: d.label } : null;
    })
    .filter((p): p is LibraryNavPill => p !== null);
}

export function extractIcpPills(headings: LibraryHeading[]): LibraryNavPill[] {
  const defs = [
    { label: "Referral LO", pattern: /track\s*1|referral/i },
    { label: "Marketing", pattern: /track\s*2|marketing/i },
    { label: "Forward→Reverse", pattern: /track\s*3|forward/i },
  ];
  return defs
    .map((d) => {
      const hit = headings.find((h) => d.pattern.test(h.title));
      return hit ? { id: hit.id, label: d.label } : null;
    })
    .filter((p): p is LibraryNavPill => p !== null)
    .slice(0, 3);
}

export function extractDescription(body: string): string {
  const purpose = body.match(/## Purpose\s*\n+([^\n#]+)/);
  if (purpose) return purpose[1].trim().slice(0, 200);
  const first = body
    .replace(/^#.+$/m, "")
    .trim()
    .split("\n")
    .find((l) => l.trim());
  return first?.trim().slice(0, 200) ?? "";
}

/** Rewrite relative .md links to /library/{slug} when slug is known. */
export function rewriteLibraryLinks(body: string, slugMap: Map<string, string>): string {
  return body.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (match, text, href) => {
    const [filePart, anchor = ""] = href.split("#");
    if (!filePart.endsWith(".md")) return match;
    if (filePart.startsWith("http://") || filePart.startsWith("https://")) return match;

    const basename = filePart.replace(/^\.\//, "").split("/").pop() ?? filePart;
    const slug =
      slugMap.get(filePart.replace(/^\.\//, "")) ??
      slugMap.get(basename) ??
      slugMap.get(basename.replace(/\.md$/, ""));

    if (!slug) return match;

    const hash = anchor ? `#${anchor}` : "";
    return `[${text}](/library/${slug}${hash})`;
  });
}

export function processLibraryDoc(
  input: LibraryDocInput,
  slugMap?: Map<string, string>,
): ProcessedLibraryDoc {
  const rewritten = slugMap ? rewriteLibraryLinks(input.body, slugMap) : input.body;
  const headings = extractHeadings(rewritten);
  const description = input.description?.trim() || extractDescription(rewritten);

  return {
    ...input,
    body: rewritten,
    description,
    headings,
    stage_nav: extractStageHeadings(headings),
    opening_pills: extractOpeningPills(headings),
    icp_pills: extractIcpPills(headings),
    related_docs: input.related_docs ?? [],
    tags: input.tags ?? [],
    domain: input.domain ?? "acquisition",
    status: input.status ?? "draft",
  };
}

export type LibraryDocumentRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  body: string;
  domain: string;
  owner: LibraryOwner;
  status: LibraryStatus;
  artifact_type: LibraryArtifactType;
  department: LibraryDepartment | null;
  review_cycle: string | null;
  script_version: string | null;
  related_docs: RelatedDoc[];
  headings: LibraryHeading[];
  stage_nav: LibraryHeading[];
  opening_pills: LibraryNavPill[];
  icp_pills: LibraryNavPill[];
  featured: boolean;
  bundle: string | null;
  tags: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
};

export function rowToDocMeta(row: LibraryDocumentRow) {
  return {
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    domain: row.domain,
    owner: row.owner,
    status: row.status,
    artifact_type: row.artifact_type,
    last_updated: row.updated_at,
    review_cycle: row.review_cycle,
    script_version: row.script_version,
    path: `db://${row.slug}`,
    headings: row.headings,
    stage_nav: row.stage_nav,
    opening_pills: row.opening_pills,
    icp_pills: row.icp_pills,
    related_docs: row.related_docs,
    featured: row.featured,
    bundle: row.bundle ?? undefined,
    department: row.department ?? undefined,
  };
}
