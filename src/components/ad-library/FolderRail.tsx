"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

/** A dot means the folder is defined by a state, coloured as that state. */
const SMART_DOT: Partial<Record<SmartFolderId, string>> = {
  ready: "#a78bfa",
  winners: "var(--color-ws-positive)",
  needs: "var(--color-ws-text-dim)",
};

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ws-accent)] focus-visible:ring-offset-1 focus-visible:ring-offset-[color:var(--color-ws-panel)]";

type Props = {
  path: FolderPath;
  onSelect: (path: FolderPath) => void;
  counts: FolderTreeCounts;
  formatLabels: Record<string, string>;
};

/**
 * Rows are flattened in visual order so arrow keys can walk the tree by index
 * regardless of which products happen to be expanded.
 */
type RailRow = {
  key: string;
  label: string;
  count: number;
  depth: 0 | 1 | 2;
  path: FolderPath;
  dot?: string;
  /** Set on product rows, which own a disclosure triangle. */
  product?: ProductFolderKey;
  expanded?: boolean;
  /** Where Left arrow goes from a leaf. */
  parentKey?: string;
};

function CountBadge({ n }: { n: number }) {
  return (
    <span
      className="ml-auto tabular-nums text-[10px] font-semibold shrink-0"
      style={{ color: "var(--color-ws-text-muted)", fontFamily: "var(--font-data)" }}
    >
      {n}
    </span>
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
  const [focusKey, setFocusKey] = useState<string | null>(null);

  useEffect(() => {
    if (path.kind !== "product") return;
    setExpandedProducts((prev) => {
      if (prev.has(path.product)) return prev;
      const next = new Set(prev);
      next.add(path.product);
      return next;
    });
  }, [path]);

  const toggleProduct = useCallback((product: ProductFolderKey) => {
    setExpandedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(product)) next.delete(product);
      else next.add(product);
      return next;
    });
  }, []);

  const select = useCallback(
    (next: FolderPath) => {
      onSelect(next);
      setMobileOpen(false);
    },
    [onSelect],
  );

  const smartRows = useMemo<RailRow[]>(
    () =>
      SMART_IDS.map((id) => {
        const next: FolderPath = { kind: "smart", id };
        return {
          key: folderPathKey(next),
          label: SMART_FOLDER_LABELS[id],
          count: counts.smart[id],
          depth: 0 as const,
          path: next,
          dot: SMART_DOT[id],
        };
      }),
    [counts.smart],
  );

  const productRows = useMemo<RailRow[]>(() => {
    const rows: RailRow[] = [];
    for (const node of counts.products) {
      const productPath: FolderPath = { kind: "product", product: node.product };
      const productKey = folderPathKey(productPath);
      const expanded = expandedProducts.has(node.product);
      rows.push({
        key: productKey,
        label: PRODUCT_FOLDER_LABELS[node.product],
        count: node.count,
        depth: 1,
        path: productPath,
        product: node.product,
        expanded,
      });
      if (!expanded) continue;
      for (const f of node.formats) {
        const formatPath: FolderPath = {
          kind: "product",
          product: node.product,
          format: f.format,
        };
        rows.push({
          key: folderPathKey(formatPath),
          label:
            f.format === "unassigned" ? "Unassigned format" : formatLabels[f.format] ?? f.format,
          count: f.count,
          depth: 2,
          path: formatPath,
          parentKey: productKey,
        });
      }
    }
    return rows;
  }, [counts.products, expandedProducts, formatLabels]);

  const rows = useMemo(() => [...smartRows, ...productRows], [smartRows, productRows]);

  // Tab lands on the active folder, so the rail resumes where you left it.
  const rovingKey =
    focusKey && rows.some((r) => r.key === focusKey)
      ? focusKey
      : rows.some((r) => r.key === activeKey)
        ? activeKey
        : rows[0]?.key;

  // The tree renders twice (mobile disclosure + desktop rail), so resolve the
  // target within the nav the keystroke came from rather than a shared ref map.
  const focusRow = useCallback((from: HTMLElement, key: string | undefined) => {
    if (!key) return;
    setFocusKey(key);
    const scope = from.closest("nav");
    const rows = scope?.querySelectorAll<HTMLButtonElement>("[data-row-key]");
    for (const el of rows ?? []) {
      if (el.dataset.rowKey === key) {
        el.focus();
        return;
      }
    }
  }, []);

  const onRowKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>, row: RailRow) => {
      const i = rows.findIndex((r) => r.key === row.key);
      if (i < 0) return;
      const from = e.currentTarget;
      const focusAt = (key: string | undefined) => focusRow(from, key);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          focusAt(rows[Math.min(i + 1, rows.length - 1)]?.key);
          break;
        case "ArrowUp":
          e.preventDefault();
          focusAt(rows[Math.max(i - 1, 0)]?.key);
          break;
        case "Home":
          e.preventDefault();
          focusAt(rows[0]?.key);
          break;
        case "End":
          e.preventDefault();
          focusAt(rows[rows.length - 1]?.key);
          break;
        case "ArrowRight":
          if (!row.product) break;
          e.preventDefault();
          // Expand first; a second Right steps into the formats now rendered.
          if (!row.expanded) toggleProduct(row.product);
          else focusAt(rows[i + 1]?.key);
          break;
        case "ArrowLeft":
          e.preventDefault();
          if (row.product && row.expanded) toggleProduct(row.product);
          else if (row.parentKey) focusAt(row.parentKey);
          break;
        default:
          break;
      }
    },
    [rows, focusRow, toggleProduct],
  );

  function renderRow(row: RailRow) {
    const active = activeKey === row.key;
    const pad = row.depth === 0 ? "pl-2" : row.depth === 1 ? "pl-3" : "pl-7";
    return (
      <div key={row.key} className={`flex items-center gap-0.5 ${pad}`}>
        {row.product ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              toggleProduct(row.product!);
            }}
            className={`w-5 h-5 shrink-0 rounded text-[10px] flex items-center justify-center ${FOCUS_RING}`}
            style={{ color: "var(--color-ws-text-dim)" }}
            aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.label}`}
          >
            {row.expanded ? "▾" : "▸"}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <button
          type="button"
          data-row-key={row.key}
          tabIndex={rovingKey === row.key ? 0 : -1}
          aria-current={active ? "page" : undefined}
          aria-expanded={row.product ? row.expanded : undefined}
          onFocus={() => setFocusKey(row.key)}
          onKeyDown={(e) => onRowKeyDown(e, row)}
          onClick={() => select(row.path)}
          className={`flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${FOCUS_RING}`}
          style={{
            background: active ? "var(--color-ws-accent-wash)" : "transparent",
            color: active ? "var(--color-ws-accent-bright)" : "#cbd5e1",
            border: active
              ? "1px solid rgba(245,158,11,0.35)"
              : "1px solid transparent",
            fontFamily: "var(--font-display), sans-serif",
            fontWeight: active ? 600 : 500,
          }}
        >
          {row.dot ? (
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: row.dot }} />
          ) : null}
          <span className="truncate">{row.label}</span>
          <CountBadge n={row.count} />
        </button>
      </div>
    );
  }

  const tree = (
    <nav className="space-y-4" aria-label="Ad library folders">
      <div>
        <p
          className="px-3 mb-1.5 text-[9px] uppercase tracking-[0.18em]"
          style={{
            color: "var(--color-ws-text-dim)",
            fontFamily: "var(--font-display), sans-serif",
            fontWeight: 600,
          }}
        >
          Smart
        </p>
        <div className="space-y-0.5">{smartRows.map(renderRow)}</div>
      </div>

      <div>
        <p
          className="px-3 mb-1.5 text-[9px] uppercase tracking-[0.18em]"
          style={{
            color: "var(--color-ws-text-dim)",
            fontFamily: "var(--font-display), sans-serif",
            fontWeight: 600,
          }}
        >
          Products
        </p>
        <div className="space-y-0.5">{productRows.map(renderRow)}</div>
      </div>
    </nav>
  );

  const surface = {
    background: "linear-gradient(180deg, var(--color-ws-panel) 0%, var(--color-ws-base) 100%)",
    border: "1px solid var(--color-ws-hairline)",
  };

  return (
    <>
      {/* Mobile disclosure */}
      <div className="lg:hidden mb-3">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold ${FOCUS_RING}`}
          style={{ ...surface, color: "var(--color-ws-text)" }}
        >
          <span>Browse folders</span>
          <span style={{ color: "var(--color-ws-text-dim)" }}>{mobileOpen ? "Hide" : "Show"}</span>
        </button>
        {mobileOpen ? (
          <div className="mt-2 rounded-xl p-2 max-h-[50vh] overflow-y-auto" style={surface}>
            {tree}
          </div>
        ) : null}
      </div>

      {/* Desktop rail */}
      <aside
        className="hidden lg:block w-[220px] shrink-0 rounded-xl p-2 sticky top-2 self-start max-h-[calc(100vh-8rem)] overflow-y-auto"
        style={surface}
      >
        {tree}
      </aside>
    </>
  );
}
