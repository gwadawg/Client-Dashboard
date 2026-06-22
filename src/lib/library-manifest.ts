import manifest from "../../content/library/manifest.json";

export type LibraryArtifactType =
  | "script"
  | "sop"
  | "checklist"
  | "reference"
  | "framework"
  | "doctrine"
  | "prompt"
  | "hub"
  | "document";

export type LibraryOwner = "setter" | "closer" | "sales-leadership" | "operations";

export type LibraryDepartment = "sales" | "call-center" | "media-buying" | "client-success" | "operations";

export type LibraryStatus = "active" | "draft";

export type RelatedDoc = {
  slug: string;
  label: string;
  relation?: string;
};

export type LibraryHeading = {
  level: number;
  title: string;
  id: string;
};

export type LibraryNavPill = {
  id: string;
  label: string;
};

export type LibraryDocMeta = {
  slug: string;
  title: string;
  description: string;
  domain: string;
  owner: LibraryOwner;
  status: LibraryStatus;
  artifact_type: LibraryArtifactType;
  last_updated: string | null;
  review_cycle: string | null;
  script_version: string | null;
  path: string;
  headings: LibraryHeading[];
  stage_nav: LibraryHeading[];
  opening_pills: LibraryNavPill[];
  icp_pills: LibraryNavPill[];
  related_docs: RelatedDoc[];
  featured?: boolean;
  bundle?: string;
  department?: LibraryDepartment;
};

export type LibraryManifest = {
  version: number;
  updated_at: string;
  docs: LibraryDocMeta[];
  bundles: Record<string, string[]>;
};

export const LIBRARY_MANIFEST = manifest as LibraryManifest;

export const LIBRARY_DOCS: LibraryDocMeta[] = LIBRARY_MANIFEST.docs;

export function getDocBySlug(slug: string): LibraryDocMeta | undefined {
  return LIBRARY_DOCS.find((d) => d.slug === slug);
}

export function getRelatedDocs(slug: string): LibraryDocMeta[] {
  const doc = getDocBySlug(slug);
  if (!doc) return [];
  return doc.related_docs
    .map((r) => getDocBySlug(r.slug))
    .filter((d): d is LibraryDocMeta => !!d);
}

export function getBundleDocs(bundle: string): LibraryDocMeta[] {
  const slugs = LIBRARY_MANIFEST.bundles[bundle] ?? [];
  return slugs.map((s) => getDocBySlug(s)).filter((d): d is LibraryDocMeta => !!d);
}

export function getFeaturedDocs(): LibraryDocMeta[] {
  return LIBRARY_DOCS.filter((d) => d.featured);
}

export function getSetterPlaybooks(): LibraryDocMeta[] {
  return getBundleDocs("setter-playbooks");
}

export function libraryHref(slug: string): string {
  return `/library/${slug}`;
}

const ARTIFACT_META: Record<
  LibraryArtifactType,
  { label: string; color: string; tint: string }
> = {
  script: { label: "Script", color: "#34d399", tint: "rgba(52,211,153,0.12)" },
  sop: { label: "SOP", color: "#34d399", tint: "rgba(52,211,153,0.12)" },
  checklist: { label: "Checklist", color: "#60a5fa", tint: "rgba(96,165,250,0.12)" },
  reference: { label: "Reference", color: "#f59e0b", tint: "rgba(245,158,11,0.12)" },
  framework: { label: "Framework", color: "#c084fc", tint: "rgba(192,132,252,0.12)" },
  doctrine: { label: "Doctrine", color: "#f87171", tint: "rgba(248,113,113,0.12)" },
  prompt: { label: "Prompt", color: "#94a3b8", tint: "rgba(148,163,184,0.12)" },
  hub: { label: "Hub", color: "#38bdf8", tint: "rgba(56,189,248,0.12)" },
  document: { label: "Document", color: "#f59e0b", tint: "rgba(245,158,11,0.12)" },
};

export function artifactMeta(type: LibraryArtifactType) {
  return ARTIFACT_META[type] ?? ARTIFACT_META.document;
}

export function statusMeta(status: LibraryStatus) {
  return status === "active"
    ? { label: "Active", color: "#34d399", tint: "rgba(52,211,153,0.12)" }
    : { label: "Draft", color: "#fbbf24", tint: "rgba(251,191,36,0.12)" };
}

export const DEPARTMENT_ORDER: LibraryDepartment[] = [
  "sales",
  "call-center",
  "media-buying",
  "client-success",
  "operations",
];

export const DEPARTMENT_META: Record<
  LibraryDepartment,
  { label: string; description: string; color: string; tint: string }
> = {
  sales: {
    label: "Sales",
    description: "Acquisition — setter, closer & outbound playbooks",
    color: "#34d399",
    tint: "rgba(52,211,153,0.10)",
  },
  "call-center": {
    label: "Call Center",
    description: "Client fulfillment — dialer ops, scripts & QA",
    color: "#38bdf8",
    tint: "rgba(56,189,248,0.10)",
  },
  "media-buying": {
    label: "Media Buying",
    description: "Ad ops, creative workflows & performance",
    color: "#c084fc",
    tint: "rgba(192,132,252,0.10)",
  },
  "client-success": {
    label: "Client Success",
    description: "Onboarding, client comms & retention SOPs",
    color: "#60a5fa",
    tint: "rgba(96,165,250,0.10)",
  },
  operations: {
    label: "Operations",
    description: "Company-wide ops, tooling, and internal process SOPs",
    color: "#f59e0b",
    tint: "rgba(245,158,11,0.10)",
  },
};

export function departmentMeta(dept: LibraryDepartment) {
  return DEPARTMENT_META[dept];
}

export function resolveDepartment(doc: LibraryDocMeta): LibraryDepartment {
  return doc.department ?? "sales";
}
