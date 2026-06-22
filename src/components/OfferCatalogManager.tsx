"use client";

import { useEffect, useState } from "react";
import type { OfferCatalogRow } from "@/lib/offer-catalog";

const inputStyle = {
  background: "#0a1628",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
} as React.CSSProperties;

type EditDraft = {
  label: string;
  short_label: string;
  description: string;
  ghl_aliases: string;
  applies_to: string;
  is_downsell: boolean;
  is_active: boolean;
  sort_order: string;
};

function rowToDraft(row: OfferCatalogRow): EditDraft {
  return {
    label: row.label,
    short_label: row.short_label ?? "",
    description: row.description ?? "",
    ghl_aliases: row.ghl_aliases.join(", "),
    applies_to: row.applies_to.join(", "),
    is_downsell: row.is_downsell,
    is_active: row.is_active,
    sort_order: String(row.sort_order),
  };
}

function CatalogSection({
  title,
  rows,
  onSave,
  saving,
}: {
  title: string;
  rows: OfferCatalogRow[];
  onSave: (id: string, patch: Record<string, unknown>) => Promise<void>;
  saving: string | null;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<EditDraft | null>(null);

  function startEdit(row: OfferCatalogRow) {
    setEditingId(row.id);
    setDraft(rowToDraft(row));
  }

  async function saveEdit(id: string) {
    if (!draft) return;
    await onSave(id, {
      label: draft.label.trim(),
      short_label: draft.short_label.trim() || null,
      description: draft.description.trim() || null,
      ghl_aliases: draft.ghl_aliases.split(",").map(s => s.trim()).filter(Boolean),
      applies_to: draft.applies_to.split(",").map(s => s.trim()).filter(Boolean),
      is_downsell: draft.is_downsell,
      is_active: draft.is_active,
      sort_order: Number(draft.sort_order) || 0,
    });
    setEditingId(null);
    setDraft(null);
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>
        {title}
      </h2>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#0f2040", color: "#64748b" }}>
              <th className="text-left px-3 py-2 font-medium">Code</th>
              <th className="text-left px-3 py-2 font-medium">Label</th>
              <th className="text-left px-3 py-2 font-medium">GHL aliases</th>
              <th className="text-left px-3 py-2 font-medium">Status</th>
              <th className="text-right px-3 py-2 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const editing = editingId === row.id && draft;
              return (
                <tr key={row.id} style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <td className="px-3 py-2 font-mono text-xs" style={{ color: "#94a3b8" }}>{row.code}</td>
                  <td className="px-3 py-2" style={{ color: "#e2e8f0" }}>
                    {editing ? (
                      <input
                        value={draft.label}
                        onChange={e => setDraft({ ...draft, label: e.target.value })}
                        style={inputStyle}
                      />
                    ) : (
                      row.label
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: "#94a3b8" }}>
                    {editing ? (
                      <input
                        value={draft.ghl_aliases}
                        onChange={e => setDraft({ ...draft, ghl_aliases: e.target.value })}
                        placeholder="comma-separated"
                        style={inputStyle}
                      />
                    ) : (
                      row.ghl_aliases.join(", ") || "—"
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {editing ? (
                      <label className="flex items-center gap-2 text-xs" style={{ color: "#94a3b8" }}>
                        <input
                          type="checkbox"
                          checked={draft.is_active}
                          onChange={e => setDraft({ ...draft, is_active: e.target.checked })}
                        />
                        Active
                      </label>
                    ) : (
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          color: row.is_active ? "#34d399" : "#64748b",
                          background: row.is_active ? "rgba(52,211,153,0.12)" : "rgba(100,116,139,0.12)",
                        }}
                      >
                        {row.is_active ? "Active" : "Inactive"}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {editing ? (
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => { setEditingId(null); setDraft(null); }}
                          className="text-xs px-2 py-1 rounded"
                          style={{ color: "#94a3b8" }}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={saving === row.id}
                          onClick={() => saveEdit(row.id)}
                          className="text-xs px-2 py-1 rounded font-medium"
                          style={{ background: "#1d4ed8", color: "#fff" }}
                        >
                          {saving === row.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        className="text-xs px-2 py-1 rounded"
                        style={{ color: "#38bdf8" }}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {editingId && draft && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "#64748b" }}>Extended edit</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs" style={{ color: "#94a3b8" }}>
              Short label
              <input
                value={draft.short_label}
                onChange={e => setDraft({ ...draft, short_label: e.target.value })}
                className="mt-1 block"
                style={inputStyle}
              />
            </label>
            <label className="block text-xs" style={{ color: "#94a3b8" }}>
              Sort order
              <input
                value={draft.sort_order}
                onChange={e => setDraft({ ...draft, sort_order: e.target.value })}
                className="mt-1 block"
                style={inputStyle}
              />
            </label>
          </div>
          <label className="block text-xs" style={{ color: "#94a3b8" }}>
            Description
            <textarea
              value={draft.description}
              onChange={e => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              className="mt-1 block resize-y"
              style={inputStyle}
            />
          </label>
          {rows.find(r => r.id === editingId)?.kind === "sales_package" && (
            <>
              <label className="block text-xs" style={{ color: "#94a3b8" }}>
                Applies to products (comma-separated codes)
                <input
                  value={draft.applies_to}
                  onChange={e => setDraft({ ...draft, applies_to: e.target.value })}
                  placeholder="RM, DSCR"
                  className="mt-1 block"
                  style={inputStyle}
                />
              </label>
              <label className="flex items-center gap-2 text-xs" style={{ color: "#94a3b8" }}>
                <input
                  type="checkbox"
                  checked={draft.is_downsell}
                  onChange={e => setDraft({ ...draft, is_downsell: e.target.checked })}
                />
                Downsell (excluded from core acquisition KPI scope)
              </label>
            </>
          )}
        </div>
      )}
    </section>
  );
}

export default function OfferCatalogManager() {
  const [catalog, setCatalog] = useState<OfferCatalogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/offer-catalog")
      .then(r => r.json())
      .then(d => {
        setCatalog(d.catalog ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function handleSave(id: string, patch: Record<string, unknown>) {
    setSaving(id);
    setError("");
    const res = await fetch("/api/offer-catalog", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...patch }),
    });
    const data = await res.json();
    setSaving(null);
    if (!res.ok) {
      setError(data.error ?? "Failed to save");
      return;
    }
    load();
  }

  const products = catalog.filter(r => r.kind === "product").sort((a, b) => a.sort_order - b.sort_order);
  const packages = catalog.filter(r => r.kind === "sales_package").sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="max-w-5xl mx-auto space-y-6 p-1">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "#e2e8f0" }}>Offer Catalog</h1>
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          Products (RM / DSCR / Call Center) and sales packages (Core Offer / Mid Offer / Skool).
          Codes are stable for reporting; edit labels and GHL webhook aliases here.
        </p>
      </div>

      {error && (
        <p className="text-sm px-3 py-2 rounded-lg" style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "#64748b" }}>Loading catalog…</p>
      ) : (
        <>
          <CatalogSection title="Products" rows={products} onSave={handleSave} saving={saving} />
          <CatalogSection title="Sales packages" rows={packages} onSave={handleSave} saving={saving} />
        </>
      )}
    </div>
  );
}
