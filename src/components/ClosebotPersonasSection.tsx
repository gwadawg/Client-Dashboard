"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClosebotPersona } from "@/lib/closebot";
import ModalCloseButton from "@/components/ModalCloseButton";

const inputStyle: React.CSSProperties = {
  background: "#050c18",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.625rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

type Props = {
  canManage: boolean;
  onPersonasChanged?: () => void;
};

type FormState = {
  name: string;
  description: string;
  how_to_respond: string;
  tone: string[];
  toneDraft: string;
  custom_delay_enabled: boolean;
  typo_frequency: string;
  custom_delay_seconds: string;
};

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    how_to_respond: "",
    tone: [],
    toneDraft: "",
    custom_delay_enabled: false,
    typo_frequency: "",
    custom_delay_seconds: "",
  };
}

function formFromPersona(p: ClosebotPersona): FormState {
  return {
    name: p.name,
    description: p.description ?? "",
    how_to_respond: p.how_to_respond ?? "",
    tone: p.tone ?? [],
    toneDraft: "",
    custom_delay_enabled: Boolean(p.custom_delay_enabled),
    typo_frequency: p.typo_frequency == null ? "" : String(p.typo_frequency),
    custom_delay_seconds: p.custom_delay_seconds == null ? "" : String(p.custom_delay_seconds),
  };
}

export default function ClosebotPersonasSection({ canManage, onPersonasChanged }: Props) {
  const [personas, setPersonas] = useState<ClosebotPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClosebotPersona | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/closebot/personas");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load personas");
        setPersonas([]);
        return;
      }
      const data = await res.json();
      setPersonas(Array.isArray(data) ? data : []);
    } catch {
      setError("Failed to load personas");
      setPersonas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(p: ClosebotPersona) {
    setEditing(p);
    setForm(formFromPersona(p));
    setFormError(null);
    setModalOpen(true);
  }

  function addTone() {
    const t = form.toneDraft.trim();
    if (!t) return;
    if (form.tone.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setForm((f) => ({ ...f, toneDraft: "" }));
      return;
    }
    setForm((f) => ({ ...f, tone: [...f.tone, t], toneDraft: "" }));
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        how_to_respond: form.how_to_respond.trim() || null,
        tone: form.tone,
        custom_delay_enabled: form.custom_delay_enabled,
        typo_frequency: form.typo_frequency.trim() === "" ? null : Number(form.typo_frequency),
        custom_delay_seconds: form.custom_delay_seconds.trim() === ""
          ? null
          : Number(form.custom_delay_seconds),
      };
      const res = await fetch(
        editing ? `/api/closebot/personas/${editing.id}` : "/api/closebot/personas",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || "Could not save persona");
        return;
      }
      setModalOpen(false);
      await load();
      onPersonasChanged?.();
    } catch {
      setFormError("Could not save persona");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: ClosebotPersona) {
    try {
      const res = await fetch(`/api/closebot/personas/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !p.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not update persona");
        return;
      }
      await load();
      onPersonasChanged?.();
    } catch {
      setError("Could not update persona");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
            Personas
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
            Reusable Closebot personas agents can select.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: "#f59e0b", color: "#1a1206" }}
          >
            Add persona
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm py-8" style={{ color: "#64748b" }}>
          Loading personas…
        </p>
      ) : personas.length === 0 ? (
        <div
          className="rounded-xl px-6 py-10 text-center"
          style={{ border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
            No personas yet
          </p>
          <p className="text-xs mt-1" style={{ color: "#64748b" }}>
            {canManage ? "Add a persona, then attach it when you create an agent." : "Ask an ops lead to add personas."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {personas.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm" style={{ color: "#e2e8f0" }}>
                    {p.name}
                  </span>
                  {!p.is_active && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(100,116,139,0.25)", color: "#94a3b8" }}
                    >
                      Archived
                    </span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    {p.description}
                  </p>
                )}
                {(p.tone?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {p.tone.map((t) => (
                      <span
                        key={t}
                        className="text-[10px] px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(251,191,36,0.12)",
                          color: "#fbbf24",
                          border: "1px solid rgba(251,191,36,0.25)",
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => openEdit(p)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                    style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleActive(p)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                    style={{
                      color: p.is_active ? "#fbbf24" : "#34d399",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                  >
                    {p.is_active ? "Archive" : "Reactivate"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.65)" }}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-5 space-y-3 my-8"
            style={{ background: "#0c1829", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
                {editing ? "Edit persona" : "Add persona"}
              </h4>
              <ModalCloseButton onClose={() => setModalOpen(false)} disabled={saving} />
            </div>
            <label className="block space-y-1">
              <span style={labelStyle}>Persona name</span>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                autoFocus
              />
            </label>
            <label className="block space-y-1">
              <span style={labelStyle}>Persona description</span>
              <textarea
                style={{ ...inputStyle, minHeight: "3.5rem", resize: "vertical" }}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span style={labelStyle}>How to respond</span>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: "8rem",
                  resize: "vertical",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                }}
                value={form.how_to_respond}
                onChange={(e) => setForm((f) => ({ ...f, how_to_respond: e.target.value }))}
                placeholder="The respond prompt"
              />
            </label>
            <div className="space-y-1">
              <span style={labelStyle}>Tone</span>
              <div className="flex flex-wrap gap-1 mb-2">
                {form.tone.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="text-[11px] px-2 py-0.5 rounded-full"
                    style={{
                      background: "rgba(251,191,36,0.15)",
                      color: "#fbbf24",
                      border: "1px solid rgba(251,191,36,0.3)",
                    }}
                    onClick={() =>
                      setForm((f) => ({ ...f, tone: f.tone.filter((x) => x !== t) }))
                    }
                  >
                    {t} ×
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  style={inputStyle}
                  value={form.toneDraft}
                  placeholder="Add a chip and press Enter"
                  onChange={(e) => setForm((f) => ({ ...f, toneDraft: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTone();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addTone}
                  className="text-xs font-semibold px-3 rounded-lg shrink-0"
                  style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
                >
                  Add
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm" style={{ color: "#cbd5e1" }}>
              <input
                type="checkbox"
                checked={form.custom_delay_enabled}
                onChange={(e) =>
                  setForm((f) => ({ ...f, custom_delay_enabled: e.target.checked }))
                }
              />
              Custom delay
            </label>
            <label className="block space-y-1">
              <span style={labelStyle}>Frequency typos (0–100)</span>
              <input
                style={inputStyle}
                type="number"
                min={0}
                max={100}
                step="any"
                value={form.typo_frequency}
                onChange={(e) => setForm((f) => ({ ...f, typo_frequency: e.target.value }))}
              />
            </label>
            <label className="block space-y-1">
              <span style={labelStyle}>Custom delay (seconds)</span>
              <input
                style={inputStyle}
                type="number"
                min={0}
                disabled={!form.custom_delay_enabled}
                value={form.custom_delay_seconds}
                onChange={(e) =>
                  setForm((f) => ({ ...f, custom_delay_seconds: e.target.value }))
                }
              />
            </label>
            {formError && (
              <p className="text-xs" style={{ color: "#f87171" }}>
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="text-sm px-3 py-2 rounded-lg"
                style={{ color: "#94a3b8" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !form.name.trim()}
                onClick={() => void handleSave()}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "#f59e0b", color: "#1a1206" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
