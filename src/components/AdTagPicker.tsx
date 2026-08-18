"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adTagLabelMap, type AdTag } from "@/lib/ad-tags";

export function useAdTags() {
  const [tags, setTags] = useState<AdTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch("/api/ad-tags")
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
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const labels = useMemo(() => adTagLabelMap(tags), [tags]);
  const active = useMemo(() => tags.filter((t) => t.is_active), [tags]);

  const createTag = useCallback(async (label: string): Promise<AdTag> => {
    const res = await fetch("/api/ad-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to add tag");
    const created = data as AdTag;
    setTags((prev) => {
      if (prev.some((t) => t.slug === created.slug)) return prev;
      return [...prev, created].sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
      );
    });
    return created;
  }, []);

  return { tags, active, labels, loading, error, reload, createTag };
}

type PickerProps = {
  value: string[];
  onChange: (slugs: string[]) => void;
  tags: AdTag[];
  onCreate: (label: string) => Promise<AdTag>;
  loading?: boolean;
};

export function AdTagPicker({ value, onChange, tags, onCreate, loading }: PickerProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const active = tags.filter((t) => t.is_active);
  const selected = new Set(value);

  function toggle(slug: string) {
    onChange(selected.has(slug) ? value.filter((s) => s !== slug) : [...value, slug]);
  }

  async function stampNew() {
    const label = draft.trim();
    if (!label || saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      const created = await onCreate(label);
      if (!selected.has(created.slug)) onChange([...value, created.slug]);
      setDraft("");
      setComposing(false);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not add tag");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {active.map((t) => {
          const isOn = selected.has(t.slug);
          return (
            <button
              key={t.slug}
              type="button"
              onClick={() => toggle(t.slug)}
              className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
              style={{
                fontFamily: "var(--font-plex-mono)",
                background: isOn ? "rgba(52,211,153,0.16)" : "rgba(255,255,255,0.03)",
                color: isOn ? "#6ee7b7" : "#94a3b8",
                border: isOn ? "1px solid rgba(52,211,153,0.55)" : "1px solid rgba(255,255,255,0.08)",
                boxShadow: isOn ? "inset 0 0 0 1px rgba(52,211,153,0.12)" : "none",
              }}
            >
              {t.label}
            </button>
          );
        })}
        {loading && active.length === 0 ? (
          <span className="px-2 py-1 text-[11px]" style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}>
            Loading…
          </span>
        ) : null}
        {composing ? (
          <div
            className="flex items-center gap-1 pl-1 pr-0.5 py-0.5 rounded-md"
            style={{
              background: "rgba(245,158,11,0.08)",
              border: "1px dashed rgba(245,158,11,0.45)",
            }}
          >
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
                  stampNew();
                }
                if (e.key === "Escape") {
                  setComposing(false);
                  setDraft("");
                  setLocalError(null);
                }
              }}
              placeholder="New tag"
              className="w-[7.5rem] bg-transparent px-1.5 py-0.5 text-[11px] outline-none"
              style={{ fontFamily: "var(--font-plex-mono)", color: "#fde68a" }}
            />
            <button
              type="button"
              disabled={saving || !draft.trim()}
              onClick={stampNew}
              className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
              style={{
                background: "#f59e0b",
                color: "#0a1424",
                opacity: saving || !draft.trim() ? 0.5 : 1,
                fontFamily: "var(--font-plex-mono)",
              }}
            >
              {saving ? "…" : "+"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setComposing(true)}
            className="px-2.5 py-1 rounded-md text-[11px] tracking-wide"
            style={{
              fontFamily: "var(--font-plex-mono)",
              background: "transparent",
              color: "#fbbf24",
              border: "1px dashed rgba(245,158,11,0.4)",
            }}
          >
            + Add
          </button>
        )}
      </div>
      {localError ? (
        <p className="text-[11px]" style={{ color: "#f87171" }}>{localError}</p>
      ) : (
        <p className="text-[10px]" style={{ color: "#475569" }}>
          Tags describe what the ad is talking about. Add one if it isn’t listed — they stay available for later filters.
        </p>
      )}
    </div>
  );
}
