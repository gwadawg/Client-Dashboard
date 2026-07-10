"use client";

import { useEffect, useState } from "react";
import type { PayrollEmployeeHistoryRow } from "@/lib/payroll-runs";

function fmtMoney(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
}

type LineItem = {
  date?: string;
  type?: string;
  lead_name?: string | null;
  lead_phone?: string | null;
  client_name?: string;
  unit_pay?: number;
};

export default function EmployeePayHistory({
  agentId,
  compact = false,
}: {
  agentId: string;
  compact?: boolean;
}) {
  const [history, setHistory] = useState<PayrollEmployeeHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/payroll-runs/employee/${agentId}`)
      .then(r => r.json())
      .then(d => setHistory(d.history ?? []))
      .catch(() => setHistory([]))
      .finally(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return <p className="text-xs py-2" style={{ color: "#64748b" }}>Loading pay history…</p>;
  }

  if (history.length === 0) {
    return (
      <p className="text-xs py-2" style={{ color: "#64748b" }}>
        No finalized pay runs yet. History appears here after monthly payroll is submitted.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {!compact && (
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
          Pay history
        </p>
      )}
      {history.map(h => {
        const open = expandedId === h.payroll_run_id;
        const items = (h.line_items ?? []) as LineItem[];
        return (
          <div
            key={h.payroll_run_id}
            className="rounded-lg overflow-hidden"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              type="button"
              onClick={() => setExpandedId(open ? null : h.payroll_run_id)}
              className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: "#e2e8f0" }}>
                  {h.start_date.slice(0, 7)}
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "#64748b" }}>
                  {items.length} line item{items.length === 1 ? "" : "s"} · {new Date(h.finalized_at).toLocaleDateString()}
                </p>
              </div>
              <span className="text-sm font-bold tabular-nums shrink-0" style={{ color: "#22c55e" }}>
                {fmtMoney(h.total_pay)}
              </span>
            </button>
            {open && (
              <div className="px-3 pb-3 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {items.length === 0 ? (
                  <p className="text-xs pt-2" style={{ color: "#64748b" }}>Base + bonus only (no commission line items).</p>
                ) : (
                  <div className="overflow-x-auto pt-2">
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr>
                          {["Date", "Type", "Lead", "Pay"].map(col => (
                            <th key={col} className="text-left py-1 font-semibold uppercase tracking-wider" style={{ color: "#475569" }}>
                              {col}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, i) => (
                          <tr key={`${item.date}-${i}`} style={{ borderTop: "1px solid rgba(255,255,255,0.03)" }}>
                            <td className="py-1 pr-2" style={{ color: "#94a3b8" }}>{item.date ?? "—"}</td>
                            <td className="py-1 pr-2" style={{ color: "#cbd5e1" }}>{item.type ?? "—"}</td>
                            <td className="py-1 pr-2" style={{ color: "#e2e8f0" }}>{item.lead_name ?? "—"}</td>
                            <td className="py-1 text-right tabular-nums" style={{ color: "#22c55e" }}>
                              {fmtMoney(Number(item.unit_pay) || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
