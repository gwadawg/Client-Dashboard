"use client";

import { useEffect, useState } from "react";

type SetterRow = {
  setter: string;
  demos_booked: number;
  demos_showed: number;
  demo_show_rate: number | null;
};

export default function AcquisitionTeamBoard({ startDate, endDate }: { startDate: string; endDate: string }) {
  const [rows, setRows] = useState<SetterRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/acquisition/raw?type=appointments&from=${startDate}&to=${endDate}&limit=2000`)
      .then((r) => r.json())
      .then((d) => {
        const appts = (d.rows ?? []) as {
          appointment_type: string;
          status: string;
          setter_name: string | null;
          how_booked: string | null;
        }[];
        const bySetter = new Map<string, { booked: number; showed: number; taken: number }>();

        for (const a of appts) {
          if (a.appointment_type !== "demo") continue;
          const setter = a.setter_name?.trim();
          if (!setter || setter === "2") continue;
          const selfBooked = (a.how_booked ?? "").toLowerCase().includes("customer");
          if (selfBooked) continue;

          const bucket = bySetter.get(setter) ?? { booked: 0, showed: 0, taken: 0 };
          bucket.booked++;
          if (a.status === "showed") bucket.showed++;
          bySetter.set(setter, bucket);
        }

        const out: SetterRow[] = [...bySetter.entries()].map(([setter, v]) => ({
          setter,
          demos_booked: v.booked,
          demos_showed: v.showed,
          demo_show_rate: v.booked > 0 ? (v.showed / v.booked) * 100 : null,
        }));
        out.sort((a, b) => b.demos_showed - a.demos_showed);
        setRows(out);
      })
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
          <tr style={{ background: "#070f1d" }}>
            {["Setter", "Demos Booked", "Demos Showed", "Demo Show Rate"].map((h) => (
              <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: "#64748b" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.setter} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
              <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{r.setter}</td>
              <td className="px-4 py-3 tabular-nums" style={{ color: "#cbd5e1" }}>{r.demos_booked}</td>
              <td className="px-4 py-3 tabular-nums" style={{ color: "#cbd5e1" }}>{r.demos_showed}</td>
              <td className="px-4 py-3 tabular-nums" style={{ color: "#fbbf24" }}>
                {r.demo_show_rate != null ? `${r.demo_show_rate.toFixed(1)}%` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
