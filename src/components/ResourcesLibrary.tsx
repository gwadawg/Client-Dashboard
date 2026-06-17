"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import LibraryDocCard from "@/components/library/LibraryDocCard";
import {
  buildUnifiedIndex,
  filterPlaybooks,
  getAllFormItems,
  getAllPlaybookItems,
  groupByKind,
  groupPlaybooksByDepartment,
  countPlaybooksByDepartment,
  LIB_SECTION_META,
  linkToItem,
  PLAYBOOK_DEPARTMENT_FILTERS,
  searchItems,
  type FormItem,
  type LibSection,
  type LinkCategory,
  type LinkItem,
  type LinkResource,
  type PlaybookItem,
} from "@/lib/resource-index";
import type { LibraryDepartment } from "@/lib/library-manifest";
import { DEPARTMENT_META } from "@/lib/library-manifest";

type Category = LinkCategory;

type Resource = LinkResource;

const CATEGORY_META: Record<Category, { label: string; color: string; tint: string }> = {
  form: { label: "Form", color: "#60a5fa", tint: "rgba(96,165,250,0.12)" },
  sop: { label: "SOP", color: "#34d399", tint: "rgba(52,211,153,0.12)" },
  document: { label: "Document", color: "#f59e0b", tint: "rgba(245,158,11,0.12)" },
  template: { label: "Template", color: "#c084fc", tint: "rgba(192,132,252,0.12)" },
  other: { label: "Other", color: "#94a3b8", tint: "rgba(148,163,184,0.12)" },
};

const CATEGORY_ORDER: Category[] = ["form", "sop", "document", "template", "other"];
const EASE = "cubic-bezier(0.32, 0.72, 0, 1)";
const TAB_SECTIONS: LibSection[] = ["playbooks", "forms", "links"];

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

function parseSection(raw: string | null): LibSection {
  if (raw && TAB_SECTIONS.includes(raw as LibSection)) return raw as LibSection;
  return "playbooks";
}

