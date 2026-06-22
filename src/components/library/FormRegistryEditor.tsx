"use client";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

export type FormRegistryEditorState = {
  id: string | null;
  slug: string;
  title: string;
  description: string;
  href: string;
  audience: string;
  tags: string;
  sort_order: number;
};

export const EMPTY_FORM_REGISTRY: FormRegistryEditorState = {
  id: null,
  slug: "",
  title: "",
  description: "",
  href: "",
  audience: "",
  tags: "",
  sort_order: 0,
};

export type FormRegistryRow = {
  id: string;
  slug: string;
  title: string;
  description: string;
  href: string;
  audience: string;
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export function formRegistryRowToEditor(row: FormRegistryRow): FormRegistryEditorState {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    href: row.href,
    audience: row.audience,
    tags: (row.tags ?? []).join(", "),
    sort_order: row.sort_order,
  };
}

const inputStyle: React.CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#e2e8f0",
};

type Props = {
  state: FormRegistryEditorState;
  setState: React.Dispatch<React.SetStateAction<FormRegistryEditorState>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
};

export default function FormRegistryEditor({ state, setState, saving, error, onClose, onSave }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(3,7,15,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-[1.6rem] p-1.5"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[1.15rem] p-6" style={{ background: "#0a1628" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>
              {state.id ? "Edit Form Entry" : "Register Form"}
            </h3>
            <button type="button" onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ color: "#475569", background: "rgba(255,255,255,0.04)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-xs mb-4 leading-relaxed" style={{ color: "#64748b" }}>
            Registers a form in the library. The interactive form page must already exist at the route you enter.
          </p>

          <div className="space-y-4">
            <Field label="Title">
              <input
                value={state.title}
                onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
                placeholder="Churn Offboarding"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Slug" hint="unique id">
                <input
                  value={state.slug}
                  onChange={(e) => setState((s) => ({ ...s, slug: e.target.value }))}
                  placeholder="churn"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none font-mono"
                  style={inputStyle}
                  disabled={!!state.id}
                />
              </Field>
              <Field label="Audience">
                <input
                  value={state.audience}
                  onChange={(e) => setState((s) => ({ ...s, audience: e.target.value }))}
                  placeholder="Client Success"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
              </Field>
            </div>
            <Field label="Route path">
              <input
                value={state.href}
                onChange={(e) => setState((s) => ({ ...s, href: e.target.value }))}
                placeholder="/forms/churn"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none font-mono"
                style={inputStyle}
              />
            </Field>
            <Field label="Description">
              <textarea
                value={state.description}
                onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
                rows={3}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-none"
                style={inputStyle}
              />
            </Field>
            <Field label="Tags" hint="comma-separated">
              <input
                value={state.tags}
                onChange={(e) => setState((s) => ({ ...s, tags: e.target.value }))}
                placeholder="churn, offboarding"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </Field>
            {error && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#f87171", background: "rgba(248,113,113,0.08)" }}>
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 mt-6">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium" style={{ color: "#94a3b8", background: "rgba(255,255,255,0.04)" }}>
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-full px-5 py-2 text-sm font-semibold active:scale-[0.98]"
              style={{ background: "#60a5fa", color: "#0a1628", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : state.id ? "Save" : "Register"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xs font-semibold" style={{ color: "#94a3b8" }}>{label}</span>
        {hint && <span className="text-[10px]" style={{ color: "#334155" }}>{hint}</span>}
      </span>
      {children}
    </label>
  );
}
