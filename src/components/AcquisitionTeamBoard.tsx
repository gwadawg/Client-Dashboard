"use client";

import { useEffect, useState } from "react";

type SetterRow = {
  setter: string;
  demos_booked: number;
  demos_showed: number;
  demos_taken_place: number;
  demo_show_rate: number | null;
};

export default function AcquisitionTeamBoard({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [rows, setRows] = useState<SetterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/acquisition/team-stats?from=${startDate}&to=${endDate}`)
      .then(r => r.json())
      .then(d => setRows(d.setters ?? []))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  if (loading) {
    return <p className="text-sm py-8 text-center" style={{ color: "#64748b" }}>Loading team stats…</p>;
  }

  if (!rows.length) {
    return <p className="text-sm py-8 text-center" style={{ color: "#64748b" }}>No setter-attributed demos in range.</p>;
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: "#0f1a2e", color: "#64748b" }}>
            {["Setter", "Demos Booked", "Demos Showed", "Show Rate"].map(h => (
              <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.setter} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{row.setter}</td>
              <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{row.demos_booked}</td>
              <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{row.demos_showed}</td>
              <td className="px-4 py-3" style={{ color: "#f59e0b" }}>
                {row.demo_show_rate != null ? `${row.demo_show_rate.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
