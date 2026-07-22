"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { slugFromTitle } from "@/lib/library-processor";
import {
  DEPARTMENT_ORDER,
  artifactMeta,
  departmentMeta,
  type LibraryArtifactType,
  type LibraryDepartment,
  type LibraryOwner,
  type LibraryStatus,
  type RelatedDoc,
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

export type LibraryDocOption = {
  slug: string;
  title: string;
  artifact_type?: string;
};

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
  related_docs: RelatedDoc[];
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
  related_docs: [],
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
    related_docs: row.related_docs ?? [],
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
  /** Other library docs available for @-mentions and Related tagging. */
  libraryDocs?: LibraryDocOption[];
};

type MentionState = {
  /** Index in the body where the link should be inserted. */
  start: number;
};

function mergeRelated(existing: RelatedDoc[], next: RelatedDoc, excludeSlug?: string | null): RelatedDoc[] {
  if (excludeSlug && next.slug === excludeSlug) return existing;
  if (existing.some((r) => r.slug === next.slug)) return existing;
  return [...existing, next];
}

function scoreDocMatch(doc: LibraryDocOption, q: string): number {
  if (!q) return 0;
  const title = doc.title.toLowerCase();
  const slug = doc.slug.toLowerCase();
  if (title === q || slug === q) return 100;
  if (title.startsWith(q) || slug.startsWith(q)) return 80;
  if (title.includes(q) || slug.includes(q)) return 50;
  // Multi-word: every token must appear somewhere
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((t) => title.includes(t) || slug.includes(t))) return 40;
  return -1;
}

