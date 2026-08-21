"use client";

import {
  folderBreadcrumb,
  folderPathKey,
  type FolderPath,
} from "@/lib/ad-library-folders";

type Props = {
  path: FolderPath;
  onSelect: (path: FolderPath) => void;
  formatLabels: Record<string, string>;
  count: number;
};

export default function LibraryBreadcrumb({ path, onSelect, formatLabels, count }: Props) {
  const crumbs = folderBreadcrumb(path, formatLabels);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
      <nav className="flex flex-wrap items-center gap-1.5 min-w-0" aria-label="Folder path">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <span key={folderPathKey(c.path) + i} className="flex items-center gap-1.5 min-w-0">
              {i > 0 ? (
                <span style={{ color: "#475569" }} className="text-xs shrink-0">
                  /
                </span>
              ) : null}
              {last ? (
                <span
                  className="text-sm font-semibold truncate"
                  style={{ color: "#e2e8f0", fontFamily: "var(--font-archivo), sans-serif" }}
                >
                  {c.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(c.path)}
                  className="text-sm truncate hover:underline"
                  style={{ color: "#94a3b8" }}
                >
                  {c.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <span
        className="text-[11px] tabular-nums shrink-0"
        style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}
      >
        {count} ad{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}
