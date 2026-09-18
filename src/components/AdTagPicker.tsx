"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  categoriesForProduct,
  isAdTagProduct,
  type AdTagProduct,
} from "@/lib/ad-tag-categories";
import { adTagLabelMap, type AdTag } from "@/lib/ad-tags";

export function useAdTags(product?: string | null) {
  const [tags, setTags] = useState<AdTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    const qs =
      product && isAdTagProduct(product)
        ? `?product=${encodeURIComponent(product)}`
        : "";
    return fetch(`/api/ad-tags${qs}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load tags");
        return r.json() as Promise<AdTag[]>;
      })
      .then((data) => {
        setTags(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [product]);

  useEffect(() => {
    if (product && !isAdTagProduct(product)) {
      setTags([]);
      setLoading(false);
      setError(null);
      return;
    }
    reload();
  }, [product, reload]);

  const labels = useMemo(() => adTagLabelMap(tags), [tags]);
  const active = useMemo(() => tags.filter((t) => t.is_active), [tags]);

  const createTag = useCallback(
    async (input: { label: string; category: string }): Promise<AdTag> => {
      if (!product || !isAdTagProduct(product)) {
        throw new Error("Pick a product before adding tags");
      }
      const res = await fetch("/api/ad-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: input.label,
          product,
          category: input.category,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add tag");
      const created = data as AdTag;
      setTags((prev) => {
        if (prev.some((t) => t.id === created.id)) return prev;
        return [...prev, created].sort(
          (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
        );
      });
      return created;
    },
    [product],
  );

  return { tags, active, labels, loading, error, reload, createTag };
}

type PickerProps = {
  product: string;
  value: string[];
  onChange: (ids: string[]) => void;
  tags: AdTag[];
  onCreate?: (input: { label: string; category: string }) => Promise<AdTag>;
  loading?: boolean;
};

export function AdTagPicker({
  product,
  value,
  onChange,
  tags,
  onCreate,
  loading,
}: PickerProps) {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [composingCategory, setComposingCategory] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const productKey: AdTagProduct | null = isAdTagProduct(product) ? product : null;
  const categories = productKey ? categoriesForProduct(productKey) : [];
  const selected = new Set(value);
  const active = tags.filter((t) => t.is_active);

  function toggle(id: string) {
    onChange(selected.has(id) ? value.filter((x) => x !== id) : [...value, id]);
  }

  async function stampNew(category: string) {
    const label = draft.trim();
    if (!label || saving || !onCreate) return;
    setSaving(true);
    setLocalError(null);
    try {
      const created = await onCreate({ label, category });
      if (!selected.has(created.id)) onChange([...value, created.id]);
      setDraft("");
      setComposingCategory(null);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not add tag");
    } finally {
      setSaving(false);
    }
  }

  if (!productKey) {
    return (
      <p className="text-[11px]" style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}>
        Select a product to show category tags.
      </p>
    );
  }

  if (categories.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}>
        No tag catalog for this product yet.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {categories.map((cat) => {
        const catTags = active.filter((t) => t.category === cat.key);
        const selectedLabels = catTags
          .filter((t) => selected.has(t.id))
          .map((t) => t.label);
        const isOpen = openCategory === cat.key;
        const summary =
          selectedLabels.length > 0 ? selectedLabels.join(", ") : "None";

        return (
          <div
            key={cat.key}
            className="rounded-md overflow-hidden"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <button
              type="button"
              onClick={() => setOpenCategory(isOpen ? null : cat.key)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
              style={{ background: "rgba(255,255,255,0.02)" }}
            >
              <span
                className="text-[11px] font-semibold uppercase tracking-wider"
                style={{ color: "#94a3b8", fontFamily: "var(--font-plex-mono)" }}
              >
                {cat.label}
              </span>
              <span
                className="text-[11px] truncate max-w-[60%]"
                style={{ color: selectedLabels.length ? "#e2e8f0" : "#64748b" }}
                title={summary}
              >
                {summary}
              </span>
            </button>
            {isOpen ? (
              <div className="px-3 py-2 space-y-2" style={{ background: "rgba(0,0,0,0.2)" }}>
                {loading && catTags.length === 0 ? (
                  <span className="text-[11px]" style={{ color: "#64748b" }}>
                    Loading…
                  </span>
                ) : null}
                <div className="flex flex-wrap gap-1.5">
                  {catTags.map((t) => {
                    const isOn = selected.has(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggle(t.id)}
                        className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
                        style={{
                          fontFamily: "var(--font-plex-mono)",
                          background: isOn
                            ? "rgba(52,211,153,0.16)"
                            : "rgba(255,255,255,0.03)",
                          color: isOn ? "#6ee7b7" : "#94a3b8",
                          border: isOn
                            ? "1px solid rgba(52,211,153,0.55)"
                            : "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                  {catTags.length === 0 && !loading ? (
                    <span className="text-[11px]" style={{ color: "#64748b" }}>
                      No tags in this category yet.
                    </span>
                  ) : null}
                </div>
                {onCreate ? (
                  composingCategory === cat.key ? (
                    <div className="flex items-center gap-1">
                      <input
                        autoFocus
                        value={draft}
                        onChange={(e) => {
                          setDraft(e.target.value);
                          setLocalError(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            stampNew(cat.key);
                          }
                          if (e.key === "Escape") {
                            setComposingCategory(null);
                            setDraft("");
                          }
                        }}
                        placeholder="New tag"
                        className="flex-1 bg-transparent px-2 py-1 text-[11px] outline-none rounded-md"
                        style={{
                          fontFamily: "var(--font-plex-mono)",
                          color: "#fde68a",
                          border: "1px dashed rgba(245,158,11,0.45)",
                        }}
                      />
                      <button
                        type="button"
                        disabled={saving || !draft.trim()}
                        onClick={() => stampNew(cat.key)}
                        className="px-2 py-1 rounded text-[10px] font-semibold"
                        style={{
                          background: "#f59e0b",
                          color: "#0a1424",
                          opacity: saving || !draft.trim() ? 0.5 : 1,
                        }}
                      >
                        {saving ? "…" : "+"}
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setComposingCategory(cat.key);
                        setDraft("");
                      }}
                      className="px-2 py-1 rounded-md text-[11px]"
                      style={{
                        fontFamily: "var(--font-plex-mono)",
                        color: "#fbbf24",
                        border: "1px dashed rgba(245,158,11,0.4)",
                      }}
                    >
                      + Add in {cat.label}
                    </button>
                  )
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
      {localError ? (
        <p className="text-[11px]" style={{ color: "#f87171" }}>
          {localError}
        </p>
      ) : (
        <p className="text-[10px]" style={{ color: "#475569" }}>
          Multi-select within each category. Tags are scoped to this product.
        </p>
      )}
    </div>
  );
}