export default function LibraryDocEditor({
  state,
  setState,
  saving,
  error,
  onClose,
  onSave,
  libraryDocs = [],
}: Props) {
  const [slugManual, setSlugManual] = useState(!!state.editSlug);
  const [formatting, setFormatting] = useState(false);
  const [formatError, setFormatError] = useState<string | null>(null);
  const [mention, setMention] = useState<MentionState | null>(null);
  const [mentionSearch, setMentionSearch] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [relatedQuery, setRelatedQuery] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mentionSearchRef = useRef<HTMLInputElement>(null);
  const mentionListRef = useRef<HTMLDivElement>(null);

  const linkableDocs = useMemo(
    () => libraryDocs.filter((d) => d.slug !== state.editSlug && d.slug !== state.slug),
    [libraryDocs, state.editSlug, state.slug],
  );

  const mentionMatches = useMemo(() => {
    if (!mention) return [];
    const q = mentionSearch.trim().toLowerCase();
    const ranked = linkableDocs
      .map((d) => ({ doc: d, score: scoreDocMatch(d, q) }))
      .filter((r) => (q ? r.score >= 0 : true))
      .sort((a, b) => b.score - a.score || a.doc.title.localeCompare(b.doc.title));
    return ranked.slice(0, 12).map((r) => r.doc);
  }, [mention, mentionSearch, linkableDocs]);

  const relatedPickerMatches = useMemo(() => {
    const q = relatedQuery.trim().toLowerCase();
    const taken = new Set(state.related_docs.map((r) => r.slug));
    return linkableDocs
      .filter((d) => !taken.has(d.slug))
      .filter(
        (d) =>
          !q ||
          d.title.toLowerCase().includes(q) ||
          d.slug.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [relatedQuery, linkableDocs, state.related_docs]);

  useEffect(() => {
    if (!slugManual && state.title && !state.editSlug) {
      setState((s) => ({ ...s, slug: slugFromTitle(s.title) }));
    }
  }, [state.title, slugManual, state.editSlug, setState]);

  useEffect(() => {
    setMentionIndex(0);
  }, [mentionSearch, mention]);

  useEffect(() => {
    if (!mention) return;
    const id = requestAnimationFrame(() => {
      mentionSearchRef.current?.focus();
      mentionSearchRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [mention]);

  useEffect(() => {
    if (!mention || !mentionListRef.current) return;
    const el = mentionListRef.current.querySelector<HTMLElement>(`[data-mention-idx="${mentionIndex}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [mentionIndex, mention, mentionMatches.length]);

  function openMentionPicker(value: string, at: number, cursor: number) {
    const typed = value.slice(at + 1, cursor);
    // Pull `@query` out of the body into the search field (Cursor-style).
    const nextBody = value.slice(0, at) + value.slice(cursor);
    setState((s) => ({ ...s, body: nextBody }));
    setMention({ start: at });
    setMentionSearch(typed);
    setMentionIndex(0);
  }

  function closeMentionPicker() {
    const start = mention?.start ?? 0;
    setMention(null);
    setMentionSearch("");
    setMentionIndex(0);
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(start, start);
    });
  }

  function insertDocLink(doc: LibraryDocOption) {
    if (!mention) return;
    const start = mention.start;
    let nextCursor = start;

    setState((s) => {
      const before = s.body.slice(0, start);
      const after = s.body.slice(start);
      const link = `[${doc.title}](/library/${doc.slug})`;
      nextCursor = before.length + link.length;
      return {
        ...s,
        body: `${before}${link}${after}`,
        related_docs: mergeRelated(
          s.related_docs,
          { slug: doc.slug, label: doc.title, relation: "reference" },
          s.editSlug ?? s.slug,
        ),
      };
    });
    setMention(null);
    setMentionSearch("");
    setMentionIndex(0);

    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(nextCursor, nextCursor);
    });
  }

  function addRelated(doc: LibraryDocOption) {
    setState((s) => ({
      ...s,
      related_docs: mergeRelated(
        s.related_docs,
        { slug: doc.slug, label: doc.title, relation: "reference" },
        s.editSlug ?? s.slug,
      ),
    }));
    setRelatedQuery("");
  }

  function removeRelated(slug: string) {
    setState((s) => ({
      ...s,
      related_docs: s.related_docs.filter((r) => r.slug !== slug),
    }));
  }

  async function handleFormat() {
    if (formatting || !state.body.trim()) return;
    setFormatting(true);
    setFormatError(null);
    try {
      const res = await fetch("/api/library/format", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: state.body,
          exclude_slug: state.editSlug || state.slug || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Formatting failed");

      setState((s) => {
        const suggestedRelated: RelatedDoc[] = Array.isArray(data.related_docs)
          ? data.related_docs.filter(
              (r: RelatedDoc) =>
                r &&
                typeof r.slug === "string" &&
                typeof r.label === "string" &&
                r.slug !== (s.editSlug ?? s.slug),
            )
          : [];
        let related = s.related_docs;
        for (const r of suggestedRelated) {
          related = mergeRelated(related, r, s.editSlug ?? s.slug);
        }
        return {
          ...s,
          body: typeof data.body === "string" ? data.body : s.body,
          title: s.title.trim() ? s.title : (data.title ?? s.title),
          artifact_type: data.artifact_type ?? s.artifact_type,
          owner: data.owner ?? s.owner,
          department: data.department ?? s.department,
          review_cycle: data.review_cycle ?? s.review_cycle,
          script_version: data.script_version ?? s.script_version,
          tags: Array.isArray(data.tags) && data.tags.length ? data.tags.join(", ") : s.tags,
          related_docs: related,
        };
      });
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

            <div>
              <Field label="Related docs" hint="sidebar links — or type @ in the body">
                <div className="flex flex-wrap gap-1.5 mb-2 min-h-[1.5rem]">
                  {state.related_docs.length === 0 && (
                    <span className="text-[11px]" style={{ color: "#475569" }}>
                      None yet — search below or @mention in the body
                    </span>
                  )}
                  {state.related_docs.map((r) => (
                    <button
                      key={r.slug}
                      type="button"
                      onClick={() => removeRelated(r.slug)}
                      title="Remove related doc"
                      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium"
                      style={{
                        background: "rgba(56,189,248,0.12)",
                        color: "#7dd3fc",
                        border: "1px solid rgba(56,189,248,0.28)",
                      }}
                    >
                      {r.label}
                      <span style={{ color: "#64748b" }}>×</span>
                    </button>
                  ))}
                </div>
                <input
                  value={relatedQuery}
                  onChange={(e) => setRelatedQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && relatedPickerMatches[0]) {
                      e.preventDefault();
                      addRelated(relatedPickerMatches[0]);
                    }
                  }}
                  placeholder="Search library to tag…"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
                {relatedQuery.trim() && relatedPickerMatches.length > 0 && (
                  <div
                    className="mt-1.5 rounded-xl overflow-hidden"
                    style={{ border: "1px solid rgba(255,255,255,0.10)", background: "#0f2040" }}
                  >
                    {relatedPickerMatches.map((d) => (
                      <button
                        key={d.slug}
                        type="button"
                        onClick={() => addRelated(d)}
                        className="w-full text-left px-3.5 py-2.5 text-sm hover:bg-white/[0.04]"
                        style={{ color: "#e2e8f0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      >
                        <span className="font-medium">{d.title}</span>
                        <span className="ml-2 text-[11px] font-mono" style={{ color: "#64748b" }}>
                          /{d.slug}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
            </div>

            <label className="block relative">
              <span className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-baseline gap-2">
                  <span className="text-xs font-semibold" style={{ color: "#94a3b8" }}>
                    Markdown body
                  </span>
                  <span className="text-[10px]" style={{ color: "#334155" }}>
                    paste raw text · @ to search docs · then clean up
                  </span>
                </span>
                <button
                  type="button"
                  onClick={handleFormat}
                  disabled={formatting || !state.body.trim()}
                  title="Restructure pasted text into library chapters and links. Wording is preserved."
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: "rgba(129,140,248,0.14)",
                    color: "#a5b4fc",
                    border: "1px solid rgba(129,140,248,0.28)",
                  }}
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
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16 2.4 6.6L22 12l-6.6 2.4L13 21l-2.4-6.6L4 12l6.6-2.4L13 3Z"
                        />
                      </svg>
                      Clean up & structure
                    </>
                  )}
                </button>
              </span>
              <textarea
                ref={textareaRef}
                value={state.body}
                onChange={(e) => {
                  const value = e.target.value;
                  const cursor = e.target.selectionStart ?? value.length;
                  const before = value.slice(0, cursor);
                  if (before.endsWith("@") && !mention) {
                    const at = before.length - 1;
                    const charBefore = at > 0 ? before[at - 1] : " ";
                    if (!charBefore || /\s|[({\[]/.test(charBefore)) {
                      openMentionPicker(value, at, cursor);
                      return;
                    }
                  }
                  setState((s) => ({ ...s, body: value }));
                }}
                onKeyDown={(e) => {
                  if (mention && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape")) {
                    e.preventDefault();
                  }
                }}
                placeholder={
                  "Paste raw text, then Clean up & structure.\n\nType @ to search and link another playbook.\n\nOr write markdown:\n## Purpose\n\nWhat this doc covers…\n\n> Dialogue lines render as script blocks."
                }
                rows={16}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-y font-mono leading-relaxed"
                style={inputStyle}
              />
            </label>

            {mention && (
              <div
                className="fixed inset-0 z-[60] flex items-start justify-center pt-[18vh] px-4"
                style={{ background: "rgba(3,7,15,0.45)" }}
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) closeMentionPicker();
                }}
              >
                <div
                  className="w-full max-w-lg rounded-2xl overflow-hidden"
                  style={{
                    border: "1px solid rgba(255,255,255,0.14)",
                    background: "#0b1628",
                    boxShadow: "0 28px 70px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)",
                    animation: `lib-mention-rise 160ms ${EASE} both`,
                  }}
                  role="listbox"
                  aria-label="Link library document"
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <div
                    className="flex items-center gap-2.5 px-3.5 py-3"
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                  >
                    <span className="text-sm font-semibold" style={{ color: "#818cf8" }}>
                      @
                    </span>
                    <input
                      ref={mentionSearchRef}
                      value={mentionSearch}
                      onChange={(e) => setMentionSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          if (!mentionMatches.length) return;
                          setMentionIndex((i) => (i + 1) % mentionMatches.length);
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          if (!mentionMatches.length) return;
                          setMentionIndex((i) => (i - 1 + mentionMatches.length) % mentionMatches.length);
                        } else if (e.key === "Enter" || e.key === "Tab") {
                          e.preventDefault();
                          if (mentionMatches[mentionIndex]) insertDocLink(mentionMatches[mentionIndex]);
                        } else if (e.key === "Escape") {
                          e.preventDefault();
                          closeMentionPicker();
                        }
                      }}
                      placeholder="Search playbooks and SOPs…"
                      className="flex-1 bg-transparent text-sm outline-none"
                      style={{ color: "#f1f5f9" }}
                    />
                    <kbd
                      className="hidden sm:inline rounded px-1.5 py-0.5 text-[10px] font-medium"
                      style={{
                        color: "#64748b",
                        background: "rgba(255,255,255,0.05)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      esc
                    </kbd>
                  </div>

                  <div ref={mentionListRef} className="max-h-72 overflow-y-auto py-1">
                    {mentionMatches.length === 0 ? (
                      <p className="px-4 py-8 text-center text-sm" style={{ color: "#64748b" }}>
                        {linkableDocs.length === 0
                          ? "No other library docs to link yet."
                          : `No docs match “${mentionSearch.trim()}”`}
                      </p>
                    ) : (
                      mentionMatches.map((d, i) => {
                        const art = artifactMeta((d.artifact_type as LibraryArtifactType) || "document");
                        const active = i === mentionIndex;
                        return (
                          <button
                            key={d.slug}
                            type="button"
                            data-mention-idx={i}
                            role="option"
                            aria-selected={active}
                            onMouseEnter={() => setMentionIndex(i)}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              insertDocLink(d);
                            }}
                            className="w-full flex items-center gap-3 px-3.5 py-2.5 text-left"
                            style={{
                              background: active ? "rgba(129,140,248,0.16)" : "transparent",
                            }}
                          >
                            <span
                              className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                              style={{ background: art.tint, color: art.color }}
                            >
                              {art.label}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium truncate" style={{ color: "#f1f5f9" }}>
                                {d.title}
                              </span>
                              <span className="block text-[11px] font-mono truncate" style={{ color: "#64748b" }}>
                                /library/{d.slug}
                              </span>
                            </span>
                            {active && (
                              <span className="flex-shrink-0 text-[10px] font-medium" style={{ color: "#94a3b8" }}>
                                ↵
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>

                  <div
                    className="flex items-center justify-between gap-2 px-3.5 py-2 text-[10px]"
                    style={{ borderTop: "1px solid rgba(255,255,255,0.06)", color: "#475569" }}
                  >
                    <span>↑↓ navigate · ↵ link · esc close</span>
                    <span>
                      {mentionMatches.length} of {linkableDocs.length}
                    </span>
                  </div>
                </div>
              </div>
            )}

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
        @keyframes lib-mention-rise {
          from { opacity: 0; transform: translateY(6px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
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
