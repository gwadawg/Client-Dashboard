"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TeamFormsSection from "@/components/TeamFormsSection";
import SetterPlaybooksSection from "@/components/SetterPlaybooksSection";

type Category = "form" | "sop" | "document" | "template" | "other";

type Resource = {
  id: string;
  title: string;
  description: string | null;
  category: Category;
  tags: string[];
  url: string;
  created_at: string;
  updated_at: string;
};

const CATEGORY_META: Record<Category, { label: string; color: string; tint: string }> = {
  form:     { label: "Form",     color: "#60a5fa", tint: "rgba(96,165,250,0.12)" },
  sop:      { label: "SOP",      color: "#34d399", tint: "rgba(52,211,153,0.12)" },
  document: { label: "Document", color: "#f59e0b", tint: "rgba(245,158,11,0.12)" },
  template: { label: "Template", color: "#c084fc", tint: "rgba(192,132,252,0.12)" },
  other:    { label: "Other",    color: "#94a3b8", tint: "rgba(148,163,184,0.12)" },
};

const CATEGORY_ORDER: Category[] = ["form", "sop", "document", "template", "other"];

const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

type FormState = {
  id: string | null;
  title: string;
  category: Category;
  url: string;
  description: string;
  tags: string;
};

const EMPTY_FORM: FormState = {
  id: null,
  title: "",
  category: "document",
  url: "",
  description: "",
  tags: "",
};

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed.startsWith("/")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function isInternalPath(url: string): boolean {
  return url.trim().startsWith("/");
}

