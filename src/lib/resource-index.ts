import { INTERNAL_FORMS, type InternalFormDef } from "@/lib/internal-forms";
import {
  LIBRARY_DOCS,
  artifactMeta,
  getBundleDocs,
  libraryHref,
  type LibraryArtifactType,
  type LibraryDocMeta,
  type LibraryOwner,
} from "@/lib/library-manifest";

export type LibSection = "all" | "playbooks" | "forms" | "links";

export type LinkResource = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  tags: string[];
  url: string;
};

export type PlaybookItem = {
  kind: "playbook";
  id: string;
  title: string;
  description: string;
  href: string;
  owner: LibraryOwner;
  artifact_type: LibraryArtifactType;
  status: LibraryDocMeta["status"];
  script_version: string | null;
  featured?: boolean;
  bundle?: string;
  tags: string[];
  doc: LibraryDocMeta;
};

export type FormItem = {
  kind: "form";
  id: string;
  title: string;
  description: string;
  href: string;
  audience: string;
  tags: string[];
  form: InternalFormDef;
};

export type LinkItem = {
  kind: "link";
  id: string;
  title: string;
  description: string;
  href: string;
  category: string;
  tags: string[];
  resource: LinkResource;
};

export type UnifiedItem = PlaybookItem | FormItem | LinkItem;

const OWNER_LABELS: Record<LibraryOwner, string> = {
  setter: "Setter",
  closer: "Closer",
  "sales-leadership": "Sales Leadership",
  operations: "Operations",
};

export function ownerLabel(owner: LibraryOwner): string {
  return OWNER_LABELS[owner] ?? owner;
}

export function playbookToItem(doc: LibraryDocMeta): PlaybookItem {
  return {
    kind: "playbook",
    id: `playbook:${doc.slug}`,
    title: doc.title,
    description: doc.description,
    href: libraryHref(doc.slug),
    owner: doc.owner,
    artifact_type: doc.artifact_type,
    status: doc.status,
    script_version: doc.script_version,
    featured: doc.featured,
    bundle: doc.bundle,
    tags: [doc.owner, doc.artifact_type, doc.domain, ...(doc.bundle ? [doc.bundle] : [])],
    doc,
  };
}

export function formToItem(form: InternalFormDef): FormItem {
  return {
    kind: "form",
    id: `form:${form.slug}`,
    title: form.title,
    description: form.description,
    href: form.href,
    audience: form.audience,
    tags: [...form.tags, "form", form.audience.toLowerCase()],
    form,
  };
}

export function linkToItem(resource: LinkResource): LinkItem {
  return {
    kind: "link",
    id: `link:${resource.id}`,
    title: resource.title,
    description: resource.description ?? "",
    href: resource.url,
    category: resource.category,
    tags: [...(resource.tags ?? []), resource.category],
    resource,
  };
}

export function getAllPlaybookItems(): PlaybookItem[] {
  return LIBRARY_DOCS.map(playbookToItem);
}

export function getSetterPlaybookItems(): PlaybookItem[] {
  return getBundleDocs("setter-playbooks").map(playbookToItem);
}

export function getAllFormItems(): FormItem[] {
  return INTERNAL_FORMS.map(formToItem);
}

export function buildUnifiedIndex(links: LinkResource[]): UnifiedItem[] {
  return [...getAllPlaybookItems(), ...getAllFormItems(), ...links.map(linkToItem)];
}

export function filterPlaybooks(
  items: PlaybookItem[],
  opts: { owner?: LibraryOwner | "all"; artifact?: LibraryArtifactType | "all"; bundle?: string },
): PlaybookItem[] {
  return items.filter((item) => {
    if (opts.owner && opts.owner !== "all" && item.owner !== opts.owner) return false;
    if (opts.artifact && opts.artifact !== "all" && item.artifact_type !== opts.artifact) return false;
    if (opts.bundle && item.bundle !== opts.bundle) return false;
    return true;
  });
}

export function searchItems(items: UnifiedItem[], query: string): UnifiedItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;

  return items.filter((item) => {
    const art = item.kind === "playbook" ? artifactMeta(item.artifact_type).label : "";
    const haystack = [
      item.title,
      item.description,
      item.kind,
      art,
      ...(item.tags ?? []),
      item.kind === "form" ? item.audience : "",
      item.kind === "link" ? item.category : "",
      item.kind === "playbook" ? ownerLabel(item.owner) : "",
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function groupByKind(items: UnifiedItem[]): Record<"playbook" | "form" | "link", UnifiedItem[]> {
  return {
    playbook: items.filter((i): i is PlaybookItem => i.kind === "playbook"),
    form: items.filter((i): i is FormItem => i.kind === "form"),
    link: items.filter((i): i is LinkItem => i.kind === "link"),
  };
}

export const LIB_SECTION_META: Record<
  LibSection,
  { label: string; description: string; color: string; tint: string }
> = {
  all: {
    label: "Browse",
    description: "Overview of everything in the library",
    color: "#f59e0b",
    tint: "rgba(245,158,11,0.10)",
  },
  playbooks: {
    label: "Playbooks",
    description: "Native scripts, SOPs, and guides — interactive and cross-linked",
    color: "#34d399",
    tint: "rgba(52,211,153,0.10)",
  },
  forms: {
    label: "Forms",
    description: "Built-in workflows for onboarding, churn, and team processes",
    color: "#60a5fa",
    tint: "rgba(96,165,250,0.10)",
  },
  links: {
    label: "Links",
    description: "External docs, templates, and bookmarks",
    color: "#c084fc",
    tint: "rgba(192,132,252,0.10)",
  },
};

export const PLAYBOOK_ARTIFACT_FILTERS: { value: LibraryArtifactType | "all"; label: string }[] = [
  { value: "all", label: "All types" },
  { value: "script", label: "Scripts" },
  { value: "sop", label: "SOPs" },
  { value: "checklist", label: "Checklists" },
  { value: "reference", label: "Reference" },
  { value: "framework", label: "Frameworks" },
  { value: "hub", label: "Hubs" },
];

export const PLAYBOOK_OWNER_FILTERS: { value: LibraryOwner | "all"; label: string }[] = [
  { value: "all", label: "All roles" },
  { value: "setter", label: "Setter" },
  { value: "closer", label: "Closer" },
  { value: "sales-leadership", label: "Sales Leadership" },
  { value: "operations", label: "Operations" },
];
