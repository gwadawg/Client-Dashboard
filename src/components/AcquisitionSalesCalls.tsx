"use client";

import { useEffect, useState } from "react";

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
  acquisition_leads?: { lead_name: string | null; phone: string | null } | { lead_name: string | null; phone: string | null }[] | null;
};

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

    fetch(`/api/acquisition/calls?${q}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, typeFilter, includeDials]);

  return (
    <div className="space-y-4">
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
                  {["When", "Type", "Lead", "Rep", "Status", "Links", "Disposition"].map((h) => (
                    <th key={h} className="text-left px-4 py-2 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-white/5" style={{ color: "#cbd5e1" }}>
                    <td className="px-4 py-2 whitespace-nowrap">{formatWhen(row.called_at)}</td>
                    <td className="px-4 py-2 capitalize">{row.call_type}</td>
                    <td className="px-4 py-2">{leadName(row)}</td>
                    <td className="px-4 py-2">{row.handled_by ?? "—"}</td>
                    <td className="px-4 py-2">{row.status}</td>
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
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-slate-500">No calls in range</td>
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