export default function ResourcesLibrary({ canManage = false }: { canManage?: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [playbookDepartment, setPlaybookDepartment] = useState<LibraryDepartment | "all">("all");
  const [linkCategory, setLinkCategory] = useState<Category | "all">("all");
  const [linkTags, setLinkTags] = useState<string[]>([]);

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const section = parseSection(searchParams.get("lib"));

  const playbookItems = useMemo(() => getAllPlaybookItems(), []);
  const formItems = useMemo(() => getAllFormItems(), []);
  const linkItems = useMemo(() => resources.map((r) => linkToItem(r)), [resources]);
  const unifiedIndex = useMemo(
    () => buildUnifiedIndex(resources),
    [resources, playbookItems, formItems],
  );

  const counts = useMemo(
    () => ({
      playbooks: playbookItems.length,
      forms: formItems.length,
      links: linkItems.length,
    }),
    [playbookItems.length, formItems.length, linkItems.length],
  );

  const isSearching = query.trim().length > 0;
  const searchResults = useMemo(
    () => (isSearching ? groupByKind(searchItems(unifiedIndex, query)) : null),
    [isSearching, query, unifiedIndex],
  );

  const filteredPlaybooks = useMemo(
    () => filterPlaybooks(playbookItems, { department: playbookDepartment }),
    [playbookItems, playbookDepartment],
  );

  const playbookDeptCounts = useMemo(
    () => countPlaybooksByDepartment(playbookItems),
    [playbookItems],
  );

  const filteredLinks = useMemo(() => {
    return linkItems.filter((item) => {
      if (linkCategory !== "all" && item.category !== linkCategory) return false;
      if (linkTags.length && !linkTags.every((t) => item.tags.includes(t))) return false;
      return true;
    });
  }, [linkItems, linkCategory, linkTags]);

  const linkTagsAll = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of linkItems) {
      for (const t of item.resource.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  }, [linkItems]);

  const linkCategoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: linkItems.length };
    for (const item of linkItems) counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, [linkItems]);

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

  function setSection(next: LibSection) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "resources");
    params.set("lib", next);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
      if (section !== "links") setSection("links");
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

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
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
          <p className="text-sm mt-1 max-w-xl" style={{ color: "#64748b" }}>
            Playbooks, forms, and links — organized so your team can find what they need fast.
          </p>
        </div>
        {canManage && section === "links" && (
          <button
            type="button"
            onClick={openAdd}
            className="group flex items-center gap-2 rounded-full pl-5 pr-2 py-2 text-sm font-semibold active:scale-[0.98]"
            style={{ background: "#f59e0b", color: "#1a1206", transition: `transform 300ms ${EASE}` }}
          >
            Add Link
            <span className="flex items-center justify-center w-7 h-7 rounded-full" style={{ background: "rgba(0,0,0,0.16)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </span>
          </button>
        )}
      </div>

      {/* Global search */}
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
            placeholder="Search playbooks, forms, and links…"
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

      {/* Section tabs — hidden during active search */}
      {!isSearching && (
        <div
          className="flex flex-wrap gap-2 p-1.5 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
        >
          {TAB_SECTIONS.map((key) => (
            <SectionTab
              key={key}
              label={LIB_SECTION_META[key].label}
              count={counts[key]}
              active={section === key}
              color={LIB_SECTION_META[key].color}
              onClick={() => setSection(key)}
            />
          ))}
        </div>
      )}

      {/* Content */}
      {isSearching ? (
        <SearchResults
          results={searchResults!}
          query={query}
          loading={loading}
          canManage={canManage}
          deletingId={deletingId}
          onEdit={(r) => openEdit(r)}
          onDelete={handleDelete}
        />
      ) : section === "playbooks" ? (
        <PlaybooksPanel
          items={filteredPlaybooks}
          allItems={playbookItems}
          department={playbookDepartment}
          deptCounts={playbookDeptCounts}
          onDepartmentChange={setPlaybookDepartment}
        />
      ) : section === "forms" ? (
        <FormsPanel items={formItems} />
      ) : (
        <LinksPanel
          items={filteredLinks}
          loading={loading}
          canManage={canManage}
          deletingId={deletingId}
          linkCategory={linkCategory}
          linkCategoryCounts={linkCategoryCounts}
          linkTags={linkTags}
          linkTagsAll={linkTagsAll}
          onCategoryChange={setLinkCategory}
          onToggleTag={(tag) =>
            setLinkTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
          }
          onClearTags={() => setLinkTags([])}
          onEdit={(r) => openEdit(r)}
          onDelete={handleDelete}
          onAdd={openAdd}
        />
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

function SectionTab({
  label, count, active, color, onClick,
}: { label: string; count: number; active: boolean; color: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium active:scale-[0.98]"
      style={{
        background: active ? color : "transparent",
        color: active ? "#0a1628" : "#94a3b8",
        border: `1px solid ${active ? color : "transparent"}`,
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

function PlaybooksPanel({
  items,
  allItems,
  department,
  deptCounts,
  onDepartmentChange,
}: {
  items: PlaybookItem[];
  allItems: PlaybookItem[];
  department: LibraryDepartment | "all";
  deptCounts: Record<LibraryDepartment, number>;
  onDepartmentChange: (v: LibraryDepartment | "all") => void;
}) {
  const showGrouped = department === "all";
  const featured = items.find((i) => i.featured);
  const groups = showGrouped ? groupPlaybooksByDepartment(items) : [];
  const flatItems = featured ? items.filter((i) => !i.featured) : items;

  return (
    <div className="space-y-5">
      <SectionIntro
        title={LIB_SECTION_META.playbooks.label}
        description={LIB_SECTION_META.playbooks.description}
      />

      <div className="space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
          Department
        </p>
        <div className="flex flex-wrap gap-2">
          <DepartmentChip
            label="All departments"
            count={allItems.length}
            active={department === "all"}
            color="#34d399"
            onClick={() => onDepartmentChange("all")}
          />
          {PLAYBOOK_DEPARTMENT_FILTERS.filter((f) => f.value !== "all").map((f) => {
            const dept = f.value as LibraryDepartment;
            const meta = DEPARTMENT_META[dept];
            return (
              <DepartmentChip
                key={f.value}
                label={f.label}
                count={deptCounts[dept]}
                active={department === f.value}
                color={meta.color}
                onClick={() => onDepartmentChange(f.value)}
              />
            );
          })}
        </div>
      </div>

      {department !== "all" && (
        <p className="text-sm leading-relaxed -mt-1" style={{ color: "#64748b" }}>
          {DEPARTMENT_META[department].description}
        </p>
      )}

      {items.length === 0 ? (
        <EmptyPanel
          message="No playbooks in this department yet."
          hint={
            department !== "all"
              ? `${DEPARTMENT_META[department].label} playbooks will appear here as they are imported.`
              : undefined
          }
        />
      ) : showGrouped ? (
        <div className="space-y-10">
          {featured && <LibraryDocCard item={featured} featured />}
          {groups.map((group) => (
            <DepartmentPlaybookSection key={group.department} department={group.department} items={group.items} />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {featured && <LibraryDocCard item={featured} featured />}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {flatItems.map((item, i) => (
              <LibraryDocCard key={item.id} item={item} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DepartmentChip({
  label,
  count,
  active,
  color,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium active:scale-[0.98]"
      style={{
        background: active ? color : "rgba(255,255,255,0.03)",
        color: active ? "#0a1628" : count === 0 ? "#475569" : "#94a3b8",
        border: `1px solid ${active ? color : "rgba(255,255,255,0.07)"}`,
        opacity: !active && count === 0 ? 0.55 : 1,
      }}
    >
      {label}
      <span
        className="text-[11px] font-semibold tabular-nums rounded-full px-1.5"
        style={{
          background: active ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.05)",
          color: active ? "#0a1628" : "#475569",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function DepartmentPlaybookSection({
  department,
  items,
}: {
  department: LibraryDepartment;
  items: PlaybookItem[];
}) {
  const meta = DEPARTMENT_META[department];
  const visible = items.filter((i) => !i.featured);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2 border-b pb-3" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div>
          <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: meta.color }}>
            {meta.label}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            {meta.description}
          </p>
        </div>
        <span className="text-xs tabular-nums" style={{ color: "#475569" }}>
          {items.length} doc{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item, i) => (
          <LibraryDocCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </section>
  );
}

function FormsPanel({ items }: { items: FormItem[] }) {
  return (
    <div className="space-y-5">
      <SectionIntro
        title={LIB_SECTION_META.forms.label}
        description={LIB_SECTION_META.forms.description}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {items.map((item, i) => (
          <FormCard key={item.id} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}

function FormCard({ item, index }: { item: FormItem; index: number }) {
  const [hover, setHover] = useState(false);
  return (
    <Link
      href={item.href}
      className="res-rise block h-full rounded-[1.4rem] p-1.5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: `1px solid ${hover ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)"}`,
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        transition: `transform 400ms ${EASE}, border-color 400ms ${EASE}`,
        animation: `res-rise 600ms ${EASE} both`,
        animationDelay: `${Math.min(index * 45, 180)}ms`,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div className="flex h-full flex-col rounded-[1.05rem] p-5" style={{ background: "#0a1628" }}>
        <span
          className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider w-fit"
          style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}
        >
          Form
        </span>
        <p className="mt-1 text-[11px] font-medium" style={{ color: "#64748b" }}>
          {item.audience}
        </p>
        <h3 className="mt-3 text-base font-semibold leading-snug" style={{ color: "#e2e8f0" }}>
          {item.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed line-clamp-3" style={{ color: "#64748b" }}>
          {item.description}
        </p>
        {item.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {item.tags.slice(0, 4).map((t) => (
              <span key={t} className="rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.04)", color: "#475569" }}>
                #{t}
              </span>
            ))}
          </div>
        )}
        <span className="mt-auto pt-4 text-sm font-semibold" style={{ color: "#60a5fa" }}>
          Open form →
        </span>
      </div>
    </Link>
  );
}

function LinksPanel({
  items,
  loading,
  canManage,
  deletingId,
  linkCategory,
  linkCategoryCounts,
  linkTags,
  linkTagsAll,
  onCategoryChange,
  onToggleTag,
  onClearTags,
  onEdit,
  onDelete,
  onAdd,
}: {
  items: LinkItem[];
  loading: boolean;
  canManage: boolean;
  deletingId: string | null;
  linkCategory: Category | "all";
  linkCategoryCounts: Record<string, number>;
  linkTags: string[];
  linkTagsAll: string[];
  onCategoryChange: (c: Category | "all") => void;
  onToggleTag: (tag: string) => void;
  onClearTags: () => void;
  onEdit: (r: Resource) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
}) {
  const hasFilters = linkCategory !== "all" || linkTags.length > 0;

  return (
    <div className="space-y-5">
      <SectionIntro
        title={LIB_SECTION_META.links.label}
        description={LIB_SECTION_META.links.description}
      />

      <div className="flex flex-wrap items-center gap-2">
        <CategoryChip label="All" count={linkCategoryCounts.all ?? 0} active={linkCategory === "all"} color="#c084fc" onClick={() => onCategoryChange("all")} />
        {CATEGORY_ORDER.map((cat) => (
          <CategoryChip
            key={cat}
            label={CATEGORY_META[cat].label}
            count={linkCategoryCounts[cat] ?? 0}
            active={linkCategory === cat}
            color={CATEGORY_META[cat].color}
            onClick={() => onCategoryChange(linkCategory === cat ? "all" : cat)}
          />
        ))}
      </div>

      {linkTagsAll.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest mr-1" style={{ color: "#334155" }}>
            Tags
          </span>
          {linkTagsAll.map((tag) => {
            const active = linkTags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                onClick={() => onToggleTag(tag)}
                className="rounded-full px-3 py-1 text-xs font-medium"
                style={{
                  background: active ? "rgba(192,132,252,0.14)" : "rgba(255,255,255,0.03)",
                  color: active ? "#c084fc" : "#64748b",
                  border: `1px solid ${active ? "rgba(192,132,252,0.4)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                #{tag}
              </button>
            );
          })}
        </div>
      )}

      {loading ? (
        <LoadingState />
      ) : items.length === 0 ? (
        <EmptyState
          hasFilters={hasFilters}
          canManage={canManage}
          onAdd={onAdd}
          onClear={() => { onCategoryChange("all"); onClearTags(); }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <ResourceCard
              key={item.id}
              resource={item.resource}
              index={i}
              canManage={canManage}
              deleting={deletingId === item.resource.id}
              onEdit={() => onEdit(item.resource)}
              onDelete={() => onDelete(item.resource.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResults({
  results,
  query,
  loading,
  canManage,
  deletingId,
  onEdit,
  onDelete,
}: {
  results: ReturnType<typeof groupByKind>;
  query: string;
  loading: boolean;
  canManage: boolean;
  deletingId: string | null;
  onEdit: (r: Resource) => void;
  onDelete: (id: string) => void;
}) {
  const total = results.playbook.length + results.form.length + results.link.length;

  if (loading) return <LoadingState />;

  if (total === 0) {
    return (
      <EmptyPanel message={`No results for "${query}"`} hint="Try a different keyword — script names, roles, tags, or form titles." />
    );
  }

  return (
    <div className="space-y-8">
      <p className="text-sm" style={{ color: "#64748b" }}>
        {total} result{total === 1 ? "" : "s"} for <span style={{ color: "#e2e8f0" }}>&ldquo;{query}&rdquo;</span>
      </p>

      {results.playbook.length > 0 && (
        <SearchGroup title="Playbooks" count={results.playbook.length} color="#34d399">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.playbook.map((item, i) => (
              <LibraryDocCard key={item.id} item={item} index={i} />
            ))}
          </div>
        </SearchGroup>
      )}

      {results.form.length > 0 && (
        <SearchGroup title="Forms" count={results.form.length} color="#60a5fa">
          <div className="grid gap-4 sm:grid-cols-2">
            {results.form.map((item, i) => (
              <FormCard key={item.id} item={item} index={i} />
            ))}
          </div>
        </SearchGroup>
      )}

      {results.link.length > 0 && (
        <SearchGroup title="Links" count={results.link.length} color="#c084fc">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {results.link.map((item, i) => (
              <ResourceCard
                key={item.id}
                resource={item.resource}
                index={i}
                canManage={canManage}
                deleting={deletingId === item.resource.id}
                onEdit={() => onEdit(item.resource)}
                onDelete={() => onDelete(item.resource.id)}
              />
            ))}
          </div>
        </SearchGroup>
      )}
    </div>
  );
}

function SearchGroup({
  title, count, color, children,
}: { title: string; count: number; color: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "#cbd5e1" }}>
          {title}
        </h3>
        <span className="rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums" style={{ background: `${color}22`, color }}>
          {count}
        </span>
      </div>
      {children}
    </section>
  );
}

function SectionIntro({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>{title}</h3>
      <p className="text-sm mt-1" style={{ color: "#64748b" }}>{description}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-24" style={{ color: "#334155" }}>
      <svg className="w-5 h-5 animate-spin mr-3" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      <span className="text-sm font-medium">Loading…</span>
    </div>
  );
}

function EmptyPanel({ message, hint }: { message: string; hint?: string }) {
  return (
    <div
      className="rounded-2xl flex flex-col items-center justify-center text-center py-16 px-6"
      style={{ background: "#0a1628", border: "1px dashed rgba(255,255,255,0.08)" }}
    >
      <p className="text-sm font-semibold" style={{ color: "#94a3b8" }}>{message}</p>
      {hint && <p className="text-xs mt-1 max-w-sm" style={{ color: "#475569" }}>{hint}</p>}
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
      <div className="flex h-full flex-col rounded-[1.05rem] p-5" style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}>
        <div className="flex items-start justify-between gap-3">
          <span className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider" style={{ background: meta.tint, color: meta.color }}>
            {meta.label}
          </span>
          {canManage && (
            <div className="flex items-center gap-1" style={{ opacity: hover ? 1 : 0.35, transition: `opacity 300ms ${EASE}` }}>
              <button type="button" onClick={onEdit} title="Edit" className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ color: "#64748b", background: "rgba(255,255,255,0.04)" }}>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button type="button" onClick={onDelete} disabled={deleting} title="Delete" className="flex items-center justify-center w-7 h-7 rounded-lg" style={{ color: "#9f6464", background: "rgba(248,113,113,0.08)" }}>
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
        <h3 className="mt-4 text-base font-semibold leading-snug" style={{ color: "#e2e8f0" }}>{resource.title}</h3>
        {resource.description && (
          <p className="mt-1.5 text-sm leading-relaxed line-clamp-3" style={{ color: "#64748b" }}>{resource.description}</p>
        )}
        {resource.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {resource.tags.map((t) => (
              <span key={t} className="rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: "rgba(255,255,255,0.04)", color: "#475569" }}>#{t}</span>
            ))}
          </div>
        )}
        <a
          href={normalizeUrl(resource.url)}
          target={isInternalPath(resource.url) ? undefined : "_blank"}
          rel={isInternalPath(resource.url) ? undefined : "noopener noreferrer"}
          className="group mt-auto pt-5 flex items-center gap-2 text-sm font-semibold"
          style={{ color: "#c084fc" }}
        >
          <span className="truncate" style={{ maxWidth: "10rem" }}>
            {isInternalPath(resource.url) ? "Open in Mr. Waiz" : hostFromUrl(resource.url)}
          </span>
          <span className="flex items-center justify-center w-6 h-6 rounded-full ml-auto" style={{ background: "rgba(192,132,252,0.12)" }}>
            <svg className="w-3 h-3 group-hover:translate-x-[1px] group-hover:-translate-y-[1px]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
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
    <div className="rounded-2xl flex flex-col items-center justify-center text-center py-20 px-6" style={{ background: "#0a1628", border: "1px dashed rgba(255,255,255,0.08)" }}>
      <p className="text-sm font-semibold" style={{ color: "#94a3b8" }}>
        {hasFilters ? "No links match those filters" : "No external links yet"}
      </p>
      <p className="text-xs mt-1 max-w-xs" style={{ color: "#475569" }}>
        {hasFilters ? "Try clearing filters or a different category." : canManage ? "Add Google Docs, templates, or other bookmarks here." : "Admins can add external links for the team."}
      </p>
      {hasFilters ? (
        <button type="button" onClick={onClear} className="mt-5 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}>Clear filters</button>
      ) : canManage ? (
        <button type="button" onClick={onAdd} className="mt-5 rounded-full px-4 py-2 text-xs font-semibold" style={{ background: "#c084fc", color: "#1a1206" }}>Add Link</button>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(3,7,15,0.7)", backdropFilter: "blur(8px)" }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-[1.6rem] p-1.5" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.10)", boxShadow: "0 30px 70px rgba(0,0,0,0.6)", animation: `res-rise 400ms ${EASE} both` }} onClick={(e) => e.stopPropagation()}>
        <div className="rounded-[1.15rem] p-6" style={{ background: "#0a1628", boxShadow: "inset 0 1px 1px rgba(255,255,255,0.05)" }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>{form.id ? "Edit Link" : "Add Link"}</h3>
            <button type="button" onClick={onClose} className="flex items-center justify-center w-8 h-8 rounded-lg" style={{ color: "#475569", background: "rgba(255,255,255,0.04)" }}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="space-y-4">
            <Field label="Title">
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="e.g. Q2 Sales Playbook (Google Doc)" className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none" style={inputStyle} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Category">
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as Category }))} className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none cursor-pointer" style={inputStyle}>
                  {CATEGORY_ORDER.map((c) => (<option key={c} value={c}>{CATEGORY_META[c].label}</option>))}
                </select>
              </Field>
              <Field label="Tags" hint="comma-separated">
                <input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="sales, template" className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
              </Field>
            </div>
            <Field label="Link">
              <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://docs.google.com/…" className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none" style={inputStyle} />
            </Field>
            <Field label="Description" hint="optional">
              <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="What is this for and when should it be used?" rows={3} className="w-full rounded-lg px-3.5 py-2.5 text-sm outline-none resize-none" style={inputStyle} />
            </Field>
            {error && <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#f87171", background: "rgba(248,113,113,0.08)" }}>{error}</p>}
          </div>
          <div className="flex items-center justify-end gap-2 mt-6">
            <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium" style={{ color: "#94a3b8", background: "rgba(255,255,255,0.04)" }}>Cancel</button>
            <button type="button" onClick={onSave} disabled={saving} className="rounded-full px-5 py-2 text-sm font-semibold active:scale-[0.98]" style={{ background: "#f59e0b", color: "#1a1206", opacity: saving ? 0.7 : 1 }}>{saving ? "Saving…" : form.id ? "Save Changes" : "Add Link"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = { background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#e2e8f0" };

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
