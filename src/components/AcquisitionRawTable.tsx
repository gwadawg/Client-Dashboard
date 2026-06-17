"use client";

import { useEffect, useState } from "react";

type Props = {
  type: "leads" | "appointments" | "offers" | "closes" | "ads" | "dials";
  startDate: string;
  endDate: string;
};

const COLUMNS: Record<Props["type"], { key: string; label: string }[]> = {
  leads: [
    { key: "created_at", label: "Created" },
    { key: "lead_name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "source", label: "Source" },
    { key: "offer_interest", label: "Offer" },
    { key: "ghl_contact_id", label: "GHL ID" },
  ],
  appointments: [
    { key: "booked_at", label: "Booked" },
    { key: "scheduled_at", label: "Scheduled" },
    { key: "appointment_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "setter_name", label: "Setter" },
    { key: "call_taken_by", label: "Taken By" },
    { key: "lead_name", label: "Lead" },
    { key: "qualified", label: "Qualified" },
    { key: "closer_form", label: "Closer form" },
  ],
  offers: [
    { key: "offered_at", label: "Date" },
    { key: "offer_type", label: "Offer" },
    { key: "is_closed", label: "Closed" },
    { key: "cash_collected", label: "Cash" },
    { key: "setter_name", label: "Setter" },
    { key: "offered_by", label: "Closer" },
  ],
  closes: [
    { key: "closed_at", label: "Closed" },
    { key: "close_source", label: "Source" },
    { key: "offer_type", label: "Offer" },
    { key: "client_id", label: "Client ID" },
  ],
  ads: [
    { key: "insight_date", label: "Date" },
    { key: "platform", label: "Platform" },
    { key: "adset_name", label: "Ad Set" },
    { key: "ad_name", label: "Ad" },
    { key: "amount_spent", label: "Spend" },
  ],
  dials: [
    { key: "occurred_at", label: "When" },
    { key: "agent_name", label: "Agent" },
    { key: "phone", label: "Phone" },
    { key: "duration_seconds", label: "Duration" },
    { key: "outcome", label: "Outcome" },
  ],
};

function fmt(key: string, v: unknown): string {
  if (v == null) return "—";
  if (key === "is_closed") return v ? "Y" : "N";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && key.includes("spent")) return `$${v.toLocaleString()}`;
  if (typeof v === "string" && v.includes("T")) return v.slice(0, 16).replace("T", " ");
  return String(v);
}

function CloserFormCell({ row }: { row: Record<string, unknown> }) {
  if (row.status !== "showed") {
    return <span style={{ color: "#334155" }}>—</span>;
  }
  if (row.closer_form_done === true) {
    return <span className="text-xs font-medium" style={{ color: "#22c55e" }}>Done</span>;
  }
  const url = row.closer_form_url;
  if (typeof url === "string" && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-semibold whitespace-nowrap"
        style={{ color: "#38bdf8" }}
      >
        Fill out form
      </a>
    );
  }
  return <span className="text-xs" style={{ color: "#f87171" }}>No GHL contact</span>;
}

export default function AcquisitionRawTable({ type, startDate, endDate }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const q = new URLSearchParams({ type, from: startDate, to: endDate, limit: "1000" });
    fetch(`/api/acquisition/raw?${q}`)
      .then((r) => r.json())
      .then((d) => {
        setRows(d.rows ?? []);
        setTotal(d.total ?? 0);
      })
      .finally(() => setLoading(false));
  }, [type, startDate, endDate]);

  const cols = COLUMNS[type];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="px-4 py-3 flex justify-between" style={{ background: "#0a1424" }}>
        <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
          {total.toLocaleString()} rows {total > rows.length ? `(showing ${rows.length})` : ""}
        </p>
      </div>
      {loading ? (
        <p className="p-8 text-center text-sm" style={{ color: "#64748b" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#070f1d" }}>
                {cols.map((c) => (
                  <th key={c.key} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: "#64748b" }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  {cols.map((c) => (
                    <td key={c.key} className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#cbd5e1" }}>
                      {c.key === "closer_form" ? (
                        <CloserFormCell row={row} />
                      ) : (
                        fmt(c.key, row[c.key])
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
