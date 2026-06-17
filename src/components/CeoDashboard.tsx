"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import KpiSection from "./kpi/KpiSection";
import KpiCard from "./kpi/KpiCard";
import { reasonLabel } from "@/lib/client-feedback";
import type { BusinessMetrics } from "@/lib/business-metrics";

// ── Formatting helpers ────────────────────────────────────────────────────────

function money(v: number | null | undefined, opts: { round?: boolean } = {}): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const n = opts.round ? Math.round(v) : v;
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function pct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(1)}%`;
}

function ratio(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v.toFixed(2)}×`;
}

function int(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString();
}

/** "2026-06" -> "Jun 2026". */
function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

/** Trailing months (newest first) as YYYY-MM for the picker. */
function recentMonths(count: number): string[] {
  const now = new Date();
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const GOOD = "#34d399";
const BAD = "#f87171";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const MUTED = "#475569";

// ── Small presentational pieces ───────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  hint,
  accent,
  badge,
}: {
  label: string;
  value: string;
  sub?: string;
  hint?: string;
  accent?: boolean;
  badge?: string;
}) {
  return (
    <div
      className="relative rounded-xl p-4"
      style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {hint && (
        <span
          className="absolute top-2.5 right-2.5 flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-bold cursor-help select-none"
          style={{ background: "rgba(148,163,184,0.15)", color: "#64748b" }}
          title={hint}
          aria-label={hint}
        >
          i
        </span>
      )}
      <p className="text-[11px] uppercase tracking-wider pr-5" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="text-xl font-bold mt-1 tabular-nums" style={{ color: accent ? AMBER : "#e2e8f0" }}>
        {value}
      </p>
      {badge && (
        <p className="text-[10px] mt-1 font-medium" style={{ color: BLUE }}>
          {badge}
        </p>
      )}
      {sub && (
        <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

function PlaceholderCard({ label, need }: { label: string; need: string }) {
  return (
    <div
      className="relative rounded-xl p-4 select-none"
      style={{ background: "#070f1d", border: "1px dashed rgba(255,255,255,0.08)", opacity: 0.7 }}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider" style={{ color: "#3b4759" }}>
          {label}
        </p>
        <span
          className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide"
          style={{ background: "rgba(148,163,184,0.1)", color: "#475569" }}
        >
          needs data
        </span>
      </div>
      <p className="text-xl font-bold mt-1" style={{ color: "#2c3950" }}>
        —
      </p>
      <p className="text-[11px] mt-0.5 leading-snug" style={{ color: "#3b4759" }}>
        {need}
      </p>
    </div>
  );
}

function BreakdownBars({
  rows,
  empty,
}: {
  rows: { key: string; amount: number }[];
  empty: string;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  if (!rows.length || total <= 0) {
    return (
      <p className="text-sm py-4" style={{ color: MUTED }}>
        {empty}
      </p>
    );
  }
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const share = total > 0 ? (r.amount / total) * 100 : 0;
        return (
          <div key={r.key}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="capitalize" style={{ color: "#cbd5e1" }}>
                {r.key.replace(/_/g, " ")}
              </span>
              <span className="tabular-nums" style={{ color: "#e2e8f0" }}>
                {money(r.amount, { round: true })}{" "}
                <span style={{ color: MUTED }}>({share.toFixed(0)}%)</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.05)" }}>
              <div className="h-full rounded-full" style={{ width: `${share}%`, background: AMBER }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Charts ────────────────────────────────────────────────────────────────────

function TrendChart({ trend }: { trend: BusinessMetrics["trend"] }) {
  const data = trend.map((t) => ({ ...t, label: monthLabel(t.month).replace(" ", "\n") }));
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(m: string) => monthLabel(m).slice(0, 3)} />
          <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
          <Tooltip
            contentStyle={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
            labelFormatter={(label) => monthLabel(String(label))}
            formatter={(v, name) => [money(Number(v), { round: true }), name]}
          />
          <Bar dataKey="new_cash" stackId="cash" fill={AMBER} name="New cash" radius={[0, 0, 0, 0]} />
          <Bar dataKey="recurring_cash" stackId="cash" fill={BLUE} name="Recurring cash" radius={[3, 3, 0, 0]} />
          <Line type="monotone" dataKey="mrr_end" stroke={GOOD} strokeWidth={2} dot={false} name="MRR (reconstructed)" />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function MrrWaterfall({ bridge }: { bridge: BusinessMetrics["mrrBridge"] }) {
  // Build floating bars: a transparent "base" stacked under a colored "delta".
  const s = bridge.start_mrr;
  const afterNew = s + bridge.new_mrr;
  const afterExp = afterNew + bridge.expansion_mrr;
  const afterContr = afterExp - bridge.contraction_mrr;
  const afterLost = afterContr - bridge.lost_mrr;

  const data = [
    { name: "Start", base: 0, delta: s, fill: BLUE },
    { name: "New", base: s, delta: bridge.new_mrr, fill: GOOD },
    { name: "Expansion", base: afterNew, delta: bridge.expansion_mrr, fill: GOOD },
    { name: "Contraction", base: afterContr, delta: bridge.contraction_mrr, fill: BAD },
    { name: "Churned", base: afterLost, delta: bridge.lost_mrr, fill: BAD },
    { name: "End", base: 0, delta: bridge.end_mrr, fill: AMBER },
  ];

  return (
    <div style={{ height: 240 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="name" tick={{ fill: MUTED, fontSize: 10 }} />
          <YAxis tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
          <Tooltip
            cursor={{ fill: "rgba(255,255,255,0.03)" }}
            contentStyle={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            formatter={(v, _n, item) => [
              money(Number((item?.payload as { delta?: number } | undefined)?.delta ?? v), { round: true }),
              "MRR",
            ]}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" />
          <Bar dataKey="delta" stackId="w" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell key={i} fill={d.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CeoDashboard({ canViewRevenue = false }: { canViewRevenue?: boolean }) {
  const monthOptions = useMemo(() => recentMonths(18), []);
  const [month, setMonth] = useState(monthOptions[0]);
  const [data, setData] = useState<BusinessMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!canViewRevenue) {
      setLoading(false);
      setData(null);
      setError(null);
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    fetch(`/api/business?month=${month}&trend_months=12`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((d: BusinessMetrics) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [month, reloadKey, canViewRevenue]);

  const isCurrentMonth = month === monthOptions[0];

  if (!canViewRevenue) {
    return (
      <div className="py-16 text-center space-y-2 px-4">
        <p className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>Revenue data restricted</p>
        <p className="text-sm max-w-md mx-auto" style={{ color: "#475569" }}>
          The Business dashboard is only visible to the account owner and users with the &ldquo;View client revenue &amp; billing totals&rdquo; capability.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl">
      {/* Month picker */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
            Business Overview
          </h2>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            Agency-wide KPIs across the whole client book — recurring revenue, cash, churn, and risk.
          </p>
        </div>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="px-4 py-2 rounded-lg text-sm font-medium outline-none cursor-pointer"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
        >
          {monthOptions.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24">
          <div className="flex items-center gap-3" style={{ color: MUTED }}>
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-sm font-medium">Loading business metrics…</span>
          </div>
        </div>
      ) : error ? (
        <p className="text-sm py-10 text-center" style={{ color: BAD }}>
          {error}
        </p>
      ) : data ? (
        <>
          {/* ── Headline ── */}
          <KpiSection title="Headline">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <KpiCard
                label="Active MRR"
                value={money(data.headline.active_mrr, { round: true })}
                accent
                hint="Current monthly recurring revenue from all active clients."
              />
              <KpiCard
                label="Net New MRR"
                value={money(data.headline.net_new_mrr, { round: true })}
                hint="New MRR minus churned MRR (plus expansion, minus contraction) for the selected month."
              />
              <KpiCard
                label="Cash Collected"
                value={money(data.headline.cash_collected, { round: true })}
                hint="Cash actually received this month (paid_on), excluding ad-spend passthrough."
              />
              <KpiCard
                label="Gross Rev. Churn"
                value={pct(data.headline.gross_revenue_churn_pct)}
                hint="Churned MRR ÷ MRR at the start of the month."
              />
              <KpiCard label="Active Clients" value={int(data.headline.active_clients)} hint="Clients with lifecycle status = active." />
              <KpiCard
                label="ARPA"
                value={money(data.headline.arpa, { round: true })}
                hint="Average revenue per account = Active MRR ÷ Active Clients."
              />
            </div>
            {!isCurrentMonth && (
              <p className="text-[11px] mt-3" style={{ color: MUTED }}>
                Active MRR, ARPA, and client counts reflect the live portfolio now; movement, cash, and churn are for {monthLabel(month)}.
              </p>
            )}
          </KpiSection>

          {/* ── Revenue & Cash ── */}
          <KpiSection title="Revenue & Cash" showDivider footnote="Cash-collected basis (paid_on). Passthrough ad-spend reimbursements are excluded from all revenue figures.">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <StatCard
                label="New Cash"
                value={money(data.revenue.new_cash, { round: true })}
                sub={`New-logo cross-check: ${money(data.revenue.new_logo_cash, { round: true })}`}
                accent
                hint="Cash collected on front_end (new-client) billings. Cross-check = each client's first-ever paid billing landing this month."
              />
              <StatCard label="Recurring Cash" value={money(data.revenue.recurring_cash, { round: true })} hint="Cash collected on back_end (recurring retainer) billings." />
              <StatCard label="Total Cash" value={money(data.revenue.total_cash, { round: true })} hint="All revenue cash collected this month." />
              <StatCard label="Net of Fees" value={money(data.revenue.net_of_fees, { round: true })} hint="Total cash minus payment processing fees." />
              <StatCard label="Open AR" value={money(data.revenue.open_ar, { round: true })} hint="Outstanding unpaid balances (running total, all-time)." />
              <StatCard
                label="Overdue AR"
                value={money(data.revenue.overdue_ar, { round: true })}
                hint="Past-due / failed unpaid balances (running total, all-time)."
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-2 mt-4">
              <div className="rounded-xl p-5" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
                  Revenue by type
                </p>
                <BreakdownBars rows={data.revenue.by_type} empty="No cash collected this month." />
              </div>
              <div className="rounded-xl p-5" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
                  Revenue by lead source <span className="normal-case font-normal">(where your clients come from)</span>
                </p>
                <BreakdownBars rows={data.revenue.by_lead_source} empty="No lead-source data on this month's billings." />
              </div>
            </div>
          </KpiSection>

          {/* ── Cash & MRR trend ── */}
          <KpiSection title="12-Month Trend" showDivider footnote="Cash bars are exact (collected). The MRR line is reconstructed from net movement until monthly snapshots accrue.">
            <div className="rounded-xl p-4" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
              <TrendChart trend={data.trend} />
            </div>
          </KpiSection>

          {/* ── MRR Movement ── */}
          <KpiSection title="MRR Movement" showDivider footnote="Expansion / contraction become exact once monthly snapshots accrue; they read 0 until then.">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl p-4" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                <MrrWaterfall bridge={data.mrrBridge} />
              </div>
              <div className="grid grid-cols-2 gap-3 content-start">
                <StatCard label="Start MRR" value={money(data.mrrBridge.start_mrr, { round: true })} hint="Reconstructed MRR at the start of the month." />
                <StatCard label="New MRR" value={money(data.mrrBridge.new_mrr, { round: true })} hint="MRR from clients signed this month (date_signed)." />
                <StatCard label="Churned MRR" value={money(data.mrrBridge.lost_mrr, { round: true })} hint="MRR lost from clients that churned this month." />
                <StatCard label="End MRR" value={money(data.mrrBridge.end_mrr, { round: true })} accent hint="Current active MRR." />
              </div>
            </div>
          </KpiSection>

          {/* ── Churn & Retention ── */}
          <KpiSection title="Churn & Retention" showDivider>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <StatCard label="Logo Churn" value={pct(data.churn.logo_churn_pct)} hint="Clients churned this month ÷ active clients at month start." />
              <StatCard label="Revenue Churn" value={pct(data.churn.gross_revenue_churn_pct)} hint="Churned MRR ÷ MRR at month start." />
              <StatCard label="Net Rev. Retention" value={pct(data.churn.nrr_pct)} hint="(Start + expansion − contraction − churn) ÷ start. Partial until expansion is tracked." />
              <StatCard label="Quick Ratio" value={ratio(data.churn.quick_ratio)} hint="(New + expansion MRR) ÷ (churned + contraction MRR). Above 4 is healthy." />
              <StatCard
                label="Avg Tenure"
                value={data.churn.avg_tenure_months == null ? "—" : `${data.churn.avg_tenure_months.toFixed(1)} mo`}
                hint="Mean months from signing to churn (or today for active clients)."
              />
            </div>
            {data.churn.churned_clients.length > 0 && (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl p-5" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
                    Churn reasons ({monthLabel(month)})
                  </p>
                  <div className="space-y-2">
                    {data.churn.churn_by_reason.map((r) => (
                      <div key={r.reason_code} className="flex items-center justify-between text-sm gap-3">
                        <span style={{ color: "#cbd5e1" }}>{reasonLabel(r.reason_code)}</span>
                        <span className="tabular-nums flex-shrink-0" style={{ color: "#94a3b8" }}>
                          {r.count} · {money(r.lost_mrr, { round: true })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "#050c18" }}>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                          Churned ({data.churn.churned_count})
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                          Departure
                        </th>
                        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                          Reason
                        </th>
                        <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                          MRR lost
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.churn.churned_clients.map((c) => (
                        <tr key={c.client_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                          <td className="px-4 py-2.5" style={{ color: "#cbd5e1" }}>
                            {c.name}
                          </td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: "#64748b" }}>
                            {c.departure_status === "off_boarding" ? "Off-boarding" : "Churned"}
                          </td>
                          <td className="px-4 py-2.5 text-xs" style={{ color: "#64748b" }}>
                            {reasonLabel(c.reason_code)}
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: BAD }}>
                            {money(c.mrr, { round: true })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </KpiSection>

          {/* ── Clients & Portfolio Risk ── */}
          <KpiSection title="Clients & Portfolio Risk" showDivider>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard label="New Clients Signed" value={int(data.portfolio.new_clients_signed)} hint="Clients whose date_signed falls in the selected month." />
              <StatCard
                label="Top Client % of MRR"
                value={pct(data.portfolio.top_client_pct)}
                hint="Largest single client's share of active MRR — concentration risk."
              />
              <StatCard label="Top 5 % of MRR" value={pct(data.portfolio.top5_pct)} hint="Combined share of active MRR held by the five largest clients." />
              <StatCard
                label="At-Risk MRR (90d)"
                value={money(data.portfolio.contracts_ending_90d_mrr, { round: true })}
                hint="Active MRR on contracts ending within 90 days."
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-2 mt-4">
              <div className="rounded-xl p-5" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
                  Lifecycle funnel
                </p>
                <div className="space-y-2">
                  {data.portfolio.lifecycle.map((l) => (
                    <div key={l.status} className="flex items-center justify-between text-sm">
                      <span className="capitalize" style={{ color: "#cbd5e1" }}>
                        {l.status.replace(/_/g, " ")}
                      </span>
                      <span className="tabular-nums font-semibold" style={{ color: "#e2e8f0" }}>
                        {l.count}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-xl p-5" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
                  Active MRR by offer
                </p>
                <BreakdownBars
                  rows={data.portfolio.by_offer.map((o) => ({ key: `${o.offer} (${o.count})`, amount: o.mrr }))}
                  empty="No active clients."
                />
              </div>
            </div>

            {data.portfolio.contracts_ending_60d.length > 0 && (
              <div className="mt-4 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: "#050c18" }}>
                      <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                        Contracts ending ≤ 60 days
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                        Ends
                      </th>
                      <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                        MRR
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.portfolio.contracts_ending_60d.map((c) => (
                      <tr key={c.client_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                        <td className="px-4 py-2.5" style={{ color: "#cbd5e1" }}>
                          {c.name}
                        </td>
                        <td className="px-4 py-2.5 text-right" style={{ color: c.days_left <= 14 ? AMBER : "#94a3b8" }}>
                          {c.contract_end_date} ({c.days_left}d)
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums" style={{ color: "#e2e8f0" }}>
                          {money(c.mrr, { round: true })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </KpiSection>

          {/* ── Unit Economics & Finance ── */}
          <KpiSection
            title="Unit Economics & Finance"
            showDivider
            footnote="Computed from your imported / entered inputs (agency marketing spend, expenses, delivery costs, cash, headcount) combined with the live portfolio. Each card shows 'needs data' until its inputs exist."
          >
            <div className="flex justify-end mb-3">
              <button
                onClick={() => setEditing(true)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                style={{ background: "rgba(245,158,11,0.12)", color: AMBER }}
              >
                Edit inputs for {monthLabel(month)}
              </button>
            </div>
            <UnitEconomicsGrid u={data.unitEconomics} />
          </KpiSection>

          {/* ── Acquisition & Profit trend (renders only with data) ── */}
          {hasFinanceTrend(data.trend) && (
            <KpiSection title="Acquisition & Profit Trend" showDivider footnote="ROAS = new cash ÷ marketing spend. Profit = total cash − operating expenses. Builds up as you log monthly inputs.">
              <div className="rounded-xl p-4" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                <FinanceTrendChart trend={data.trend} />
              </div>
            </KpiSection>
          )}

          {editing && (
            <FinancialInputsEditor
              month={month}
              current={data.unitEconomics}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                setReloadKey((k) => k + 1);
              }}
            />
          )}
        </>
      ) : null}
    </div>
  );
}

// ── Unit economics grid (live values, else "needs data") ──────────────────────

function UnitEconomicsGrid({ u }: { u: BusinessMetrics["unitEconomics"] }) {
  const cacFromAcquisition =
    u.acquisition_pipeline_cac != null &&
    u.marketing_spend != null &&
    u.acquisition_ad_spend != null &&
    u.marketing_spend === u.acquisition_ad_spend;

  const cards: { label: string; value: string | null; hint: string; need: string; accent?: boolean; badge?: string }[] = [
    {
      label: "CAC",
      value: u.cac == null ? null : money(u.cac, { round: true }),
      hint: cacFromAcquisition
        ? "Meta ad spend ÷ acquisition closes this month (from acquisition pipeline — no manual marketing spend entered)."
        : "Agency marketing spend ÷ new clients signed this month.",
      need: "Needs marketing spend.",
      badge: cacFromAcquisition ? "Acquisition pipeline" : undefined,
    },
    {
      label: "LTV",
      value: u.ltv == null ? null : money(u.ltv, { round: true }),
      hint: u.ltv_is_margin_based ? "ARPA × avg tenure × gross margin." : "ARPA × avg tenure (revenue LTV; add delivery costs for margin-based).",
      need: "Needs ARPA + tenure.",
    },
    {
      label: "LTV : CAC",
      value: u.ltv_cac == null ? null : ratio(u.ltv_cac),
      hint: "LTV ÷ CAC. Above 3× is healthy.",
      need: "Needs LTV + CAC.",
      accent: true,
    },
    {
      label: "CAC Payback",
      value: u.cac_payback_months == null ? null : `${u.cac_payback_months.toFixed(1)} mo`,
      hint: "Months of gross profit per account to recover CAC.",
      need: "Needs CAC.",
    },
    {
      label: "ROAS (new cash)",
      value: u.roas == null ? null : ratio(u.roas),
      hint: "New cash collected this month ÷ marketing spend.",
      need: "Needs marketing spend.",
    },
    {
      label: "Gross Margin",
      value: u.gross_margin_pct == null ? null : pct(u.gross_margin_pct),
      hint: "(Total cash − delivery costs) ÷ total cash.",
      need: "Needs delivery costs.",
    },
    {
      label: "Operating Profit",
      value: u.operating_profit == null ? null : money(u.operating_profit, { round: true }),
      hint: "Total cash collected − operating expenses.",
      need: "Needs operating expenses.",
      accent: true,
    },
    {
      label: "Profit Margin",
      value: u.profit_margin_pct == null ? null : pct(u.profit_margin_pct),
      hint: "Operating profit ÷ total cash.",
      need: "Needs operating expenses.",
    },
    {
      label: "Runway",
      value:
        u.is_profitable && u.cash_balance != null
          ? "Profitable"
          : u.runway_months == null
            ? null
            : `${u.runway_months.toFixed(1)} mo`,
      hint: "Cash balance ÷ monthly net burn (expenses − cash collected).",
      need: "Needs cash balance + expenses.",
    },
    {
      label: "Rule of 40",
      value: u.rule_of_40 == null ? null : u.rule_of_40.toFixed(0),
      hint: "Annualized MRR growth % + profit margin %. Target ≥ 40.",
      need: "Needs expenses (for margin).",
    },
    {
      label: "Revenue / Head",
      value: u.revenue_per_head == null ? null : money(u.revenue_per_head, { round: true }),
      hint: "Annualized MRR ÷ headcount.",
      need: "Needs headcount.",
    },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {cards.map((c) =>
        c.value == null ? (
          <PlaceholderCard key={c.label} label={c.label} need={c.need} />
        ) : (
          <StatCard key={c.label} label={c.label} value={c.value} hint={c.hint} accent={c.accent} badge={c.badge} />
        ),
      )}
    </div>
  );
}

function hasFinanceTrend(trend: BusinessMetrics["trend"]): boolean {
  return trend.some((t) => t.marketing_spend != null || t.operating_expenses != null);
}

function FinanceTrendChart({ trend }: { trend: BusinessMetrics["trend"] }) {
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="month" tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(m: string) => monthLabel(m).slice(0, 3)} />
          <YAxis yAxisId="money" tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`} />
          <YAxis yAxisId="ratio" orientation="right" tick={{ fill: MUTED, fontSize: 10 }} tickFormatter={(v: number) => `${v.toFixed(1)}×`} />
          <Tooltip
            contentStyle={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: "#94a3b8" }}
            labelFormatter={(label) => monthLabel(String(label))}
            formatter={(v, name) => {
              if (v == null) return ["—", name];
              if (name === "ROAS") return [ratio(Number(v)), name];
              return [money(Number(v), { round: true }), name];
            }}
          />
          <Bar yAxisId="money" dataKey="marketing_spend" fill={MUTED} name="Marketing spend" radius={[3, 3, 0, 0]} />
          <Bar yAxisId="money" dataKey="operating_profit" name="Operating profit" radius={[3, 3, 0, 0]}>
            {trend.map((t, i) => (
              <Cell key={i} fill={(t.operating_profit ?? 0) >= 0 ? GOOD : BAD} />
            ))}
          </Bar>
          <Line yAxisId="ratio" type="monotone" dataKey="roas" stroke={AMBER} strokeWidth={2} dot={false} name="ROAS" connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Financial inputs editor ───────────────────────────────────────────────────

const INPUT_FIELDS: { key: string; label: string; help: string; prefix?: string }[] = [
  { key: "marketing_spend", label: "Marketing / acquisition spend", help: "What you spent to win new clients this month.", prefix: "$" },
  { key: "operating_expenses", label: "Operating expenses", help: "Total company costs this month (for profit).", prefix: "$" },
  { key: "delivery_costs", label: "Delivery costs (COGS)", help: "Cost to fulfill client work (for gross margin).", prefix: "$" },
  { key: "cash_balance", label: "Cash balance (month end)", help: "Cash on hand (for runway).", prefix: "$" },
  { key: "headcount", label: "Headcount", help: "Team size (for revenue per head)." },
];

function FinancialInputsEditor({
  month,
  current,
  onClose,
  onSaved,
}: {
  month: string;
  current: BusinessMetrics["unitEconomics"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const initial: Record<string, string> = {
    marketing_spend: current.marketing_spend?.toString() ?? "",
    operating_expenses: current.operating_expenses?.toString() ?? "",
    delivery_costs: current.delivery_costs?.toString() ?? "",
    cash_balance: current.cash_balance?.toString() ?? "",
    headcount: current.headcount?.toString() ?? "",
  };
  const [form, setForm] = useState<Record<string, string>>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    try {
      for (const f of INPUT_FIELDS) {
        const raw = form[f.key].trim();
        const before = initial[f.key].trim();
        if (raw === before) continue; // unchanged
        const res = await fetch("/api/business/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ metric_key: f.key, month, value_numeric: raw === "" ? null : Number(raw) }),
        });
        if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="rounded-xl w-full max-w-lg p-5 space-y-3"
        style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
            Financial inputs — {monthLabel(month)}
          </h3>
          <p className="text-xs mt-0.5" style={{ color: MUTED }}>
            These power CAC, LTV:CAC, ROAS, gross margin, profit, and runway. Leave blank to clear. Imports write to the same place.
          </p>
        </div>
        {INPUT_FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="text-[11px] uppercase tracking-wider" style={{ color: MUTED }}>
              {f.label}
            </span>
            <div className="mt-1 flex items-center gap-2">
              {f.prefix && <span style={{ color: "#64748b" }}>{f.prefix}</span>}
              <input
                type="number"
                inputMode="decimal"
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                placeholder="—"
              />
            </div>
            <span className="text-[10px]" style={{ color: "#3b4759" }}>
              {f.help}
            </span>
          </label>
        ))}
        {err && <p className="text-xs" style={{ color: BAD }}>{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: "#94a3b8" }}>
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: AMBER, color: "#0a1424", opacity: saving ? 0.6 : 1 }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