function hostFromUrl(url: string): string {
  if (isInternalPath(url)) return url.trim();
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export default function ResourcesLibrary({ canManage = false }: { canManage?: boolean }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/resources");
      const data = await res.json();
      setResources(Array.isArray(data) ? data : []);
    } catch {
      setResources([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const allTags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of resources) {
      for (const t of r.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [resources]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: resources.length };
    for (const r of resources) counts[r.category] = (counts[r.category] ?? 0) + 1;
    return counts;
  }, [resources]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter((r) => {
      if (activeCategory !== "all" && r.category !== activeCategory) return false;
      if (activeTags.length && !activeTags.every((t) => r.tags?.includes(t))) return false;
      if (!q) return true;
      const haystack = [
        r.title,
        r.description ?? "",
        CATEGORY_META[r.category].label,
        ...(r.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [resources, query, activeCategory, activeTags]);

  function toggleTag(tag: string) {
    setActiveTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(r: Resource) {
    setForm({
      id: r.id,
      title: r.title,
      category: r.category,
      url: r.url,
      description: r.description ?? "",
      tags: (r.tags ?? []).join(", "),
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    if (!form.title.trim()) {
      setFormError("Give the resource a title.");
      return;
    }
    if (!form.url.trim()) {
      setFormError("Add a link to the resource.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload = {
      title: form.title.trim(),
      category: form.category,
      url: normalizeUrl(form.url.trim()),
      description: form.description.trim() || null,
      tags: form.tags,
    };
    try {
      const res = await fetch(form.id ? `/api/resources/${form.id}` : "/api/resources", {
        method: form.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || "Couldn't save the resource. Try again.");
        return;
      }
      setModalOpen(false);
      await load();
    } catch {
      setFormError("Couldn't save the resource. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/resources/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setDeletingId(null);
    }
  }

  const hasFilters = query.trim() || activeCategory !== "all" || activeTags.length > 0;

  return (
    <div className="max-w-6xl space-y-8">
      {/* Heading */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span
            className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] mb-3"
            style={{ background: "rgba(245,158,11,0.10)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            Company Library
          </span>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "#f1f5f9" }}>
            Resources
          </h2>
          <p className="text-sm mt-1" style={{ color: "#64748b" }}>
            Forms, SOPs, templates, and key documents — everything the team needs, in one place.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="group flex items-center gap-2 rounded-full pl-5 pr-2 py-2 text-sm font-semibold active:scale-[0.98]"
            style={{ background: "#f59e0b", color: "#1a1206", transition: `transform 300ms ${EASE}` }}
          >
            Add Resource
            <span
              className="flex items-center justify-center w-7 h-7 rounded-full"
              style={{ background: "rgba(0,0,0,0.16)", transition: `transform 400ms ${EASE}` }}
            >
              <svg className="w-3.5 h-3.5 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]" style={{ transition: `transform 400ms ${EASE}` }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </span>
          </button>
        )}
      </div>

      <TeamFormsSection />

      <SetterPlaybooksSection />

      {/* Search */}
      <div
        className="rounded-2xl p-1.5"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div
          className="flex items-center gap-3 rounded-[0.85rem] px-4 py-3"
          style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.04)" }}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="#475569" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
          </svg>
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, description, or tag…"
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "#e2e8f0" }}
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); searchRef.current?.focus(); }}
              className="text-xs font-medium"
              style={{ color: "#475569" }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Category chips */}
      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip
          label="All"
          count={categoryCounts.all ?? 0}
          active={activeCategory === "all"}
          color="#f59e0b"
          onClick={() => setActiveCategory("all")}
        />
        {CATEGORY_ORDER.map((cat) => (
          <CategoryChip
            key={cat}
            label={CATEGORY_META[cat].label}
            count={categoryCounts[cat] ?? 0}
            active={activeCategory === cat}
            color={CATEGORY_META[cat].color}
            onClick={() => setActiveCategory((c) => (c === cat ? "all" : cat))}
          />
        ))}
      </div>

      {/* Tag filters */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: "#334155" }}>
            Tags
          </span>
          {allTags.map((tag) => {
            const active = activeTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: active ? "rgba(245,158,11,0.14)" : "rgba(255,255,255,0.03)",
                  color: active ? "#f59e0b" : "#64748b",
                  border: `1px solid ${active ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.06)"}`,
                  transition: `all 300ms ${EASE}`,
                }}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-24" style={{ color: "#334155" }}>
          <svg className="w-5 h-5 animate-spin mr-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span className="text-sm font-medium">Loading resources…</span>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState hasFilters={!!hasFilters} canManage={canManage} onAdd={openAdd} onClear={() => { setQuery(""); setActiveCategory("all"); setActiveTags([]); }} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r, i) => (
            <ResourceCard
              key={r.id}
              resource={r}
              index={i}
              canManage={canManage}
              deleting={deletingId === r.id}
              onEdit={() => openEdit(r)}
              onDelete={() => handleDelete(r.id)}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <ResourceModal
          form={form}
          setForm={setForm}
          saving={saving}
          error={formError}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}

      <style>{`
        @keyframes res-rise {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .res-rise { animation: none !important; }
        }
      `}</style>
    </div>
  );
}

function CategoryChip({
  label, count, active, color, onClick,
}: { label: string; count: number; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium active:scale-[0.97]"
      style={{
        background: active ? color : "rgba(255,255,255,0.03)",
        color: active ? "#0a1628" : "#94a3b8",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.07)"}`,
        transition: `all 300ms ${EASE}`,
      }}
    >
      {label}
      <span
        className="text-[11px] font-semibold tabular-nums rounded-full px-1.5"
        style={{ background: active ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.05)", color: active ? "#0a1628" : "#475569" }}
      >
        {count}
      </span>
    </button>
  );
}

function ResourceCard({
  resource, index, canManage, deleting, onEdit, onDelete,
}: {
  resource: Resource;
  index: number;
  canManage: boolean;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [hover, setHover] = useState(false);
  const meta = CATEGORY_META[resource.category];

  return (
    <div
      className="res-rise rounded-[1.4rem] p-1.5 h-full"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${hover ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: `transform 400ms ${EASE}, border-color 400ms ${EASE}`,
        animation: `res-rise 600ms ${EASE} both`,
        animationDelay: `${Math.min(index * 45, 360)}ms`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="flex h-full flex-col rounded-[1.05rem] p-5"
        style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}
      >
        <div className="flex items-start justify-between gap-3">
          <span
            className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ background: meta.tint, color: meta.color }}
          >
            {meta.label}
          </span>
          {canManage && (
            <div className="flex items-center gap-1" style={{ opacity: hover ? 1 : 0.35, transition: `opacity 300ms ${EASE}` }}>
              <button
                type="button"
                onClick={onEdit}
                title="Edit"
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ color: "#64748b", background: "rgba(255,255,255,0.04)" }}
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={deleting}
                title="Delete"
                className="flex items-center justify-center w-7 h-7 rounded-lg"
                style={{ color: "#9f6464", background: "rgba(248,113,113,0.08)" }}
              >
                {deleting ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        <h3 className="mt-4 text-base font-semibold leading-snug" style={{ color: "#e2e8f0" }}>
          {resource.title}
        </h3>
        {resource.description && (
          <p className="mt-1.5 text-sm leading-relaxed line-clamp-3" style={{ color: "#64748b" }}>
            {resource.description}
          </p>
        )}

        {resource.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {resource.tags.map((t) => (
              <span key={t} className="rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.04)", color: "#475569" }}>
                #{t}
              </span>
            ))}
          </div>
        )}

        <a
          href={normalizeUrl(resource.url)}
          target={isInternalPath(resource.url) ? undefined : "_blank"}
          rel={isInternalPath(resource.url) ? undefined : "noopener noreferrer"}
          className="group mt-auto pt-5 flex items-center gap-2 text-sm font-semibold"
          style={{ color: "#f59e0b" }}
        >
          <span className="truncate" style={{ maxWidth: "10rem" }}>
            {isInternalPath(resource.url) ? "Open in Mr. Waiz" : hostFromUrl(resource.url)}
          </span>
          <span
            className="flex items-center justify-center w-6 h-6 rounded-full ml-auto"
            style={{ background: "rgba(245,158,11,0.12)", transition: `transform 400ms ${EASE}` }}
          >
            <svg className="w-3 h-3 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]" style={{ transition: `transform 400ms ${EASE}` }} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H8m9 0v9" />
            </svg>
          </span>
        </a>
      </div>
    </div>
  );
}

