"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ClientFile from "@/components/ClientFile";
import {
  METHOD_OPTIONS,
  REVENUE_SEGMENT_OPTIONS,
  REVENUE_TYPE_OPTIONS,
  revenueSegmentLabel,
  revenueTypeLabel,
} from "@/components/billing/billing-types";

const MUTED = "#475569";
const AMBER = "#f59e0b";

type LedgerRow = {
  id: string;
  client_id: string;
  client_name: string;
  billed_on: string;
  paid_on: string | null;
  amount: number;
  amount_paid: number | null;
  status: string;
  revenue_type: string | null;
  revenue_segment: string | null;
  term_months: number | null;
  processing_fee: number | null;
  method: string | null;
  stripe_invoice_id: string | null;
  is_first_payment: boolean | null;
  note: string | null;
};

type LedgerTotals = {
  count: number;
  billed: number;
  collected: number;
  fees: number;
  net: number;
};

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function monthsAgoYmd(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  scheduled: { color: "#818cf8", bg: "rgba(129,140,248,0.12)" },
  paid: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  partial: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  pending: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  overdue: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  failed: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  refunded: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

export default function FinanceRevenueLedger() {
  const [from, setFrom] = useState(() => monthsAgoYmd(12));
  const [to, setTo] = useState(() => todayYmd());
  const [revenueType, setRevenueType] = useState("");
  const [revenueSegment, setRevenueSegment] = useState("");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");
  const [qDebounced, setQDebounced] = useState("");
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [totals, setTotals] = useState<LedgerTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fileFor, setFileFor] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ from, to });
    if (revenueType) params.set("revenue_type", revenueType);
    if (revenueSegment) params.set("revenue_segment", revenueSegment);
    if (method) params.set("method", method);
    if (qDebounced) params.set("q", qDebounced);

    fetch(`/api/business/ledger?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load ledger");
        return r.json();
      })
      .then((d: { rows: LedgerRow[]; totals: LedgerTotals }) => {
        setRows(d.rows ?? []);
        setTotals(d.totals ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [from, to, revenueType, revenueSegment, method, qDebounced]);

  useEffect(() => {
    load();
  }, [load]);

  const fieldStyle = useMemo(
    () => ({
      background: "#050c18",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "#e2e8f0",
      borderRadius: "0.5rem",
      padding: "0.4rem 0.65rem",
      fontSize: "0.8125rem",
      outline: "none",
    }),
    [],
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
          Revenue ledger
        </h2>
        <p className="text-xs mt-0.5" style={{ color: MUTED }}>
          All client charges company-wide. File and collect in Admin → Client Billing; this is the CEO read view.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={fieldStyle} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Type</span>
          <select value={revenueType} onChange={(e) => setRevenueType(e.target.value)} style={fieldStyle}>
            <option value="">All types</option>
            {REVENUE_TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Segment</span>
          <select value={revenueSegment} onChange={(e) => setRevenueSegment(e.target.value)} style={fieldStyle}>
            <option value="">All segments</option>
            {REVENUE_SEGMENT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Method</span>
          <select value={method} onChange={(e) => setMethod(e.target.value)} style={fieldStyle}>
            <option value="">All methods</option>
            {METHOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>Search</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Client, Stripe id, note…"
            style={fieldStyle}
          />
        </label>
      </div>

      {totals && (
        <div className="flex flex-wrap gap-3">
          <Chip label="Rows" value={String(totals.count)} />
          <Chip label="Billed" value={money(totals.billed)} />
          <Chip label="Collected" value={money(totals.collected)} color="#38bdf8" />
          <Chip label="Fees" value={money(totals.fees)} color={AMBER} />
          <Chip label="Net" value={money(totals.net)} color="#22c55e" />
        </div>
      )}

      {loading ? (
        <p className="text-sm py-12 text-center" style={{ color: MUTED }}>Loading ledger…</p>
      ) : error ? (
        <p className="text-sm py-12 text-center" style={{ color: "#f87171" }}>{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm py-12 text-center" style={{ color: MUTED }}>
          No charges in this range. Adjust filters or file a billing in Client Billing.
        </p>
      ) : (
        <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#0a1628" }}>
                {["Date", "Client", "Type", "Amount", "Paid", "Fee", "Status", "Method / Stripe", "Note"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                    style={{ color: "#334155" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const st = STATUS_STYLE[r.status] ?? STATUS_STYLE.pending;
                const seg = revenueSegmentLabel(r.revenue_segment);
                const fee = Number(r.processing_fee) || 0;
                return (
                  <tr
                    key={r.id}
                    style={{
                      background: i % 2 === 0 ? "#080f1e" : "#060d1a",
                      borderTop: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#cbd5e1" }}>
                      {r.paid_on ?? r.billed_on}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setFileFor({ id: r.client_id, name: r.client_name })}
                        className="font-medium text-left hover:underline"
                        style={{ color: "#38bdf8" }}
                      >
                        {r.client_name}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span style={{ color: "#e2e8f0" }}>{revenueTypeLabel(r.revenue_type)}</span>
                      {seg && <span className="ml-1.5 text-xs" style={{ color: MUTED }}>· {seg}</span>}
                      {r.is_first_payment && (
                        <span className="ml-1.5 text-xs font-semibold" style={{ color: AMBER }}>first</span>
                      )}
                      {r.term_months != null && r.term_months > 0 && (
                        <span className="ml-1.5 text-xs" style={{ color: "#64748b" }}>{r.term_months} mo</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#e2e8f0" }}>{money(Number(r.amount))}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#38bdf8" }}>{money(Number(r.amount_paid) || 0)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: fee > 0 ? AMBER : MUTED }}>
                      {fee > 0 ? money(fee) : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className="px-2 py-0.5 rounded-full text-xs font-semibold"
                        style={{ color: st.color, background: st.bg }}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                      {r.method ?? "—"}
                      {r.stripe_invoice_id && (
                        <div className="text-xs mt-0.5 font-mono" style={{ color: "#475569" }}>
                          {r.stripe_invoice_id}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[14rem] truncate" style={{ color: "#64748b" }} title={r.note ?? undefined}>
                      {r.note || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {fileFor && (
        <ClientFile
          key={fileFor.id}
          clientId={fileFor.id}
          fallbackName={fileFor.name}
          initialTab="billing"
          onClose={() => setFileFor(null)}
        />
      )}
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div
      className="rounded-lg px-3 py-2"
      style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[10px] uppercase tracking-wider" style={{ color: MUTED }}>{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-0.5" style={{ color: color ?? "#e2e8f0" }}>{value}</p>
    </div>
  );
}
