"use client";

import { useEffect, useState } from "react";
import {
  PRODUCT_FOLDER_LABELS,
  SMART_FOLDER_LABELS,
  folderPathKey,
  type FolderPath,
  type FolderTreeCounts,
  type ProductFolderKey,
  type SmartFolderId,
} from "@/lib/ad-library-folders";

const SMART_IDS: SmartFolderId[] = ["all", "ready", "winners", "needs"];

type Props = {
  path: FolderPath;
  onSelect: (path: FolderPath) => void;
  counts: FolderTreeCounts;
  formatLabels: Record<string, string>;
};

function CountBadge({ n }: { n: number }) {
  return (
    <span
      className="ml-auto tabular-nums text-[10px] font-semibold shrink-0"
      style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}
    >
      {n}
    </span>
  );
}

function Row({
  label,
  count,
  active,
  depth,
  onClick,
  expanded,
  onToggle,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  depth: 0 | 1 | 2;
  onClick: () => void;
  expanded?: boolean;
  onToggle?: () => void;
  accent?: string;
}) {
  const pad = depth === 0 ? "pl-2" : depth === 1 ? "pl-3" : "pl-7";
  return (
    <div className={`flex items-center gap-0.5 ${pad}`}>
      {onToggle ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className="w-5 h-5 shrink-0 rounded text-[10px] flex items-center justify-center"
          style={{ color: "#64748b" }}
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▾" : "▸"}
        </button>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      <button
        type="button"
        onClick={onClick}
        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors"
        style={{
          background: active ? "rgba(245,158,11,0.14)" : "transparent",
          color: active ? "#fbbf24" : "#cbd5e1",
          border: active ? "1px solid rgba(245,158,11,0.35)" : "1px solid transparent",
          fontFamily: "var(--font-archivo), sans-serif",
          fontWeight: active ? 600 : 500,
        }}
      >
        {accent ? (
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ background: accent }}
          />
        ) : null}
        <span className="truncate">{label}</span>
        <CountBadge n={count} />
      </button>
    </div>
  );
}

export default function FolderRail({ path, onSelect, counts, formatLabels }: Props) {
  const activeKey = folderPathKey(path);

  const [expandedProducts, setExpandedProducts] = useState<Set<ProductFolderKey>>(() => {
    const open = new Set<ProductFolderKey>();
    if (path.kind === "product") open.add(path.product);
    return open;
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (path.kind !== "product") return;
    setExpandedProducts((prev) => {
      if (prev.has(path.product)) return prev;
      const next = new Set(prev);
      next.add(path.product);
      return next;
    });
  }, [path]);

  function toggleProduct(product: ProductFolderKey) {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(product)) next.delete(product);
      else next.add(product);
      return next;
    });
  }

  function select(next: FolderPath) {
    onSelect(next);
    setMobileOpen(false);
  }

  const tree = (
    <nav className="space-y-4" aria-label="Ad library folders">
      <div>
        <p
          className="px-3 mb-1.5 text-[9px] uppercase tracking-[0.18em]"
          style={{ color: "#64748b", fontFamily: "var(--font-archivo), sans-serif", fontWeight: 600 }}
        >
          Smart
        </p>
        <div className="space-y-0.5">
          {SMART_IDS.map((id) => {
            const next: FolderPath = { kind: "smart", id };
            return (
              <Row
                key={id}
                label={SMART_FOLDER_LABELS[id]}
                count={counts.smart[id]}
                active={activeKey === folderPathKey(next)}
                depth={0}
                onClick={() => select(next)}
                accent={
                  id === "ready"
                    ? "#a78bfa"
                    : id === "winners"
                      ? "#34d399"
                      : id === "needs"
                        ? "#fbbf24"
                        : undefined
                }
              />
            );
          })}
        </div>
      </div>

      <div>
        <p
          className="px-3 mb-1.5 text-[9px] uppercase tracking-[0.18em]"
          style={{ color: "#64748b", fontFamily: "var(--font-archivo), sans-serif", fontWeight: 600 }}
        >
          Products
        </p>
        <div className="space-y-0.5">
          {counts.products.map((node) => {
            const productPath: FolderPath = { kind: "product", product: node.product };
            const productActive =
              path.kind === "product" &&
              path.product === node.product &&
              path.format === undefined;
            const expanded = expandedProducts.has(node.product);
            return (
              <div key={node.product}>
                <Row
                  label={PRODUCT_FOLDER_LABELS[node.product]}
                  count={node.count}
                  active={productActive}
                  depth={1}
                  onClick={() => select(productPath)}
                  expanded={expanded}
                  onToggle={() => toggleProduct(node.product)}
                  accent={
                    node.product === "reverse"
                      ? "#38bdf8"
                      : node.product === "dscr"
                        ? "#fbbf24"
                        : node.product === "broad_forward"
                          ? "#a78bfa"
                          : "#94a3b8"
                  }
                />
                {expanded
                  ? node.formats.map((f) => {
                      const formatPath: FolderPath = {
                        kind: "product",
                        product: node.product,
                        format: f.format,
                      };
                      return (
                        <Row
                          key={`${node.product}:${f.format}`}
                          label={
                            f.format === "unassigned"
                              ? "Unassigned format"
                              : formatLabels[f.format] ?? f.format
                          }
                          count={f.count}
                          active={activeKey === folderPathKey(formatPath)}
                          depth={2}
                          onClick={() => select(formatPath)}
                        />
                      );
                    })
                  : null}
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );

  return (
    <>
      {/* Mobile disclosure */}
      <div className="lg:hidden mb-3">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold"
          style={{
            background: "linear-gradient(180deg, #0c182c 0%, #08111e 100%)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "#e2e8f0",
          }}
        >
          <span>Browse folders</span>
          <span style={{ color: "#64748b" }}>{mobileOpen ? "Hide" : "Show"}</span>
        </button>
        {mobileOpen ? (
          <div
            className="mt-2 rounded-xl p-2 max-h-[50vh] overflow-y-auto"
            style={{
              background: "linear-gradient(180deg, #0c182c 0%, #08111e 100%)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {tree}
          </div>
        ) : null}
      </div>

      {/* Desktop rail */}
      <aside
        className="hidden lg:block w-[220px] shrink-0 rounded-xl p-2 sticky top-2 self-start max-h-[calc(100vh-8rem)] overflow-y-auto"
        style={{
          background: "linear-gradient(180deg, #0c182c 0%, #08111e 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {tree}
      </aside>
    </>
  );
}
