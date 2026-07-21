"use client";

import { useEffect, useState } from "react";
import { slugFromTitle } from "@/lib/library-processor";
import {
  DEPARTMENT_ORDER,
  departmentMeta,
  type LibraryArtifactType,
  type LibraryDepartment,
  type LibraryOwner,
  type LibraryStatus,
} from "@/lib/library-manifest";
import type { LibraryDocumentRow } from "@/lib/library-processor";

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

const OWNERS: { value: LibraryOwner; label: string }[] = [
  { value: "setter", label: "Setter" },
  { value: "closer", label: "Closer" },
  { value: "sales-leadership", label: "Sales Leadership" },
  { value: "operations", label: "Operations" },
];

const ARTIFACT_TYPES: { value: LibraryArtifactType; label: string }[] = [
  { value: "script", label: "Script" },
  { value: "sop", label: "SOP" },
  { value: "checklist", label: "Checklist" },
  { value: "reference", label: "Reference" },
  { value: "framework", label: "Framework" },
  { value: "doctrine", label: "Doctrine" },
  { value: "prompt", label: "Prompt" },
  { value: "hub", label: "Hub" },
  { value: "document", label: "Document" },
];

const STATUSES: { value: LibraryStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
];

export type LibraryEditorState = {
  editSlug: string | null;
  title: string;
  slug: string;
  body: string;
  domain: string;
  owner: LibraryOwner;
  status: LibraryStatus;
  artifact_type: LibraryArtifactType;
  department: LibraryDepartment | "";
  review_cycle: string;
  script_version: string;
  tags: string;
  featured: boolean;
};

export const EMPTY_LIBRARY_EDITOR: LibraryEditorState = {
  editSlug: null,
  title: "",
  slug: "",
  body: "",
  domain: "acquisition",
  owner: "setter",
  status: "draft",
  artifact_type: "sop",
  department: "sales",
  review_cycle: "",
  script_version: "",
  tags: "",
  featured: false,
};

export function libraryRowToEditor(row: LibraryDocumentRow): LibraryEditorState {
  return {
    editSlug: row.slug,
    title: row.title,
    slug: row.slug,
    body: row.body,
    domain: row.domain,
    owner: row.owner,
    status: row.status,
    artifact_type: row.artifact_type,
    department: row.department ?? "",
    review_cycle: row.review_cycle ?? "",
    script_version: row.script_version ?? "",
    tags: (row.tags ?? []).join(", "),
    featured: row.featured,
  };
}

const inputStyle: React.CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#e2e8f0",
};

type Props = {
  state: LibraryEditorState;
  setState: React.Dispatch<React.SetStateAction<LibraryEditorState>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
};

