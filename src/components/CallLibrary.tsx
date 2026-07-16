"use client";

import { useEffect, useMemo, useState } from "react";
import CallLibraryDetail from "@/components/CallLibraryDetail";
import CallLibraryFormFields from "@/components/CallLibraryFormFields";
import {
  TEAM_CALL_TYPE_OPTIONS,
  teamCallTypeLabel,
  type TeamCallRow,
} from "@/lib/team-calls";
import {
  defaultTeamCallDraft,
  rowToTeamCallDraft,
  teamCallDraftToApiBody,
  validateTeamCallDraft,
  type TeamCallDraft,
} from "@/lib/team-call-draft";

type Props = {
  canManage: boolean;
  startDate: string;
  endDate: string;
};

const fieldStyle = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.875rem",
  outline: "none",
  width: "100%",
} as const;

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function preview(text: string | null | undefined, max = 100): string {
  if (!text) return "—";
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export default function CallLibrary({ canManage, startDate, endDate }: Props) {
  const [rows, setRows] = useState<TeamCallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [callTypeFilter, setCallTypeFilter] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);

  const [selectedCall, setSelectedCall] = useState<TeamCallRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [modalMode, setModalMode] = useState<"add" | "edit" | null>(null);
  const [editingRow, setEditingRow] = useState<TeamCallRow | null>(null);
  const [draft, setDraft] = useState<TeamCallDraft>(defaultTeamCallDraft());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [callTypeFilter, tagFilter, search, startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (callTypeFilter) params.set("callType", callTypeFilter);
    if (tagFilter) params.set("tag", tagFilter);
    if (search.trim()) params.set("search", search.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    fetch(`/api/team-calls?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setAllTags(d.tags ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [callTypeFilter, tagFilter, search, page, startDate, endDate, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / 50));

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of rows) {
      for (const tag of row.tags ?? []) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return counts;
  }, [rows]);

  function openAdd() {
    const presetType = TEAM_CALL_TYPE_OPTIONS.some(o => o.value === callTypeFilter)
      ? callTypeFilter
      : "coaching";
    setDraft(defaultTeamCallDraft(presetType));
    setEditingRow(null);
    setModalMode("add");
    setSelectedCall(null);
  }

  function openEdit(row: TeamCallRow) {
    setEditingRow(row);
    setDraft(rowToTeamCallDraft(row));
    setModalMode("edit");
    setSelectedCall(null);
  }

  function closeModal() {
    if (saving) return;
    setModalMode(null);
    setEditingRow(null);
  }

  async function saveModal() {
    const err = validateTeamCallDraft(draft);
    if (err) {
      alert(err);
      return;
    }

    setSaving(true);
    try {
      const body = teamCallDraftToApiBody(draft);

      if (modalMode === "add") {
        const res = await fetch("/api/team-calls", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(d.error ?? `Failed to save call (${res.status})`);
          return;
        }
      } else if (modalMode === "edit" && editingRow) {
        const res = await fetch(`/api/team-calls/${editingRow.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(d.error ?? `Failed to save call (${res.status})`);
          return;
        }
      }

      closeModal();
      setReloadKey(k => k + 1);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save call");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: TeamCallRow) {
    if (!confirm(`Delete "${row.title}" from the library?`)) return;
    setDeleting(true);
    const res = await fetch(`/api/team-calls/${row.id}`, { method: "DELETE" });
    const d = await res.json();
    setDeleting(false);
    if (!res.ok) {
      alert(d.error ?? "Failed to delete");
      return;
    }
    setSelectedCall(null);
    setReloadKey(k => k + 1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "#f1f5f9" }}>Team Calls</h1>
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          Internal trainings, coaching, interviews, and high-level reflection / goal-setting calls — not client or sales dials. Dial examples live under Agents → Examples and Acquisition → Call Examples.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="text-sm font-semibold px-4 py-2 rounded-lg"
            style={{
              color: "#38bdf8",
              background: "rgba(56,189,248,0.12)",
              border: "1px solid rgba(56,189,248,0.3)",
            }}
          >
            + Add call
          </button>
        )}
        <input
          type="search"
          placeholder="Search transcript, takeaways, participants…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ ...fieldStyle, maxWidth: 320 }}
        />
        <span className="text-sm ml-auto" style={{ color: "#334155" }}>
          {total.toLocaleString()} calls
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCallTypeFilter("")}
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            color: !callTypeFilter ? "#38bdf8" : "#64748b",
            background: !callTypeFilter ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${!callTypeFilter ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          All types
        </button>
        {TEAM_CALL_TYPE_OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => setCallTypeFilter(o.value)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              color: callTypeFilter === o.value ? "#a78bfa" : "#64748b",
              background: callTypeFilter === o.value ? "rgba(167,139,250,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${callTypeFilter === o.value ? "rgba(167,139,250,0.35)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTagFilter("")}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              color: !tagFilter ? "#34d399" : "#64748b",
              background: !tagFilter ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${!tagFilter ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            All tags
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              type="button"
              onClick={() => setTagFilter(tagFilter === tag ? "" : tag)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                color: tagFilter === tag ? "#34d399" : "#64748b",
                background: tagFilter === tag ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${tagFilter === tag ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {tag}
              {tagCounts.has(tag) ? ` (${tagCounts.get(tag)})` : ""}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm py-12 text-center" style={{ color: "#334155" }}>Loading…</p>
        ) : rows.length === 0 ? (
          <div
            className="rounded-xl py-12 text-center"
            style={{ border: "1px solid rgba(255,255,255,0.06)", background: "#080f1e" }}
          >
            <p className="text-sm" style={{ color: "#334155" }}>
              No calls found.{" "}
              {canManage && (
                <button type="button" onClick={openAdd} className="font-semibold" style={{ color: "#38bdf8" }}>
                  Add one
                </button>
              )}
            </p>
          </div>
        ) : (
          rows.map(row => (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCall(row)}
              onKeyDown={e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCall(row);
                }
              }}
              className="w-full text-left rounded-xl px-4 py-3 transition-colors hover:brightness-110 cursor-pointer"
              style={{
                background: "#080f1e",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: "#e2e8f0" }}>
                      {row.title}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                      style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)" }}
                    >
                      {teamCallTypeLabel(row.call_type)}
                    </span>
                    {row.is_private && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold shrink-0"
                        style={{ color: "#f87171", background: "rgba(248,113,113,0.12)" }}
                      >
                        Private
                      </span>
                    )}
                    {row.recording_url && (
                      <span className="text-xs shrink-0" style={{ color: "#f59e0b" }} title="Has recording">
                        ● Rec
                      </span>
                    )}
                    {(row.highlights?.length ?? 0) > 0 && (
                      <span className="text-xs shrink-0" style={{ color: "#64748b" }}>
                        {row.highlights.length} highlight{row.highlights.length === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    {formatDateTime(row.called_at)}
                    {row.participants ? ` · ${row.participants}` : ""}
                  </p>
                  <p className="text-xs mt-1.5" style={{ color: "#94a3b8" }}>
                    {preview(row.summary || row.highlights_text || row.transcript)}
                  </p>
                  {row.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {row.tags.map(tag => (
                        <span
                          key={tag}
                          className="text-xs px-1.5 py-0.5 rounded"
                          style={{ color: "#38bdf8", background: "rgba(56,189,248,0.08)" }}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {canManage && (
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      openEdit(row);
                    }}
                    className="text-xs font-semibold shrink-0 px-2 py-1 rounded"
                    style={{ color: "#64748b" }}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="text-sm px-3 py-1 rounded disabled:opacity-40"
            style={{ color: "#64748b" }}
          >
            Previous
          </button>
          <span className="text-sm" style={{ color: "#475569" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="text-sm px-3 py-1 rounded disabled:opacity-40"
            style={{ color: "#64748b" }}
          >
            Next
          </button>
        </div>
      )}

      {selectedCall && (
        <CallLibraryDetail
          call={selectedCall}
          canManage={canManage}
          onEdit={() => openEdit(selectedCall)}
          onDelete={() => handleDelete(selectedCall)}
          onClose={() => setSelectedCall(null)}
          deleting={deleting}
        />
      )}

      {modalMode && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={closeModal}
        >
          <div
            className="w-full max-w-lg rounded-xl p-5"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4" style={{ color: "#f1f5f9" }}>
              {modalMode === "add" ? "Add call to library" : "Edit call"}
            </h2>
            <CallLibraryFormFields draft={draft} onChange={setDraft} disabled={saving} />
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={saveModal}
                disabled={saving}
                className="text-sm font-semibold px-4 py-2 rounded-lg"
                style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)", border: "1px solid rgba(56,189,248,0.3)" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={closeModal}
                disabled={saving}
                className="text-sm px-4 py-2 rounded-lg ml-auto"
                style={{ color: "#64748b" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
