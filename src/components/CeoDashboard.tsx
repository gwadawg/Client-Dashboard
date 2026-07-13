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
import MetricInfoTip, { type MetricHint } from "./kpi/MetricInfoTip";
import FinanceRevenueLedger from "./FinanceRevenueLedger";
import ExpenseManager from "./ExpenseManager";
import { reasonLabel } from "@/lib/client-feedback";
import {
  listRecentMonths,
  listRecentQuarters,
  listRecentYears,
  type BusinessMetrics,
  type PeriodGranularity,
} from "@/lib/business-metrics";

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

function quarterLabel(key: string): string {
  const m = key.match(/^(\d{4})-Q([1-4])$/i);
  if (!m) return key;
  return `Q${m[2]} ${m[1]}`;
}

function yearLabel(key: string, currentYear: string): string {
  return key === currentYear ? `YTD ${key}` : `Full year ${key}`;
}

const GOOD = "#34d399";
const BAD = "#f87171";
const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const MUTED = "#475569";

/** MoM % change helper for KpiCard deltas. */
function momDelta(
  current: number,
  previous: number | null | undefined,
  opts: { invert?: boolean; asMoney?: boolean } = {},
): { text: string; good: boolean | null } | undefined {
  if (previous == null || !Number.isFinite(previous)) return undefined;
  const diff = current - previous;
  if (Math.abs(diff) < 0.5 && !opts.asMoney) return { text: "flat", good: null };
  if (opts.asMoney) {
    const sign = diff >= 0 ? "+" : "−";
    const good = opts.invert ? diff < 0 : diff > 0;
    return {
      text: `${sign}${money(Math.abs(diff), { round: true })}`,
      good: Math.abs(diff) < 1 ? null : good,
    };
  }
  if (previous === 0) return undefined;
  const pctChange = (diff / Math.abs(previous)) * 100;
  const sign = pctChange >= 0 ? "+" : "";
  const good = opts.invert ? pctChange < 0 : pctChange > 0;
  return {
    text: `${sign}${pctChange.toFixed(1)}%`,
    good: Math.abs(pctChange) < 0.05 ? null : good,
  };
}

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
  hint?: MetricHint | string;
  accent?: boolean;
  badge?: string;
}) {
  return (
    <div
      className="relative rounded-xl p-4"
      style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      {hint && (
        <span className="absolute top-2.5 right-2.5 z-10">
          <MetricInfoTip hint={hint} />
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

export type CeoDashboardMode = "dashboard" | "raw";

export default function CeoDashboard({
  canViewRevenue = false,
  mode = "dashboard",
}: {
  canViewRevenue?: boolean;
  mode?: CeoDashboardMode;
}) {
  const [ledgerTab, setLedgerTab] = useState<"revenue" | "expenses">("revenue");
  const monthOptions = useMemo(() => listRecentMonths(18), []);
  const quarterOptions = useMemo(() => listRecentQuarters(8), []);
  const yearOptions = useMemo(() => listRecentYears(4), []);
  const [granularity, setGranularity] = useState<PeriodGranularity>("month");
  const [periodKey, setPeriodKey] = useState(monthOptions[0]);
  const [data, setData] = useState<BusinessMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const periodOptions =
    granularity === "quarter" ? quarterOptions : granularity === "ytd" ? yearOptions : monthOptions;

  function switchGranularity(next: PeriodGranularity) {
    setGranularity(next);
    if (next === "month") setPeriodKey(monthOptions[0]);
    else if (next === "quarter") setPeriodKey(quarterOptions[0]);
    else setPeriodKey(yearOptions[0]);
  }

  useEffect(() => {
    if (!canViewRevenue || mode !== "dashboard") {
      if (!canViewRevenue) {
        setLoading(false);
        setData(null);
        setError(null);
      }
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    const qs = new URLSearchParams({
      granularity,
      period: periodKey,
      trend_months: "12",
    });
    fetch(`/api/business?${qs}`)
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
  }, [granularity, periodKey, reloadKey, canViewRevenue, mode]);

  const periodLabel = data?.period.label ?? periodKey;
  const editMonth = data?.period.endMonth ?? (granularity === "month" ? periodKey : monthOptions[0]);
  const isLivePeriod =
    granularity === "month"
      ? periodKey === monthOptions[0]
      : data?.period.months.includes(monthOptions[0]) ?? true;
  const showPeriodScopeNote = !isLivePeriod || granularity !== "month";
  const scopeWord = granularity === "month" ? "month" : "period";

  if (!canViewRevenue) {
    return (
      <div className="py-16 text-center space-y-2 px-4">
        <p className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>Revenue data restricted</p>
        <p className="text-sm max-w-md mx-auto" style={{ color: "#475569" }}>
          Finance is only visible to the account owner and users with the &ldquo;View client revenue &amp; billing totals&rdquo; capability.
        </p>
      </div>
    );
  }

  if (mode === "raw") {
    const LEDGER_TABS = [
      { key: "revenue" as const, label: "Revenue", hint: "Billing ledger" },
      { key: "expenses" as const, label: "Expenses", hint: "Charge ledger" },
    ];
    return (
      <div className="space-y-6 max-w-7xl">
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1"
            style={{ color: AMBER }}
          >
            Executive
          </p>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#f1f5f9" }}>
            Raw Data
          </h1>
          <p className="text-xs mt-1 max-w-xl leading-relaxed" style={{ color: MUTED }}>
            Billing and expense ledgers that feed the CEO Dashboard.
          </p>
        </div>

        <div className="flex gap-1 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          {LEDGER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setLedgerTab(t.key)}
              className="px-4 py-2.5 text-left"
              style={{
                color: ledgerTab === t.key ? "#e2e8f0" : "#64748b",
                borderBottom: `2px solid ${ledgerTab === t.key ? AMBER : "transparent"}`,
              }}
            >
              <span className="block text-sm font-medium leading-none">{t.label}</span>
              <span
                className="block text-[10px] mt-1 leading-none"
                style={{ color: ledgerTab === t.key ? "#94a3b8" : "#475569" }}
              >
                {t.hint}
              </span>
            </button>
          ))}
        </div>

        {ledgerTab === "revenue" ? <FinanceRevenueLedger /> : <ExpenseManager />}
      </div>
    );
  }

  const prevTrend = data?.trend?.length
    ? data.trend[data.trend.length - 2]
    : undefined;
  const mrrSpark = data?.trend?.map((t) => t.mrr_end) ?? [];
  const cashSpark = data?.trend?.map((t) => t.cash_collected) ?? [];
  const profitSpark = data?.trend?.map((t) => t.operating_profit) ?? [];

  return (
    <div className="space-y-6 max-w-7xl">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-[0.2em] mb-1"
            style={{ color: AMBER }}
          >
            Executive
          </p>
          <h1 className="text-2xl font-semibold tracking-tight" style={{ color: "#f1f5f9" }}>
            CEO Dashboard
          </h1>
          <p className="text-xs mt-1 max-w-xl leading-relaxed" style={{ color: MUTED }}>
            High-level books — recurring revenue, cash, unit economics, and portfolio risk.
          </p>
        </div>
      </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
                {periodLabel}
              </h2>
              <p className="text-xs mt-0.5" style={{ color: MUTED }}>
                Six signals that matter — then the bridge, profit trend, and risk.
              </p>
            </div>
            <div className="flex items-center flex-wrap gap-2">
              <div
                className="flex rounded-lg p-0.5"
                style={{
                  background: "#0f2040",
                  border: "1px solid rgba(255,255,255,0.12)",
                }}
              >
                {(
                  [
                    { key: "month", label: "Month" },
                    { key: "quarter", label: "Quarter" },
                    { key: "ytd", label: "YTD" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => switchGranularity(opt.key)}
                    className="px-3 py-1.5 rounded-md text-xs font-semibold"
                    style={{
                      background: granularity === opt.key ? "rgba(245,158,11,0.18)" : "transparent",
                      color: granularity === opt.key ? AMBER : "#94a3b8",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <select
                value={periodKey}
                onChange={(e) => setPeriodKey(e.target.value)}
                className="px-4 py-2 rounded-lg text-sm font-medium outline-none cursor-pointer"
                style={{
                  background: "#0f2040",
                  border: "1px solid rgba(255,255,255,0.12)",
                  color: "#e2e8f0",
                }}
              >
                {periodOptions.map((k) => (
                  <option key={k} value={k}>
                    {granularity === "quarter"
                      ? quarterLabel(k)
                      : granularity === "ytd"
                        ? yearLabel(k, yearOptions[0])
                        : monthLabel(k)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex items-center gap-3" style={{ color: MUTED }}>
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="text-sm font-medium">Loading CEO metrics…</span>
              </div>
            </div>
          ) : error ? (
            <p className="text-sm py-10 text-center" style={{ color: BAD }}>
              {error}
            </p>
          ) : data ? (
            <>
              {/* ── V1 cockpit: 6 headline KPIs ── */}
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
                <KpiCard
                  label="Active MRR"
                  value={money(data.headline.active_mrr, { round: true })}
                  accent
                  hint={{
                    definition: "Live recurring revenue from clients currently marked active.",
                    source: "Client Roster → clients.mrr where lifecycle_status = active (not billings).",
                    formula: "SUM(clients.mrr) for active clients",
                  }}
                  delta={momDelta(data.headline.active_mrr, prevTrend?.mrr_end, { asMoney: true })}
                  spark={mrrSpark}
                />
                <KpiCard
                  label="Cash Collected"
                  value={money(data.headline.cash_collected, { round: true })}
                  hint={{
                    definition: `Cash that actually landed in the selected ${scopeWord}.`,
                    source: "Finance Revenue ledger → client_billings (paid_on, amount_paid).",
                    formula:
                      `SUM(amount_paid − passthrough_amount) where paid_on is in ${scopeWord} and revenue_type ≠ passthrough / not refunded`,
                  }}
                  delta={
                    granularity === "month"
                      ? momDelta(data.headline.cash_collected, prevTrend?.cash_collected, {
                          asMoney: true,
                        })
                      : undefined
                  }
                  spark={cashSpark}
                />
                {data.unitEconomics.operating_profit == null ? (
                  <PlaceholderCard
                    label="Operating Profit"
                    need={`Roll up expenses for ${granularity === "month" ? "this month" : "months in this period"}.`}
                  />
                ) : (
                  <KpiCard
                    label="Operating Profit"
                    value={money(data.unitEconomics.operating_profit, { round: true })}
                    hint={{
                      definition: `Cash profit after company operating costs for the ${scopeWord}.`,
                      source:
                        "Cash from client_billings; OpEx from business_expenses → Roll up → business_metrics.operating_expenses.",
                      formula: "Total Cash Collected − Operating Expenses (CAC + fulfillment + overhead, excl. exclude_from_pnl)",
                    }}
                    delta={
                      granularity === "month"
                        ? momDelta(
                            data.unitEconomics.operating_profit,
                            prevTrend?.operating_profit ?? undefined,
                            { asMoney: true },
                          )
                        : undefined
                    }
                    spark={profitSpark}
                  />
                )}
                <KpiCard
                  label="Net New MRR"
                  value={money(data.headline.net_new_mrr, { round: true })}
                  hint={{
                    definition: `Change in recurring book this ${scopeWord} (not cash collected).`,
                    source:
                      "Roster date_signed (new) + client_monthly_snapshots (expansion/contraction) + churn form effective date / churned_at (lost).",
                    formula: "New MRR + Expansion − Contraction − Lost MRR",
                  }}
                  delta={
                    data.headline.gross_revenue_churn_pct != null
                      ? {
                          text: `${pct(data.headline.gross_revenue_churn_pct)} churn`,
                          good:
                            data.headline.gross_revenue_churn_pct <= 5
                              ? true
                              : data.headline.gross_revenue_churn_pct >= 10
                                ? false
                                : null,
                        }
                      : undefined
                  }
                />
                {data.unitEconomics.cac == null ? (
                  <PlaceholderCard
                    label="CAC"
                    need="Needs marketing spend + signed closes."
                  />
                ) : (
                  <KpiCard
                    label="CAC"
                    value={money(data.unitEconomics.cac, { round: true })}
                    hint={{
                      definition: `Cost to acquire one signed close this ${scopeWord}.`,
                      source: `Marketing spend = expense rollup ceo_bucket=cac (or Meta ads if no rollup). Closes = acquisition_closes (${data.unitEconomics.cac_closes} this ${scopeWord}).`,
                      formula: "Marketing Spend ÷ Signed Closes (non-dismissed acquisition closes)",
                    }}
                    delta={
                      data.unitEconomics.ltv_cac != null
                        ? {
                            text: `LTV:CAC ${ratio(data.unitEconomics.ltv_cac)}`,
                            good:
                              data.unitEconomics.ltv_cac >= 3
                                ? true
                                : data.unitEconomics.ltv_cac < 1.5
                                  ? false
                                  : null,
                          }
                        : undefined
                    }
                  />
                )}
                <KpiCard
                  label="Signed Closes"
                  value={int(data.unitEconomics.cac_closes)}
                  hint={{
                    definition: `Acquisition deals closed this ${scopeWord} — the CAC denominator.`,
                    source: `Acquisition → acquisition_closes (closed_at in ${scopeWord}, not dismissed/deleted).`,
                    formula: `COUNT(acquisition_closes) where closed_at in ${scopeWord}`,
                  }}
                  delta={{
                    text: `${int(data.portfolio.new_clients_signed)} on roster`,
                    good: null,
                  }}
                />
              </div>
              {showPeriodScopeNote && (
                <p className="text-[11px]" style={{ color: MUTED }}>
                  Active MRR / clients are live now; cash, churn, closes, and movement are for{" "}
                  {periodLabel}.
                </p>
              )}

              {/* ── Primary composition: bridge + cash/profit ── */}
              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: "#64748b" }}
                    >
                      MRR bridge
                    </p>
                    <p className="text-[10px]" style={{ color: MUTED }}>
                      Start → End
                    </p>
                  </div>
                  <MrrWaterfall bridge={data.mrrBridge} />
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <MiniStat label="Start" value={money(data.mrrBridge.start_mrr, { round: true })} />
                    <MiniStat label="New" value={money(data.mrrBridge.new_mrr, { round: true })} good />
                    <MiniStat
                      label="Lost"
                      value={money(data.mrrBridge.lost_mrr, { round: true })}
                      bad
                    />
                    <MiniStat
                      label="End"
                      value={money(data.mrrBridge.end_mrr, { round: true })}
                      accent
                    />
                  </div>
                </div>

                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p
                      className="text-xs font-bold uppercase tracking-widest"
                      style={{ color: "#64748b" }}
                    >
                      Cash vs profit
                    </p>
                    <p className="text-[10px]" style={{ color: MUTED }}>
                      12 months
                    </p>
                  </div>
                  {hasFinanceTrend(data.trend) ? (
                    <FinanceTrendChart trend={data.trend} />
                  ) : (
                    <TrendChart trend={data.trend} />
                  )}
                  <p className="text-[10px] leading-relaxed" style={{ color: MUTED }}>
                    {hasFinanceTrend(data.trend)
                      ? "Marketing spend + operating profit from expense rollups; ROAS = new cash ÷ marketing spend."
                      : "Cash bars are exact. Profit/CAC trend appears after you roll up expenses for at least one month."}
                  </p>
                </div>
              </div>

              {/* ── Risk strip ── */}
              <div
                className="rounded-xl p-4"
                style={{
                  background: "linear-gradient(135deg, #0c1528 0%, #0a1424 100%)",
                  border: "1px solid rgba(245,158,11,0.15)",
                }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-3"
                  style={{ color: AMBER }}
                >
                  Portfolio risk
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <StatCard
                    label="Top Client %"
                    value={pct(data.portfolio.top_client_pct)}
                    hint={{
                      definition: "How dependent the book is on the single largest client.",
                      source: "Client Roster → active clients.mrr.",
                      formula: "MAX(active client MRR) ÷ Active MRR × 100",
                    }}
                  />
                  <StatCard
                    label="Top 5 %"
                    value={pct(data.portfolio.top5_pct)}
                    hint={{
                      definition: "Concentration across the five largest active accounts.",
                      source: "Client Roster → active clients.mrr.",
                      formula: "SUM(top 5 active MRR) ÷ Active MRR × 100",
                    }}
                  />
                  <StatCard
                    label="At-Risk MRR (90d)"
                    value={money(data.portfolio.contracts_ending_90d_mrr, { round: true })}
                    hint={{
                      definition: "Recurring revenue that could churn if contracts ending soon are not renewed.",
                      source: "Client Roster → clients.contract_end_date + mrr (active only).",
                      formula: "SUM(mrr) where lifecycle = active and contract_end_date within 90 days",
                    }}
                  />
                  <StatCard
                    label="Overdue AR"
                    value={money(data.revenue.overdue_ar, { round: true })}
                    hint={{
                      definition: "Unpaid invoices past due (cash still owed).",
                      source: "client_billings unpaid balances (all-time, not month-scoped).",
                      formula: "SUM(amount − amount_paid) where status is overdue/failed and not voided/refunded/passthrough",
                    }}
                  />
                </div>
              </div>

              {/* ── Drill-down sections ── */}
              <KpiSection
                title="Revenue & Cash"
                showDivider
                footnote="Cash-collected basis (paid_on). Passthrough ad-spend reimbursements are excluded."
              >
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <StatCard
                    label="New Cash"
                    value={money(data.revenue.new_cash, { round: true })}
                    sub={`New-logo cross-check: ${money(data.revenue.new_logo_cash, { round: true })}`}
                    accent
                    hint={{
                      definition: "Front-end cash from new-client charges this month.",
                      source: "client_billings where revenue_segment = front_end and paid_on in month.",
                      formula:
                        "SUM(amount_paid − passthrough_amount) for front_end. Cross-check = first-ever paid billing per client landing this month.",
                    }}
                  />
                  <StatCard
                    label="Recurring Cash"
                    value={money(data.revenue.recurring_cash, { round: true })}
                    hint={{
                      definition: "Cash from ongoing retainer / back-end billings.",
                      source: "client_billings where revenue_segment = back_end and paid_on in month.",
                      formula: "SUM(amount_paid − passthrough_amount) for back_end",
                    }}
                  />
                  <StatCard
                    label="Total Cash"
                    value={money(data.revenue.total_cash, { round: true })}
                    hint={{
                      definition: "All non-passthrough cash collected in the month.",
                      source: "client_billings (paid_on).",
                      formula: "New Cash + Recurring Cash + any untagged-segment cash (still in total)",
                    }}
                  />
                  <StatCard
                    label="Net of Fees"
                    value={money(data.revenue.net_of_fees, { round: true })}
                    hint={{
                      definition: "Cash after payment-processor fees.",
                      source: "client_billings.amount_paid and processing_fee.",
                      formula: "SUM(amount_paid − passthrough_amount − processing_fee) for revenue collections in month",
                    }}
                  />
                  <StatCard
                    label="Open AR"
                    value={money(data.revenue.open_ar, { round: true })}
                    hint={{
                      definition: "All outstanding unpaid balances (not only this month).",
                      source: "client_billings unpaid rows.",
                      formula: "SUM(amount − amount_paid) for open non-passthrough billings",
                    }}
                  />
                  <StatCard
                    label="ARPA"
                    value={money(data.headline.arpa, { round: true })}
                    hint={{
                      definition: "Average revenue per active account.",
                      source: "Client Roster active mrr + active client count.",
                      formula: "Active MRR ÷ Active Clients",
                    }}
                  />
                </div>
                <div className="grid gap-4 lg:grid-cols-2 mt-4">
                  <div
                    className="rounded-xl p-5"
                    style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-3"
                      style={{ color: MUTED }}
                    >
                      Revenue by type
                    </p>
                    <BreakdownBars rows={data.revenue.by_type} empty={`No cash collected this ${scopeWord}.`} />
                  </div>
                  <div
                    className="rounded-xl p-5"
                    style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-3"
                      style={{ color: MUTED }}
                    >
                      Revenue by lead source
                    </p>
                    <BreakdownBars
                      rows={data.revenue.by_lead_source}
                      empty={`No lead-source data on this ${scopeWord}'s billings.`}
                    />
                  </div>
                </div>
              </KpiSection>

              <KpiSection title="Churn & Retention" showDivider>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                  <StatCard
                    label="Logo Churn"
                    value={pct(data.churn.logo_churn_pct)}
                    hint={{
                      definition: "Share of the starting book that left this month (by logo count).",
                      source: "Churn form effective date (preferred) → clients.churned_at → status history. Not billing charges.",
                      formula: "Departed clients ÷ (Active now − signed this month + departed this month) × 100",
                    }}
                  />
                  <StatCard
                    label="Revenue Churn"
                    value={pct(data.churn.gross_revenue_churn_pct)}
                    hint={{
                      definition: "Share of start-of-month MRR lost to departures.",
                      source: "Lost MRR from roster status history; Start MRR from prior-month snapshot (or reconstructed).",
                      formula: "Lost MRR ÷ Start MRR × 100",
                    }}
                  />
                  <StatCard
                    label="Net Rev. Retention"
                    value={pct(data.churn.nrr_pct)}
                    hint={{
                      definition: "How much of last month’s recurring book you kept after expansion and churn.",
                      source: "MRR bridge (roster + snapshots).",
                      formula: "(Start MRR + Expansion − Contraction − Lost MRR) ÷ Start MRR × 100",
                    }}
                  />
                  <StatCard
                    label="Quick Ratio"
                    value={ratio(data.churn.quick_ratio)}
                    hint={{
                      definition: "Growth MRR gained vs MRR lost. Above ~4 is healthy SaaS rule of thumb.",
                      source: "MRR bridge components.",
                      formula: "(New MRR + Expansion) ÷ (Lost MRR + Contraction)",
                    }}
                  />
                  <StatCard
                    label="Avg Tenure"
                    value={
                      data.churn.avg_tenure_months == null
                        ? "—"
                        : `${data.churn.avg_tenure_months.toFixed(1)} mo`
                    }
                    hint={{
                      definition: "Average how long clients stay (used in LTV).",
                      source: "clients.date_signed → churned_at (or today if still active).",
                      formula: "MEAN((end − date_signed) in months) across clients with a sign date",
                    }}
                  />
                </div>
                {data.churn.churned_clients.length > 0 && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <div
                      className="rounded-xl p-5"
                      style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <p
                        className="text-xs font-semibold uppercase tracking-wider mb-3"
                        style={{ color: MUTED }}
                      >
                        Churn reasons ({periodLabel})
                      </p>
                      <div className="space-y-2">
                        {data.churn.churn_by_reason.map((r) => (
                          <div
                            key={r.reason_code}
                            className="flex items-center justify-between text-sm gap-3"
                          >
                            <span style={{ color: "#cbd5e1" }}>{reasonLabel(r.reason_code)}</span>
                            <span className="tabular-nums flex-shrink-0" style={{ color: "#94a3b8" }}>
                              {r.count} · {money(r.lost_mrr, { round: true })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div
                      className="rounded-xl overflow-hidden"
                      style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      <table className="w-full text-sm">
                        <thead>
                          <tr style={{ background: "#050c18" }}>
                            <th
                              className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                              style={{ color: MUTED }}
                            >
                              Departures ({data.churn.churned_count})
                            </th>
                            <th
                              className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                              style={{ color: MUTED }}
                            >
                              Status
                            </th>
                            <th
                              className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                              style={{ color: MUTED }}
                            >
                              Reason
                            </th>
                            <th
                              className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                              style={{ color: MUTED }}
                            >
                              MRR lost
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {data.churn.churned_clients.map((c) => (
                            <tr
                              key={c.client_id}
                              style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                            >
                              <td className="px-4 py-2.5" style={{ color: "#cbd5e1" }}>
                                {c.name}
                              </td>
                              <td className="px-4 py-2.5 text-xs" style={{ color: "#64748b" }}>
                                {c.departure_status === "off_boarding" ? "Off-boarding" : "Churned"}
                              </td>
                              <td className="px-4 py-2.5 text-xs" style={{ color: "#64748b" }}>
                                {reasonLabel(c.reason_code)}
                              </td>
                              <td
                                className="px-4 py-2.5 text-right tabular-nums"
                                style={{ color: BAD }}
                              >
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

              <KpiSection title="Clients & Portfolio" showDivider>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  <StatCard
                    label="Active Clients"
                    value={int(data.headline.active_clients)}
                    hint={{
                      definition: "How many clients are currently live on the book.",
                      source: "Client Roster → clients.lifecycle_status.",
                      formula: "COUNT(*) where lifecycle_status = active",
                    }}
                  />
                  <StatCard
                    label="New on Roster"
                    value={int(data.portfolio.new_clients_signed)}
                    hint={{
                      definition: "Roster logos with a sign date in this month (may differ from acquisition closes).",
                      source: "Client Roster → clients.date_signed.",
                      formula: "COUNT(*) where date_signed is in the selected month",
                    }}
                  />
                  <StatCard
                    label="Expansion MRR"
                    value={money(data.mrrBridge.expansion_mrr, { round: true })}
                    hint={{
                      definition: "Upsells on clients who stayed active month-over-month.",
                      source: "client_monthly_snapshots (prior month vs this month). 0 until snapshots exist.",
                      formula: "SUM(end_mrr − start_mrr) for clients active in both months where delta > 0",
                    }}
                  />
                  <StatCard
                    label="Contraction MRR"
                    value={money(data.mrrBridge.contraction_mrr, { round: true })}
                    hint={{
                      definition: "Downsells on retained active clients.",
                      source: "client_monthly_snapshots. 0 until snapshots exist.",
                      formula: "SUM(start_mrr − end_mrr) for clients active in both months where delta < 0",
                    }}
                  />
                </div>

                <div className="grid gap-4 lg:grid-cols-2 mt-4">
                  <div
                    className="rounded-xl p-5"
                    style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-3"
                      style={{ color: MUTED }}
                    >
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
                  <div
                    className="rounded-xl p-5"
                    style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p
                      className="text-xs font-semibold uppercase tracking-wider mb-3"
                      style={{ color: MUTED }}
                    >
                      Active MRR by product
                    </p>
                    <BreakdownBars
                      rows={data.portfolio.by_offer.map((o) => ({
                        key: `${o.offer} (${o.count})`,
                        amount: o.mrr,
                      }))}
                      empty="No active clients."
                    />
                  </div>
                </div>

                {data.portfolio.contracts_ending_60d.length > 0 && (
                  <div
                    className="mt-4 rounded-xl overflow-hidden"
                    style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <table className="w-full text-sm">
                      <thead>
                        <tr style={{ background: "#050c18" }}>
                          <th
                            className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
                            style={{ color: MUTED }}
                          >
                            Contracts ending ≤ 60 days
                          </th>
                          <th
                            className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                            style={{ color: MUTED }}
                          >
                            Ends
                          </th>
                          <th
                            className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wider"
                            style={{ color: MUTED }}
                          >
                            MRR
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.portfolio.contracts_ending_60d.map((c) => (
                          <tr
                            key={c.client_id}
                            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                          >
                            <td className="px-4 py-2.5" style={{ color: "#cbd5e1" }}>
                              {c.name}
                            </td>
                            <td
                              className="px-4 py-2.5 text-right"
                              style={{ color: c.days_left <= 14 ? AMBER : "#94a3b8" }}
                            >
                              {c.contract_end_date} ({c.days_left}d)
                            </td>
                            <td
                              className="px-4 py-2.5 text-right tabular-nums"
                              style={{ color: "#e2e8f0" }}
                            >
                              {money(c.mrr, { round: true })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </KpiSection>

              <KpiSection
                title="Unit Economics"
                showDivider
                footnote="From expense rollup + portfolio. Prefer Expenses → Roll up over manual edits when the ledger is current."
              >
                <div className="flex justify-end mb-3">
                  <button
                    onClick={() => setEditing(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: "rgba(245,158,11,0.12)", color: AMBER }}
                  >
                    Edit inputs for {monthLabel(editMonth)}
                    {granularity !== "month" ? " (end month)" : ""}
                  </button>
                </div>
                <UnitEconomicsGrid u={data.unitEconomics} />
              </KpiSection>

              {editing && (
                <FinancialInputsEditor
                  month={editMonth}
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

function MiniStat({
  label,
  value,
  good,
  bad,
  accent,
}: {
  label: string;
  value: string;
  good?: boolean;
  bad?: boolean;
  accent?: boolean;
}) {
  const color = bad ? BAD : good ? GOOD : accent ? AMBER : "#e2e8f0";
  return (
    <div className="rounded-lg px-2 py-1.5" style={{ background: "rgba(255,255,255,0.03)" }}>
      <p className="text-[9px] uppercase tracking-wider" style={{ color: MUTED }}>
        {label}
      </p>
      <p className="text-xs font-semibold tabular-nums mt-0.5" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

// ── Unit economics grid (live values, else "needs data") ──────────────────────

function UnitEconomicsGrid({ u }: { u: BusinessMetrics["unitEconomics"] }) {
  const cards: {
    label: string;
    value: string | null;
    hint: MetricHint;
    need: string;
    accent?: boolean;
    badge?: string;
  }[] = [
    {
      label: "CAC",
      value: u.cac == null ? null : money(u.cac, { round: true }),
      hint: {
        definition: "Cost to acquire one signed close.",
        source: `business_metrics.marketing_spend (expense rollup CAC) ÷ ${u.cac_closes} acquisition_closes.`,
        formula: "Marketing Spend ÷ Signed Closes",
      },
      need: "Needs marketing spend + signed closes.",
    },
    {
      label: "LTV",
      value: u.ltv == null ? null : money(u.ltv, { round: true }),
      hint: {
        definition: "Estimated lifetime revenue (or margin-adjusted) per account.",
        source: "ARPA from roster; tenure from date_signed/churned_at; optional gross margin from delivery_costs rollup.",
        formula: u.ltv_is_margin_based
          ? "ARPA × Avg Tenure × Gross Margin %"
          : "ARPA × Avg Tenure (add delivery costs for margin-based LTV)",
      },
      need: "Needs ARPA + tenure.",
    },
    {
      label: "LTV : CAC",
      value: u.ltv_cac == null ? null : ratio(u.ltv_cac),
      hint: {
        definition: "How many times LTV covers acquisition cost. Target ≥ 3×.",
        source: "Derived from LTV and CAC cards above.",
        formula: "LTV ÷ CAC",
      },
      need: "Needs LTV + CAC.",
      accent: true,
    },
    {
      label: "CAC Payback",
      value: u.cac_payback_months == null ? null : `${u.cac_payback_months.toFixed(1)} mo`,
      hint: {
        definition: "Months of gross profit per account to recover CAC.",
        source: "CAC, ARPA, and gross margin (when delivery_costs rolled up).",
        formula: "CAC ÷ (ARPA × Gross Margin fraction)",
      },
      need: "Needs CAC.",
    },
    {
      label: "ROAS (new cash)",
      value: u.roas == null ? null : ratio(u.roas),
      hint: {
        definition: "Front-end cash returned per dollar of marketing spend this month.",
        source: "New cash from client_billings front_end; marketing_spend from expense rollup.",
        formula: "New Cash Collected ÷ Marketing Spend",
      },
      need: "Needs marketing spend.",
    },
    {
      label: "Gross Margin",
      value: u.gross_margin_pct == null ? null : pct(u.gross_margin_pct),
      hint: {
        definition: "Cash left after delivery / COGS.",
        source: "Total cash from billings; delivery_costs from expense rollup (ceo_bucket = fulfillment).",
        formula: "(Total Cash − Delivery Costs) ÷ Total Cash × 100",
      },
      need: "Needs delivery costs.",
    },
    {
      label: "Operating Profit",
      value: u.operating_profit == null ? null : money(u.operating_profit, { round: true }),
      hint: {
        definition: "Cash after all P&L operating expenses.",
        source: "Total cash; operating_expenses from expense rollup (cac + fulfillment + overhead).",
        formula: "Total Cash − Operating Expenses",
      },
      need: "Needs operating expenses.",
      accent: true,
    },
    {
      label: "Profit Margin",
      value: u.profit_margin_pct == null ? null : pct(u.profit_margin_pct),
      hint: {
        definition: "Operating profit as a share of cash collected.",
        source: "Derived from operating profit and total cash.",
        formula: "Operating Profit ÷ Total Cash × 100",
      },
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
      hint: {
        definition: "How many months of cash left at the current burn rate.",
        source: "Manual/imported cash_balance in business_metrics; burn = OpEx − Total Cash.",
        formula: "Cash Balance ÷ (Operating Expenses − Total Cash) when burning; else “Profitable”",
      },
      need: "Needs cash balance + expenses.",
    },
    {
      label: "Rule of 40",
      value: u.rule_of_40 == null ? null : u.rule_of_40.toFixed(0),
      hint: {
        definition: "Growth + profitability score. Target ≥ 40.",
        source: "MRR growth from bridge; profit margin from cash − OpEx.",
        formula: "(Annualized MRR growth %) + (Profit Margin %)",
      },
      need: "Needs expenses (for margin).",
    },
    {
      label: "Revenue / Head",
      value: u.revenue_per_head == null ? null : money(u.revenue_per_head, { round: true }),
      hint: {
        definition: "Annualized recurring revenue per team member.",
        source: "Active MRR from roster; headcount from business_metrics input.",
        formula: "(Active MRR × 12) ÷ Headcount",
      },
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
