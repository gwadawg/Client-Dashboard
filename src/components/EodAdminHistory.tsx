"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EOD_DEPARTMENT_LABELS,
  EOD_DEPARTMENTS,
  eodFormHref,
  type EodDepartment,
  type EodFormSubmission,
} from "@/lib/eod-forms";
import { humanizeEodResponses } from "@/lib/eod-forms";

type Row = EodFormSubmission & { agent_name?: string | null };

export default function EodAdminHistory() {
  const [department, setDepartment] = useState<EodDepartment | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams();
    if (department) qs.set("department", department);
    if (from) qs.set("from", from);
    if (to) qs.set("to", to);
    fetch(`/api/eod?${qs}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load");
        return j as { submissions: Row[] };
      })
      .then(d => setRows(d.submissions ?? []))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [department, from, to]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>
            Department
          </label>
          <select
            value={department}
            onChange={e => setDepartment(e.target.value as EodDepartment | "")}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          >
            <option value="">All</option>
            {EOD_DEPARTMENTS.map(d => (
              <option key={d} value={d}>{EOD_DEPARTMENT_LABELS[d]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>From</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider mb-1" style={{ color: "#64748b" }}>To</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-sm"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          />
        </div>
        <button
          type="button"
          onClick={load}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ background: "rgba(56,189,248,0.15)", color: "#7dd3fc" }}
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {EOD_DEPARTMENTS.map(d => (
          <a
            key={d}
            href={eodFormHref(d)}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-medium px-2.5 py-1 rounded-md"
            style={{ background: "rgba(255,255,255,0.04)", color: "#94a3b8" }}
          >
            {EOD_DEPARTMENT_LABELS[d]} form ↗
          </a>
        ))}
      </div>

      {loading && <p className="text-sm" style={{ color: "#64748b" }}>Loading…</p>}
      {error && <p className="text-sm" style={{ color: "#fca5a5" }}>{error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p className="text-sm" style={{ color: "#64748b" }}>No EOD submissions in this range.</p>
      )}

      <div className="space-y-2">
        {rows.map(row => {
          const open = expanded === row.id;
          const rating = Number(row.responses?.productivity_rating);
          return (
            <div
              key={row.id}
              className="rounded-xl overflow-hidden"
              style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : row.id)}
                className="w-full text-left px-4 py-3 flex justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                    {row.agent_name ?? "Unknown"} · {row.work_date}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    {EOD_DEPARTMENT_LABELS[row.department]}
                    {Number.isFinite(rating) ? ` · ${rating}/10` : ""}
                  </p>
                </div>
                <span className="text-xs" style={{ color: "#64748b" }}>{open ? "Hide" : "View"}</span>
              </button>
              {open && (
                <div className="px-4 pb-4 grid gap-2 sm:grid-cols-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {humanizeEodResponses(row.department, row.responses ?? {}).map((item, i) => {
                    if (item.section && item.value === "") {
                      return (
                        <p
                          key={`s-${i}`}
                          className="sm:col-span-2 text-[10px] font-semibold uppercase tracking-wider pt-2"
                          style={{ color: "#64748b" }}
                        >
                          {item.section}
                        </p>
                      );
                    }
                    return (
                      <div key={i}>
                        <p className="text-[11px]" style={{ color: "#94a3b8" }}>{item.label}</p>
                        <p className="text-xs whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>{item.value}</p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
