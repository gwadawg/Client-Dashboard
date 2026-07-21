"use client";

import { useCallback, useEffect, useState } from "react";
import {
  EOD_DEPARTMENT_LABELS,
  eodFormHref,
  humanizeEodResponses,
  type EodDepartment,
  type EodFormSubmission,
} from "@/lib/eod-forms";

type Row = EodFormSubmission & { agent_name?: string | null };

export default function EodHistorySection({
  agentId,
  department,
  compact = false,
}: {
  agentId: string;
  /** When set, only show this department; otherwise all. */
  department?: EodDepartment | null;
  compact?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ agent_id: agentId });
    if (department) qs.set("department", department);
    fetch(`/api/eod?${qs}`)
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Failed to load EOD history");
        return j as { submissions: Row[] };
      })
      .then(d => setRows(d.submissions ?? []))
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [agentId, department]);

  useEffect(() => {
    load();
  }, [load]);

  const formLink = department ? eodFormHref(department) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#94a3b8" }}>
          EOD history
        </p>
        {formLink && (
          <a
            href={formLink}
            target="_blank"
            rel="noreferrer"
            className="text-[11px] font-semibold"
            style={{ color: "#38bdf8" }}
          >
            Open form ↗
          </a>
        )}
      </div>

      {loading && (
        <p className="text-xs" style={{ color: "#64748b" }}>Loading…</p>
      )}
      {error && (
        <p className="text-xs" style={{ color: "#fca5a5" }}>{error}</p>
      )}
      {!loading && !error && rows.length === 0 && (
        <p className="text-xs" style={{ color: "#64748b" }}>No EOD submissions yet.</p>
      )}

      <div className="space-y-2">
        {rows.map(row => {
          const open = expanded === row.id;
          const rating = Number(row.responses?.productivity_rating);
          return (
            <div
              key={row.id}
              className="rounded-lg overflow-hidden"
              style={{ border: "1px solid rgba(255,255,255,0.06)", background: compact ? "transparent" : "#050c18" }}
            >
              <button
                type="button"
                onClick={() => setExpanded(open ? null : row.id)}
                className="w-full text-left px-3 py-2 flex items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>
                    {row.work_date}
                    <span className="text-xs font-normal ml-2" style={{ color: "#64748b" }}>
                      {EOD_DEPARTMENT_LABELS[row.department]}
                    </span>
                  </p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                    {Number.isFinite(rating) ? `Productivity ${rating}/10` : "—"}
                  </p>
                </div>
                <span className="text-xs shrink-0" style={{ color: "#64748b" }}>
                  {open ? "Hide" : "View"}
                </span>
              </button>
              {open && (
                <div className="px-3 pb-3 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {humanizeEodResponses(row.department, row.responses ?? {}).map((item, i) => {
                    if (item.section && item.value === "") {
                      return (
                        <p
                          key={`${row.id}-sec-${i}`}
                          className="text-[10px] font-semibold uppercase tracking-wider pt-2"
                          style={{ color: "#64748b" }}
                        >
                          {item.section}
                        </p>
                      );
                    }
                    return (
                      <div key={`${row.id}-${i}`}>
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
