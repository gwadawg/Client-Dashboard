/** Folder browse model for Ad Library (Product → Format + smart queues). */

export type AdProductKey = "reverse" | "dscr" | "broad_forward";

export type ProductFolderKey = AdProductKey | "unassigned";

export type FormatFolderKey = string | "unassigned";

export type SmartFolderId = "all" | "ready" | "winners" | "needs";

export type FolderPath =
  | { kind: "smart"; id: SmartFolderId }
  | { kind: "product"; product: ProductFolderKey; format?: FormatFolderKey };

export type LibraryFolderEntry = {
  product: string | null;
  ad_format: string | null;
  status: string;
  ready_to_test?: boolean | null;
};

export const FOLDER_STORAGE_KEY = "ad-library-folder-path-v1";

export const PRODUCT_FOLDER_ORDER: ProductFolderKey[] = [
  "reverse",
  "dscr",
  "broad_forward",
  "unassigned",
];

export const PRODUCT_FOLDER_LABELS: Record<ProductFolderKey, string> = {
  reverse: "RM",
  dscr: "DSCR",
  broad_forward: "Broad Forward",
  unassigned: "Unassigned product",
};

export const SMART_FOLDER_LABELS: Record<SmartFolderId, string> = {
  all: "All ads",
  ready: "Ready to test",
  winners: "Winners",
  needs: "Needs classification",
};

export function productFolderKey(product: string | null | undefined): ProductFolderKey {
  if (product === "reverse" || product === "dscr" || product === "broad_forward") return product;
  return "unassigned";
}

export function formatFolderKey(adFormat: string | null | undefined): FormatFolderKey {
  return adFormat?.trim() ? adFormat.trim() : "unassigned";
}

export function needsClassification(e: LibraryFolderEntry): boolean {
  return !e.product?.trim() || !e.ad_format?.trim();
}

export function entryMatchesFolder(e: LibraryFolderEntry, path: FolderPath): boolean {
  if (path.kind === "smart") {
    switch (path.id) {
      case "all":
        return true;
      case "ready":
        return !!e.ready_to_test;
      case "winners":
        return e.status === "winner";
      case "needs":
        return needsClassification(e);
      default:
        return true;
    }
  }

  if (productFolderKey(e.product) !== path.product) return false;
  if (path.format === undefined) return true;
  return formatFolderKey(e.ad_format) === path.format;
}

export function folderPathKey(path: FolderPath): string {
  if (path.kind === "smart") return `smart:${path.id}`;
  if (path.format === undefined) return `product:${path.product}`;
  return `product:${path.product}:${path.format}`;
}

export function parseFolderPathKey(raw: string | null | undefined): FolderPath | null {
  if (!raw) return null;
  if (raw.startsWith("smart:")) {
    const id = raw.slice(6) as SmartFolderId;
    if (id === "all" || id === "ready" || id === "winners" || id === "needs") {
      return { kind: "smart", id };
    }
    return null;
  }
  if (raw.startsWith("product:")) {
    const rest = raw.slice(8);
    const [product, ...formatParts] = rest.split(":");
    if (
      product !== "reverse" &&
      product !== "dscr" &&
      product !== "broad_forward" &&
      product !== "unassigned"
    ) {
      return null;
    }
    if (formatParts.length === 0) return { kind: "product", product };
    const format = formatParts.join(":") || "unassigned";
    return { kind: "product", product, format };
  }
  return null;
}

export function defaultFolderPath(): FolderPath {
  return { kind: "smart", id: "all" };
}

export function loadStoredFolderPath(): FolderPath {
  if (typeof window === "undefined") return defaultFolderPath();
  try {
    const parsed = parseFolderPathKey(localStorage.getItem(FOLDER_STORAGE_KEY));
    return parsed ?? defaultFolderPath();
  } catch {
    return defaultFolderPath();
  }
}

export function storeFolderPath(path: FolderPath): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FOLDER_STORAGE_KEY, folderPathKey(path));
  } catch {
    /* ignore quota / private mode */
  }
}

export type FormatCountNode = {
  format: FormatFolderKey;
  count: number;
};

export type ProductCountNode = {
  product: ProductFolderKey;
  count: number;
  formats: FormatCountNode[];
};

export type FolderTreeCounts = {
  smart: Record<SmartFolderId, number>;
  products: ProductCountNode[];
};

export function buildFolderTreeCounts(
  entries: LibraryFolderEntry[],
  formatCatalogSlugs: string[],
): FolderTreeCounts {
  const smart: Record<SmartFolderId, number> = {
    all: entries.length,
    ready: 0,
    winners: 0,
    needs: 0,
  };

  const byProduct = new Map<ProductFolderKey, Map<FormatFolderKey, number>>();
  for (const product of PRODUCT_FOLDER_ORDER) {
    byProduct.set(product, new Map());
  }

  for (const e of entries) {
    if (e.ready_to_test) smart.ready += 1;
    if (e.status === "winner") smart.winners += 1;
    if (needsClassification(e)) smart.needs += 1;

    const product = productFolderKey(e.product);
    const format = formatFolderKey(e.ad_format);
    const formats = byProduct.get(product) ?? new Map();
    formats.set(format, (formats.get(format) ?? 0) + 1);
    byProduct.set(product, formats);
  }

  const catalogSet = new Set(formatCatalogSlugs);
  const products: ProductCountNode[] = PRODUCT_FOLDER_ORDER.map((product) => {
    const formatsMap = byProduct.get(product) ?? new Map();
    let count = 0;
    for (const n of formatsMap.values()) count += n;

    const formatKeys = new Set<FormatFolderKey>([...formatsMap.keys(), ...catalogSet]);
    if (!formatKeys.has("unassigned") && (formatsMap.get("unassigned") ?? 0) > 0) {
      formatKeys.add("unassigned");
    }

    const formats: FormatCountNode[] = [...formatKeys]
      .map((format) => ({ format, count: formatsMap.get(format) ?? 0 }))
      .filter((f) => f.count > 0 || catalogSet.has(f.format))
      .sort((a, b) => {
        if (a.format === "unassigned") return 1;
        if (b.format === "unassigned") return -1;
        return a.format.localeCompare(b.format);
      });

    return { product, count, formats };
  }).filter((p) => p.count > 0 || p.product !== "unassigned");

  return { smart, products };
}

