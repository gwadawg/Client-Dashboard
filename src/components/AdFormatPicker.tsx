"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adFormatLabelMap, type AdFormat } from "@/lib/ad-formats";

export function useAdFormats() {
  const [formats, setFormats] = useState<AdFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    return fetch("/api/ad-formats")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load formats");
        return r.json() as Promise<AdFormat[]>;
      })
      .then((data) => {
        setFormats(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const labels = useMemo(() => adFormatLabelMap(formats), [formats]);
  const active = useMemo(() => formats.filter((f) => f.is_active), [formats]);

  const createFormat = useCallback(async (label: string): Promise<AdFormat> => {
    const res = await fetch("/api/ad-formats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to add format");
    const created = data as AdFormat;
    setFormats((prev) => {
      if (prev.some((f) => f.slug === created.slug)) return prev;
      return [...prev, created].sort(
        (a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label),
      );
    });
    return created;
  }, []);

  return { formats, active, labels, loading, error, reload, createFormat };
}

type PickerProps = {
  value: string;
  onChange: (slug: string) => void;
  formats: AdFormat[];
  onCreate: (label: string) => Promise<AdFormat>;
  loading?: boolean;
};

export function AdFormatPicker({ value, onChange, formats, onCreate, loading }: PickerProps) {
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const active = formats.filter((f) => f.is_active);

  async function stampNew() {
    const label = draft.trim();
    if (!label || saving) return;
    setSaving(true);
    setLocalError(null);
    try {
      const created = await onCreate(label);
      onChange(created.slug);
      setDraft("");
      setComposing(false);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : "Could not add format");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange("")}
          className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
          style={{
            fontFamily: "var(--font-plex-mono)",
            background: value === "" ? "rgba(148,163,184,0.18)" : "rgba(255,255,255,0.03)",
            color: value === "" ? "#cbd5e1" : "#64748b",
            border: value === "" ? "1px solid rgba(148,163,184,0.45)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          None
        </button>
        {active.map((f) => {
          const selected = value === f.slug;
          return (
            <button
              key={f.slug}
              type="button"
              onClick={() => onChange(f.slug)}
              className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
              style={{
                fontFamily: "var(--font-plex-mono)",
                background: selected ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.03)",
                color: selected ? "#93c5fd" : "#94a3b8",
                border: selected ? "1px solid rgba(96,165,250,0.55)" : "1px solid rgba(255,255,255,0.08)",
                boxShadow: selected ? "inset 0 0 0 1px rgba(96,165,250,0.15)" : "none",
              }}
            >
              {f.label}
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
              placeholder="New format"
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
          Formats are shared across client ads, acquisition, and knowledge capture.
        </p>
      )}
    </div>
  );
}