export default function LibraryDocEditor({ state, setState, saving, error, onClose, onSave }: Props) {
  const [slugManual, setSlugManual] = useState(!!state.editSlug);
  const [formatting, setFormatting] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);

  useEffect(() => {
    if (!slugManual && state.title && !state.editSlug) {
      setState((s) => ({ ...s, slug: slugFromTitle(s.title) }));
    }
  }, [state.title, slugManual, state.editSlug, setState]);

  async function handleFormat() {
    if (formatting || !state.body.trim()) return;
    setFormatting(true);
    setFormatError(null);
    try {
      const res = await fetch("/api/library/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: state.body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Formatting failed");

      setState((s) => ({
        ...s,
        body: typeof data.body === "string" ? data.body : s.body,
        title: s.title.trim() ? s.title : (data.title ?? s.title),
        artifact_type: data.artifact_type ?? s.artifact_type,
        owner: data.owner ?? s.owner,
        department: data.department ?? s.department,
        review_cycle: data.review_cycle ?? s.review_cycle,
        script_version: data.script_version ?? s.script_version,
        tags: Array.isArray(data.tags) && data.tags.length ? data.tags.join(", ") : s.tags,
      }));
    } catch (err) {
      setFormatError(err instanceof Error ? err.message : "Formatting failed");
    } finally {
      setFormatting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(3,7,15,0.7)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl max-h-[90dvh] flex flex-col rounded-[1.6rem] p-1.5"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 30px 70px rgba(0,0,0,0.6)",
          animation: `lib-editor-rise 400ms ${EASE} both`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex flex-col min-h-0 rounded-[1.15rem] p-6"
          style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}
        >
          <div className="flex items-center justify-between mb-5 flex-shrink-0">
            <h3 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>
              {state.editSlug ? "Edit Playbook" : "Add Playbook"}
            </h3>
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg"
              style={{ color: "#475569", background: "rgba(255,255,255,0.04)" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            <Field label="Title">
              <input
                value={state.title}
                onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
                placeholder="e.g. Watchshift SOP"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="URL slug" hint="becomes /library/your-slug">
                <input
                  value={state.slug}
                  onChange={(e) => {
                    setSlugManual(true);
                    setState((s) => ({ ...s, slug: e.target.value }));
                  }}
                  placeholder="watchshift"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none font-mono"
                  style={inputStyle}
                  disabled={!!state.editSlug}
                />
              </Field>
              <Field label="Department">
                <select
                  value={state.department}
                  onChange={(e) =>
                    setState((s) => ({ ...s, department: e.target.value as LibraryDepartment | "" }))
                  }
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none cursor-pointer"
                  style={inputStyle}
                >
                  <option value="">Unassigned</option>
                  {DEPARTMENT_ORDER.map((d) => (
                    <option key={d} value={d}>
                      {departmentMeta(d).label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Type">
                <select
                  value={state.artifact_type}
                  onChange={(e) =>
                    setState((s) => ({ ...s, artifact_type: e.target.value as LibraryArtifactType }))
                  }
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none cursor-pointer"
                  style={inputStyle}
                >
                  {ARTIFACT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Owner role">
                <select
                  value={state.owner}
                  onChange={(e) => setState((s) => ({ ...s, owner: e.target.value as LibraryOwner }))}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none cursor-pointer"
                  style={inputStyle}
                >
                  {OWNERS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Status">
                <select
                  value={state.status}
                  onChange={(e) => setState((s) => ({ ...s, status: e.target.value as LibraryStatus }))}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none cursor-pointer"
                  style={inputStyle}
                >
                  {STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Tags" hint="comma-separated">
                <input
                  value={state.tags}
                  onChange={(e) => setState((s) => ({ ...s, tags: e.target.value }))}
                  placeholder="sales, setter"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
              </Field>
              <Field label="Script version" hint="optional">
                <input
                  value={state.script_version}
                  onChange={(e) => setState((s) => ({ ...s, script_version: e.target.value }))}
                  placeholder="v2.4"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
              </Field>
            </div>

            <label className="block">
              <span className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
                    Markdown body
                  </span>
                  <span className="text-[10px]" style={{ color: "#334155" }}>
                    paste raw text, then clean it up
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleFormat}
                  disabled={formatting || !state.body.trim()}
                  title="Restructure pasted text into the library format. Wording is preserved."
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: "rgba(129,140,248,0.14)", color: "#a5b4fc", border: "1px solid rgba(129,140,248,0.28)" }}
                >
                  {formatting ? (
                    <>
                      <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                      </svg>
                      Cleaning up…
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16 2.4 6.6L22 12l-6.6 2.4L13 21l-2.4-6.6L4 12l6.6-2.4L13 3Z" />
                      </svg>
                      Clean up &amp; structure
                    </>
                  )}
                </button>
              </span>
              <textarea
                value={state.body}
                onChange={(e) => setState((s) => ({ ...s, body: e.target.value }))}
                placeholder={"Paste raw text here (from a Google Doc, email, transcript…) then click Clean up & structure.\n\nOr write markdown directly:\n## Purpose\n\nWhat this doc covers…\n\n> Dialogue lines render as script blocks."}
                rows={16}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-y font-mono leading-relaxed"
                style={inputStyle}
              />
            </label>

            {formatError && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#f87171", background: "rgba(248,113,113,0.08)" }}>
                {formatError}
              </p>
            )}

            {error && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#f87171", background: "rgba(248,113,113,0.08)" }}>
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 mt-6 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full px-4 py-2 text-sm font-medium"
              style={{ color: "#94a3b8", background: "rgba(255,255,255,0.04)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-full px-5 py-2 text-sm font-semibold active:scale-[0.98]"
              style={{ background: "#34d399", color: "#0a1628", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving…" : state.editSlug ? "Save Changes" : "Publish"}
            </button>
          </div>
        </div>
      </div>
      <style>{`
        @keyframes lib-editor-rise {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-baseline gap-2 mb-1.5">
        <span className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
          {label}
        </span>
        {hint && (
          <span className="text-[10px]" style={{ color: "#334155" }}>
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}
