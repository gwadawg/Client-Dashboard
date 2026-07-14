"use client";

import { useEffect, useState } from "react";
import {
  DIAL_EXAMPLE_GRADE_OPTIONS,
  DIAL_EXAMPLE_LEAD_TYPE_OPTIONS,
  dialExampleDomainLabel,
  formatDialExampleSeconds,
  type DialExampleDomain,
  type DialExampleRow,
} from "@/lib/dial-examples";

type Props = {
  domain: DialExampleDomain;
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
  maxWidth: 320,
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

export default function DialExamplesLibrary({ domain, canManage, startDate, endDate }: Props) {
  const [rows, setRows] = useState<DialExampleRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [leadTypeFilter, setLeadTypeFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    setPage(1);
  }, [leadTypeFilter, gradeFilter, search, startDate, endDate, domain]);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({
      domain,
      page: String(page),
    });
    if (leadTypeFilter) params.set("leadType", leadTypeFilter);
    if (gradeFilter) params.set("grade", gradeFilter);
    if (search.trim()) params.set("search", search.trim());
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    fetch(`/api/dial-examples?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [domain, leadTypeFilter, gradeFilter, search, page, startDate, endDate, reloadKey]);

  const totalPages = Math.max(1, Math.ceil(total / 50));
  const isCallCenter = domain === "call_center";

  async function handleDelete(row: DialExampleRow) {
    if (!confirm(`Remove "${row.title}" from examples?`)) return;
    setDeletingId(row.id);
    const res = await fetch(`/api/dial-examples/${row.id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const d = await res.json();
      alert(d.error ?? "Failed to delete");
      return;
    }
    setReloadKey(k => k + 1);
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold" style={{ color: "#f1f5f9" }}>
          {dialExampleDomainLabel(domain)} Examples
        </h1>
        <p className="text-sm mt-1" style={{ color: "#64748b" }}>
          {isCallCenter
            ? "Graded call-rep dials saved from Recordings. Separate from team meetings and client CRM calls."
            : "Graded B2B sales dials and documented calls. Save from Acquisition dials is next — library is ready now."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          placeholder="Search title, rep, lead…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={fieldStyle}
        />
        <span className="text-sm ml-auto" style={{ color: "#334155" }}>
          {total.toLocaleString()} examples
        </span>
      </div>

      {isCallCenter && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setLeadTypeFilter("")}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              color: !leadTypeFilter ? "#f59e0b" : "#64748b",
              background: !leadTypeFilter ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${!leadTypeFilter ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            All leads
          </button>
          {DIAL_EXAMPLE_LEAD_TYPE_OPTIONS.map(o => (
            <button
              key={o.value}
              type="button"
              onClick={() => setLeadTypeFilter(leadTypeFilter === o.value ? "" : o.value)}
              className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{
                color: leadTypeFilter === o.value ? "#f59e0b" : "#64748b",
                background: leadTypeFilter === o.value ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${leadTypeFilter === o.value ? "rgba(245,158,11,0.35)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {o.value}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setGradeFilter("")}
          className="text-xs font-semibold px-3 py-1.5 rounded-full"
          style={{
            color: !gradeFilter ? "#34d399" : "#64748b",
            background: !gradeFilter ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
            border: `1px solid ${!gradeFilter ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)"}`,
          }}
        >
          All grades
        </button>
        {DIAL_EXAMPLE_GRADE_OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => setGradeFilter(gradeFilter === o.value ? "" : o.value)}
            className="text-xs font-semibold px-3 py-1.5 rounded-full"
            style={{
              color: gradeFilter === o.value ? "#34d399" : "#64748b",
              background: gradeFilter === o.value ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${gradeFilter === o.value ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.08)"}`,
            }}
            title={o.label}
          >
            {o.value}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          <p className="text-sm py-12 text-center" style={{ color: "#334155" }}>Loading…</p>
        ) : rows.length === 0 ? (
          <div
            className="rounded-xl py-12 text-center px-4"
            style={{ border: "1px solid rgba(255,255,255,0.06)", background: "#080f1e" }}
          >
            <p className="text-sm" style={{ color: "#334155" }}>
              {isCallCenter
                ? "No examples yet. Open Recordings and click Save on a strong dial."
                : "No B2B examples yet. Library is ready — Save from Acquisition dials comes next."}
            </p>
          </div>
        ) : (
          rows.map(row => (
            <div
              key={row.id}
              className="rounded-xl px-4 py-3"
              style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold truncate" style={{ color: "#e2e8f0" }}>
                      {row.title}
                    </span>
                    {row.lead_type && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ color: "#f59e0b", background: "rgba(245,158,11,0.12)" }}
                      >
                        {row.lead_type}
                      </span>
                    )}
                    {row.grade && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ color: "#34d399", background: "rgba(52,211,153,0.12)" }}
                      >
                        {row.grade}
                      </span>
                    )}
                    {row.call_type && (
                      <span
                        className="text-xs px-2 py-0.5 rounded-full font-semibold"
                        style={{ color: "#a78bfa", background: "rgba(167,139,250,0.12)" }}
                      >
                        {row.call_type}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    {formatDateTime(row.called_at)}
                    {row.agent_name ? ` · ${row.agent_name}` : ""}
                    {row.duration_seconds != null && row.duration_seconds > 0
                      ? ` · ${formatDialExampleSeconds(row.duration_seconds)}`
                      : ""}
                  </p>
                  {row.summary && (
                    <p className="text-xs mt-1.5" style={{ color: "#94a3b8" }}>
                      {row.summary.length > 140 ? `${row.summary.slice(0, 140)}…` : row.summary}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <a
                    href={row.recording_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold"
                    style={{ color: "#f59e0b" }}
                  >
                    Listen
                  </a>
                  {canManage && (
                    <button
                      type="button"
                      disabled={deletingId === row.id}
                      onClick={() => handleDelete(row)}
                      className="text-xs"
                      style={{ color: "#f87171", opacity: deletingId === row.id ? 0.5 : 1 }}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-end">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}
          >
            ← Prev
          </button>
          <span className="text-sm" style={{ color: "#334155" }}>
            Page {page} of {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