export function folderBreadcrumb(
  path: FolderPath,
  formatLabels: Record<string, string>,
): { label: string; path: FolderPath }[] {
  const crumbs: { label: string; path: FolderPath }[] = [
    { label: "Library", path: { kind: "smart", id: "all" } },
  ];
  if (path.kind === "smart") {
    if (path.id !== "all") {
      crumbs.push({ label: SMART_FOLDER_LABELS[path.id], path });
    }
    return crumbs;
  }
  crumbs.push({
    label: PRODUCT_FOLDER_LABELS[path.product],
    path: { kind: "product", product: path.product },
  });
  if (path.format !== undefined) {
    crumbs.push({
      label:
        path.format === "unassigned"
          ? "Unassigned format"
          : formatLabels[path.format] ?? path.format,
      path,
    });
  }
  return crumbs;
}

/** Prefill create form from the current folder selection. */
export function formPrefillFromFolder(path: FolderPath): {
  product: string;
  ad_format: string;
} {
  if (path.kind === "smart") return { product: "", ad_format: "" };
  return {
    product: path.product === "unassigned" ? "" : path.product,
    ad_format: !path.format || path.format === "unassigned" ? "" : path.format,
  };
}

/** Path to open when deep-linking to a library row. */
export function folderPathForEntry(e: LibraryFolderEntry): FolderPath {
  const product = productFolderKey(e.product);
  const format = formatFolderKey(e.ad_format);
  if (product === "unassigned" && format === "unassigned") {
    return { kind: "smart", id: "needs" };
  }
  return { kind: "product", product, format };
}

export function shouldSectionByFormat(path: FolderPath): boolean {
  return path.kind === "smart" && path.id === "all"
    ? true
    : path.kind === "product" && path.format === undefined;
}

/**
 * How many ads outside the current folder still satisfy the active filters.
 * Backs the "search everywhere" escape hatch, so it takes the grid's own
 * predicate rather than re-deriving one that could drift.
 */
export function countMatchesOutsideFolder<T extends LibraryFolderEntry>(
  entries: T[],
  path: FolderPath,
  passes: (e: T) => boolean,
): number {
  return entries.filter((e) => !entryMatchesFolder(e, path) && passes(e)).length;
}

export type LibrarySort = "name" | "updated" | "created" | "cpl";

export const LIBRARY_SORT_OPTIONS: { slug: LibrarySort; label: string }[] = [
  { slug: "name", label: "Name A–Z" },
  { slug: "updated", label: "Recently updated" },
  { slug: "created", label: "Newest added" },
  { slug: "cpl", label: "Best CPL" },
];

export const DEFAULT_LIBRARY_SORT: LibrarySort = "name";

export function parseLibrarySort(raw: string | null | undefined): LibrarySort | null {
  return LIBRARY_SORT_OPTIONS.some((o) => o.slug === raw) ? (raw as LibrarySort) : null;
}

export type SortableAd = {
  ad_name: string;
  created_at: string;
  updated_at: string;
};

function timestamp(raw: string): number {
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Every order falls back to name so the grid is totally ordered — the API
 * returns `updated_at desc`, which reshuffles cards whenever an ad is edited.
 * Ads with no CPL in range sort last instead of winning "Best CPL" on a null.
 */
export function libraryAdComparator<T extends SortableAd>(
  sort: LibrarySort,
  cplOf: (e: T) => number | null | undefined,
): (a: T, b: T) => number {
  return (a, b) => {
    if (sort === "updated") {
      const d = timestamp(b.updated_at) - timestamp(a.updated_at);
      if (d !== 0) return d;
    } else if (sort === "created") {
      const d = timestamp(b.created_at) - timestamp(a.created_at);
      if (d !== 0) return d;
    } else if (sort === "cpl") {
      const av = cplOf(a) ?? null;
      const bv = cplOf(b) ?? null;
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
      if (av != null && bv != null && av !== bv) return av - bv;
    }
    return a.ad_name.localeCompare(b.ad_name, undefined, { sensitivity: "base" });
  };
}

export function groupEntriesByFormat<T extends LibraryFolderEntry>(
  entries: T[],
  formatLabels: Record<string, string>,
): { key: FormatFolderKey; label: string; entries: T[] }[] {
  const map = new Map<FormatFolderKey, T[]>();
  for (const e of entries) {
    const key = formatFolderKey(e.ad_format);
    const list = map.get(key) ?? [];
    list.push(e);
    map.set(key, list);
  }
  return [...map.entries()]
    .map(([key, list]) => ({
      key,
      label: key === "unassigned" ? "Unassigned format" : formatLabels[key] ?? key,
      entries: list,
    }))
    .sort((a, b) => {
      if (a.key === "unassigned") return 1;
      if (b.key === "unassigned") return -1;
      return a.label.localeCompare(b.label);
    });
}
