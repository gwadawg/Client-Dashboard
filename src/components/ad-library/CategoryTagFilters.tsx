"use client";

import { useMemo, useState } from "react";
import {
  categoriesForProduct,
  isAdTagProduct,
  type AdTagProduct,
} from "@/lib/ad-tag-categories";
import type { AdTag } from "@/lib/ad-tags";

export type CategoryFilterMap = Record<string, string[]>;

type Props = {
  product: string | null | undefined;
  catalog: AdTag[];
  value: CategoryFilterMap;
  onChange: (next: CategoryFilterMap) => void;
  /** When product is "all", optionally show categories for these products. */
  productsInView?: AdTagProduct[];
};

export function adMatchesCategoryFilters(
  tags: { id: string; category: string }[] | undefined,
  selectedByCategory: CategoryFilterMap,
): boolean {
  const list = tags ?? [];
  for (const [category, ids] of Object.entries(selectedByCategory)) {
    if (!ids.length) continue;
    const hit = list.some((t) => t.category === category && ids.includes(t.id));
    if (!hit) return false;
  }
  return true;
}

export function flattenCategoryFilterIds(selected: CategoryFilterMap): string[] {
  const ids: string[] = [];
  for (const list of Object.values(selected)) {
    for (const id of list) {
      if (!ids.includes(id)) ids.push(id);
    }
  }
  return ids;
}

export default function CategoryTagFilters({
  product,
  catalog,
  value,
  onChange,
  productsInView,
}: Props) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    if (product && isAdTagProduct(product)) {
      return categoriesForProduct(product);
    }
    if (product === "all" || !product) {
      const products = productsInView?.length
        ? productsInView
        : (["dscr", "reverse"] as AdTagProduct[]);
      const seen = new Map<string, { key: string; label: string; sort_order: number }>();
      for (const p of products) {
        for (const c of categoriesForProduct(p)) {
          if (!seen.has(c.key)) seen.set(c.key, c);
        }
      }
      return [...seen.values()].sort((a, b) => a.sort_order - b.sort_order);
    }
    return [];
  }, [product, productsInView]);

  if (!product || product === "all") {
    return (
      <p className="text-[11px]" style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}>
        Pick a product to filter by tags.
      </p>
    );
  }

  if (categories.length === 0) return null;

  function toggle(category: string, id: string) {
    const current = value[category] ?? [];
    const next = current.includes(id)
      ? current.filter((x) => x !== id)
      : [...current, id];
    onChange({ ...value, [category]: next });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {categories.map((cat) => {
        const catTags = catalog.filter(
          (t) => t.is_active && t.category === cat.key && (!isAdTagProduct(product) || t.product === product),
        );
        const selectedIds = value[cat.key] ?? [];
        const selectedLabels = catTags
          .filter((t) => selectedIds.includes(t.id))
          .map((t) => t.label);
        const isOpen = openCategory === cat.key;
        const summary =
          selectedLabels.length === 0
            ? "Any"
            : selectedLabels.length <= 2
              ? selectedLabels.join(", ")
              : `${selectedLabels.length} selected`;

        return (
          <div key={cat.key} className="relative">
            <button
              type="button"
              onClick={() => setOpenCategory(isOpen ? null : cat.key)}
              className="px-2.5 py-1.5 rounded-md text-[11px] flex items-center gap-1.5"
              style={{
                fontFamily: "var(--font-plex-mono)",
                background:
                  selectedIds.length > 0
                    ? "rgba(52,211,153,0.12)"
                    : "rgba(255,255,255,0.03)",
                color: selectedIds.length > 0 ? "#6ee7b7" : "#94a3b8",
                border:
                  selectedIds.length > 0
                    ? "1px solid rgba(52,211,153,0.4)"
                    : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <span className="uppercase tracking-wider text-[10px] opacity-70">
                {cat.label}
              </span>
              <span>{summary}</span>
            </button>
            {isOpen ? (
              <div
                className="absolute z-20 mt-1 min-w-[12rem] max-w-[18rem] p-2 rounded-md shadow-lg space-y-1"
                style={{
                  background: "#0f172a",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {catTags.length === 0 ? (
                  <p className="text-[11px] px-1" style={{ color: "#64748b" }}>
                    No tags
                  </p>
                ) : (
                  catTags.map((t) => {
                    const on = selectedIds.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(cat.key, t.id)}
                        className="w-full text-left px-2 py-1 rounded text-[11px]"
                        style={{
                          fontFamily: "var(--font-plex-mono)",
                          background: on ? "rgba(52,211,153,0.15)" : "transparent",
                          color: on ? "#6ee7b7" : "#cbd5e1",
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })
                )}
                {selectedIds.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => onChange({ ...value, [cat.key]: [] })}
                    className="w-full text-left px-2 py-1 text-[10px] uppercase tracking-wider"
                    style={{ color: "#64748b" }}
                  >
                    Clear
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