function EmptyState({
  hasFilters, canManage, onAdd, onClear,
}: { hasFilters: boolean; canManage: boolean; onAdd: () => void; onClear: () => void }) {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center text-center py-20 px-6"
      style={{ background: "#0a1628", border: "1px dashed rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center justify-center w-12 h-12 rounded-xl mb-4" style={{ background: "rgba(245,158,11,0.10)" }}>
        <svg className="w-6 h-6" fill="none" stroke="#f59e0b" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <p className="text-sm font-semibold" style={{ color: "#94a3b8" }}>
        {hasFilters ? "No resources match those filters" : "No resources yet"}
      </p>
      <p className="text-xs mt-1 max-w-xs" style={{ color: "#475569" }}>
        {hasFilters
          ? "Try a different search term or clear the filters."
          : canManage
            ? "Add your first form, SOP, or document link to get the library started."
            : "Once an admin adds resources, they'll appear here."}
      </p>
      {hasFilters ? (
        <button type="button" onClick={onClear} className="mt-5 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>
          Clear filters
        </button>
      ) : canManage ? (
        <button type="button" onClick={onAdd} className="mt-5 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "#f59e0b", color: "#1a1206" }}>
          Add Resource
        </button>
      ) : null}
    </div>
  );
}

function ResourceModal({
  form, setForm, saving, error, onClose, onSave,
}: {
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: () => void;
}) {
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
          animation: `res-rise 400ms ${EASE} both`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="rounded-[1.15rem] p-6" style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>
              {form.id ? "Edit Resource" : "Add Resource"}
            </h3>
            <button type="button" onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ color: "#475569", background: "rgba(255,255,255,0.04)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            <Field label="Title">
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. New Client Onboarding Form"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style={inputStyle}
                autoFocus
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))}
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none cursor-pointer"
                  style={inputStyle}
                >
                  {CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>{CATEGORY_META[c].label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tags" hint="comma-separated">
                <input
                  value={form.tags}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
                  placeholder="onboarding, sales"
                  className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                  style={inputStyle}
                />
              </Field>
            </div>

            <Field label="Link">
              <input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://docs.google.com/…"
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none"
                style={inputStyle}
              />
            </Field>

            <Field label="Description" hint="optional">
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What is this for and when should it be used?"
                rows={3}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-none"
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
              style={{ background: "#f59e0b", color: "#1a1206", opacity: saving ? 0.7 : 1, transition: `transform 300ms ${EASE}` }}
            >
              {saving ? "Saving…" : form.id ? "Save Changes" : "Add Resource"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#e2e8f0",
};

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
