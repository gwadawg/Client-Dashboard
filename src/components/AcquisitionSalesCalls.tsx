"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

type CallDetails = {
  call_rating?: number | null;
  lead_quality_score?: string | null;
  surface_objection?: string | null;
  root_cause_objection?: string | null;
};

type CallRow = {
  id: string;
  call_type: string;
  called_at: string;
  status: string;
  handled_by: string | null;
  co_handler: string | null;
  recording_url: string | null;
  transcript_url: string | null;
  disposition: string | null;
  notes: string | null;
  details?: CallDetails | null;
  acquisition_leads?: { lead_name: string | null; phone: string | null } | { lead_name: string | null; phone: string | null }[] | null;
};

function reflectionSummary(row: CallRow): string | null {
  const d = row.details;
  if (!d?.call_rating) return null;
  const parts = [`${d.call_rating}/10`];
  if (d.lead_quality_score) parts.push(`Lead ${d.lead_quality_score}`);
  return parts.join(" · ");
}

type Props = {
  startDate: string;
  endDate: string;
};

function leadName(row: CallRow): string {
  const l = row.acquisition_leads;
  if (!l) return "—";
  if (Array.isArray(l)) return l[0]?.lead_name ?? "—";
  return l.lead_name ?? "—";
}

function formatWhen(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const TYPE_FILTERS = ["all", "intro", "demo", "followup", "bamfam", "organic", "other"] as const;

export default function AcquisitionSalesCalls({ startDate, endDate }: Props) {
  const searchParams = useSearchParams();
  const highlightedCallId = searchParams.get("call_id");
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const [rows, setRows] = useState<CallRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<(typeof TYPE_FILTERS)[number]>("all");
  const [includeDials, setIncludeDials] = useState(false);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ from: startDate, to: endDate, limit: "200" });
    if (typeFilter !== "all") q.set("call_type", typeFilter);
    if (includeDials) q.set("include_dials", "true");
    if (highlightedCallId) q.set("call_id", highlightedCallId);

    fetch(`/api/acquisition/calls?${q}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, typeFilter, includeDials, highlightedCallId]);

  useEffect(() => {
    if (!highlightedCallId || loading) return;
    const el = rowRefs.current[highlightedCallId];
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedCallId, loading, rows]);

  return (
    <div className="space-y-4">
      {highlightedCallId && (
        <div
          className="px-4 py-2.5 rounded-xl text-sm"
          style={{
            background: "rgba(52,211,153,0.1)",
            border: "1px solid rgba(52,211,153,0.35)",
            color: "#6ee7b7",
          }}
        >
          Showing documented call linked from Appointments.
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {TYPE_FILTERS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTypeFilter(t)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium capitalize"
            style={{
              background: typeFilter === t ? "rgba(56,189,248,0.15)" : "rgba(255,255,255,0.04)",
              color: typeFilter === t ? "#38bdf8" : "#94a3b8",
              border: `1px solid ${typeFilter === t ? "rgba(56,189,248,0.3)" : "transparent"}`,
            }}
          >
            {t === "all" ? "All types" : t}
          </button>
        ))}
        <label className="flex items-center gap-2 text-xs text-slate-400 ml-2">
          <input type="checkbox" checked={includeDials} onChange={(e) => setIncludeDials(e.target.checked)} />
          Include dials
        </label>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 py-3" style={{ background: "#0a1424" }}>
          <p className="text-sm text-slate-400">{total.toLocaleString()} calls</p>
        </div>
        {loading ? (
          <p className="p-8 text-center text-sm text-slate-500">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "#0f1a2e", color: "#64748b" }}>
                  {["When", "Type", "Lead", "Rep", "Status", "Rating", "Links", "Disposition"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const highlighted = row.id === highlightedCallId;
                  return (
                    <tr
                      key={row.id}
                      ref={el => {
                        rowRefs.current[row.id] = el;
                      }}
                      className="border-t border-white/5"
                      style={{
                        color: "#cbd5e1",
                        background: highlighted ? "rgba(52,211,153,0.12)" : undefined,
                        boxShadow: highlighted ? "inset 3px 0 0 #34d399" : undefined,
                      }}
                    >
                      <td className="px-4 py-2 whitespace-nowrap">{formatWhen(row.called_at)}</td>
                      <td className="px-4 py-2 capitalize">{row.call_type}</td>
                      <td className="px-4 py-2">{leadName(row)}</td>
                      <td className="px-4 py-2">{row.handled_by ?? "—"}</td>
                      <td className="px-4 py-2">{row.status}</td>
                      <td className="px-4 py-2 whitespace-nowrap text-slate-400">
                        {reflectionSummary(row) ?? "—"}
                      </td>
                      <td className="px-4 py-2 space-x-2">
                        {row.recording_url && (
                          <a href={row.recording_url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline">Recording</a>
                        )}
                        {row.transcript_url && (
                          <a href={row.transcript_url} target="_blank" rel="noreferrer" className="text-violet-400 hover:underline">Transcript</a>
                        )}
                        {!row.recording_url && !row.transcript_url && "—"}
                      </td>
                      <td className="px-4 py-2 max-w-[200px] truncate">{row.disposition ?? row.notes ?? "—"}</td>
                    </tr>
                  );
                })}
                {!rows.length && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-500">No calls in range</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
