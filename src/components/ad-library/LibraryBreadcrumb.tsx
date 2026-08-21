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
                <span style={{ color: "var(--color-ws-text-faint)" }} className="text-xs shrink-0">
                  /
                </span>
              ) : null}
              {last ? (
                <span
                  className="text-sm font-semibold truncate"
                  style={{ color: "var(--color-ws-text)" }}
                >
                  {c.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onSelect(c.path)}
                  className="text-sm truncate hover:underline"
                  style={{ color: "var(--color-ws-text-muted)" }}
                >
                  {c.label}
                </button>
              )}
            </span>
          );
        })}
      </nav>
      <span
        className="text-[10px] shrink-0 adlib-data"
        style={{ color: "var(--color-ws-text-muted)" }}
      >
        {count} ad{count === 1 ? "" : "s"}
      </span>
    </div>
  );
}
