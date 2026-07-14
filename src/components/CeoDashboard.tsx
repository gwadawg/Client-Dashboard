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

type CeoTab = "overview" | "mrr" | "cash" | "acquisition" | "risk";

const CEO_TABS: { key: CeoTab; label: string; hint: string }[] = [
  { key: "overview", label: "Overview", hint: "Live + period pulse" },
  { key: "mrr", label: "MRR & Retention", hint: "Bridge & churn" },
  { key: "cash", label: "Cash & P&L", hint: "Collections & profit" },
  { key: "acquisition", label: "Acquisition", hint: "Closes, CAC, ROAS" },
  { key: "risk", label: "Portfolio Risk", hint: "As-of-now only" },
];

/** Trailing-N unit economics from monthly trend (ratios stay noisy alone). */
function trailingUnitEconomics(trend: BusinessMetrics["trend"], n = 3) {
  const slice = trend.slice(-n);
  let spend = 0;
  let spendMonths = 0;
  let opex = 0;
  let opexMonths = 0;
  let closes = 0;
  let newCash = 0;
  let cash = 0;
  for (const t of slice) {
    if (t.marketing_spend != null && Number.isFinite(t.marketing_spend)) {
      spend += t.marketing_spend;
      spendMonths += 1;
    }
    if (t.operating_expenses != null && Number.isFinite(t.operating_expenses)) {
      opex += t.operating_expenses;
      opexMonths += 1;
    }
    closes += t.closes ?? 0;
    newCash += t.new_cash;
    cash += t.cash_collected;
  }
  return {
    months: slice.length,
    marketing_spend: spendMonths > 0 ? spend : null,
    operating_expenses: opexMonths > 0 ? opex : null,
    closes,
    new_cash: newCash,
    cash_collected: cash,
    cac: spendMonths > 0 && closes > 0 ? spend / closes : null,
    roas: spendMonths > 0 && spend > 0 ? newCash / spend : null,
    operating_profit: opexMonths > 0 ? cash - opex : null,
  };
}

function ScopeChip({ kind }: { kind: "live" | "period" | "t3" }) {
  const map = {
    live: { label: "LIVE", bg: "rgba(59,130,246,0.18)", color: "#93c5fd" },
    period: { label: "PERIOD", bg: "rgba(245,158,11,0.14)", color: AMBER },
    t3: { label: "T3", bg: "rgba(52,211,153,0.12)", color: GOOD },
  } as const;
  const s = map[kind];
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function HealthBanner({
  tone,
  title,
  body,
}: {
  tone: "danger" | "warn" | "info";
  title: string;
  body: string;
}) {
  const colors = {
    danger: { border: "rgba(248,113,113,0.35)", bg: "rgba(248,113,113,0.08)", title: BAD },
    warn: { border: "rgba(245,158,11,0.35)", bg: "rgba(245,158,11,0.08)", title: AMBER },
    info: { border: "rgba(59,130,246,0.35)", bg: "rgba(59,130,246,0.08)", title: BLUE },
  }[tone];
  return (
    <div
      className="rounded-xl px-4 py-3"
      style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      <p className="text-xs font-semibold" style={{ color: colors.title }}>
        {title}
      </p>
      <p className="text-[11px] mt-0.5 leading-relaxed" style={{ color: "#94a3b8" }}>
        {body}
      </p>
    </div>
  );
}

function PanelIntro({
  title,
  sub,
  liveOnly,
}: {
  title: string;
  sub: string;
  liveOnly?: boolean;
}) {
  return (
    <div className="flex items-end justify-between flex-wrap gap-2">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
            {title}
          </h2>
          {liveOnly && <ScopeChip kind="live" />}
        </div>
        <p className="text-xs max-w-2xl leading-relaxed" style={{ color: MUTED }}>
          {sub}
        </p>
      </div>
    </div>
  );
}

export default function CeoDashboard({
  canViewRevenue = false,
  mode = "dashboard",
}: {
  canViewRevenue?: boolean;
  mode?: CeoDashboardMode;
}) {
  const [ledgerTab, setLedgerTab] = useState<"revenue" | "expenses">("revenue");
  const [ceoTab, setCeoTab] = useState<CeoTab>("overview");
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
    let cancelled = false;
    if (!canViewRevenue || mode !== "dashboard") {
      queueMicrotask(() => {
        if (cancelled || canViewRevenue) return;
        setLoading(false);
        setData(null);
        setError(null);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (cancelled) return;
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
      : (data?.period.months.includes(monthOptions[0]) ?? true);
  const scopeWord = granularity === "month" ? "month" : "period";
  const showPeriodControls = ceoTab !== "risk";

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

  const prevTrend = data?.trend?.length ? data.trend[data.trend.length - 2] : undefined;
  const t3 = data ? trailingUnitEconomics(data.trend, 3) : null;
  const mrrSpark = data?.trend?.map((t) => t.mrr_end) ?? [];
  const cashSpark = data?.trend?.map((t) => t.cash_collected) ?? [];
  const profitSpark = data?.trend?.map((t) => t.operating_profit) ?? [];
  const snapshotsReady = data?.dataHealth?.snapshots_ready ?? false;
  const lostMrrSuspect =
    !!data && data.churn.churned_count > 0 && data.headline.lost_mrr <= 0;
  const newCashDelta =
    data != null ? Math.abs(data.revenue.new_cash - data.revenue.new_logo_cash) : 0;
  const closesGap =
    data != null
      ? Math.abs(data.unitEconomics.cac_closes - data.portfolio.new_clients_signed)
      : 0;

  return (
    <div className="space-y-5 max-w-7xl">
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
            Stock metrics stay live. Flow metrics follow the period. Ratios prefer trailing 3 months.
          </p>
        </div>
      </div>

      {/* Internal department tabs */}
      <div
        className="flex gap-1 overflow-x-auto border-b pb-px"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}
        role="tablist"
        aria-label="CEO dashboard sections"
      >
        {CEO_TABS.map((t) => {
          const active = ceoTab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setCeoTab(t.key)}
              className="px-4 py-2.5 text-left shrink-0 transition-colors"
              style={{
                color: active ? "#e2e8f0" : "#64748b",
                borderBottom: `2px solid ${active ? AMBER : "transparent"}`,
              }}
            >
              <span className="block text-sm font-medium leading-none">{t.label}</span>
              <span
                className="block text-[10px] mt-1 leading-none"
                style={{ color: active ? "#94a3b8" : "#475569" }}
              >
                {t.hint}
              </span>
            </button>
          );
        })}
      </div>

      {/* Period controls — hidden on live-only risk tab */}
      {showPeriodControls && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
              {periodLabel}
            </h2>
            {!isLivePeriod && <ScopeChip kind="period" />}
            {isLivePeriod && granularity === "month" && (
              <span className="text-[11px]" style={{ color: MUTED }}>
                Current month (partial until close)
              </span>
            )}
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
      )}

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
          {/* ── OVERVIEW ── */}
          {ceoTab === "overview" && (
            <div className="space-y-5">
              <PanelIntro
                title="Executive pulse"
                sub="Five decisions at a glance. LIVE = current book. PERIOD = selected window. T3 = trailing 3 months (ratios)."
              />

              <div className="grid gap-2 sm:grid-cols-2">
                {!snapshotsReady && (
                  <HealthBanner
                    tone="danger"
                    title="Monthly roster snapshots missing"
                    body="MRR bridge End/Start and Expansion/Contraction cannot be trusted historically until client_monthly_snapshots are frozen (cron on the 1st)."
                  />
                )}
                {lostMrrSuspect && (
                  <HealthBanner
                    tone="danger"
                    title="Lost MRR looks understated"
                    body={`${data.churn.churned_count} departure(s) this ${scopeWord} but Lost MRR is ${money(data.headline.lost_mrr, { round: true })} — check mrr_at_change stamps before trusting revenue churn %.`}
                  />
                )}
                {newCashDelta > 500 && (
                  <HealthBanner
                    tone="warn"
                    title="New cash vs new-logo cross-check diverges"
                    body={`Front-end cash ${money(data.revenue.new_cash, { round: true })} vs first-paid ${money(data.revenue.new_logo_cash, { round: true })} (Δ ${money(newCashDelta, { round: true })}). Review revenue_segment tagging.`}
                  />
                )}
                {closesGap > 0 && (
                  <HealthBanner
                    tone="info"
                    title="Closes ≠ roster sign dates"
                    body={`${int(data.unitEconomics.cac_closes)} acquisition closes vs ${int(data.portfolio.new_clients_signed)} roster date_signed — different clocks; CAC uses closes.`}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
                <KpiCard
                  label="Active MRR"
                  badge="LIVE"
                  value={money(data.headline.active_mrr, { round: true })}
                  accent
                  hint={{
                    definition: "Live recurring revenue from clients currently marked active — not period End MRR.",
                    source: "Client Roster → clients.mrr where lifecycle_status = active.",
                    formula: "SUM(clients.mrr) for active clients",
                  }}
                  delta={
                    isLivePeriod
                      ? momDelta(data.headline.active_mrr, prevTrend?.mrr_end, { asMoney: true })
                      : undefined
                  }
                  spark={isLivePeriod ? mrrSpark : undefined}
                />
                <KpiCard
                  label="Cash Collected"
                  badge="PERIOD"
                  value={money(data.headline.cash_collected, { round: true })}
                  hint={{
                    definition: `Cash that actually landed in the selected ${scopeWord}.`,
                    source: "Finance Revenue ledger → client_billings (paid_on, amount_paid).",
                    formula: `SUM(amount_paid − passthrough) where paid_on in ${scopeWord}`,
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
                {t3?.operating_profit == null ? (
                  <PlaceholderCard label="Op. Profit (T3)" need="Roll up expenses for recent months." />
                ) : (
                  <KpiCard
                    label="Op. Profit"
                    badge="T3"
                    value={money(t3.operating_profit, { round: true })}
                    hint={{
                      definition: "Trailing 3 months: cash collected minus operating expenses.",
                      source: "client_billings + business_metrics.operating_expenses.",
                      formula: "Σ Cash − Σ OpEx over last 3 months in trend",
                    }}
                    spark={profitSpark}
                  />
                )}
                {t3?.cac == null ? (
                  <PlaceholderCard label="CAC (T3)" need="Needs marketing spend + closes in last 3 months." />
                ) : (
                  <KpiCard
                    label="CAC"
                    badge="T3"
                    value={money(t3.cac, { round: true })}
                    hint={{
                      definition: "Trailing 3 months cost per signed close — stabler than a single month.",
                      source: "Expense CAC rollup ÷ acquisition_closes across last 3 trend months.",
                      formula: "Σ Marketing Spend ÷ Σ Signed Closes (T3)",
                    }}
                    delta={
                      t3.roas != null
                        ? {
                            text: `ROAS ${ratio(t3.roas)}`,
                            good: t3.roas >= 2 ? true : t3.roas < 1 ? false : null,
                          }
                        : undefined
                    }
                  />
                )}
                <KpiCard
                  label="Signed Closes"
                  badge="PERIOD"
                  value={int(data.unitEconomics.cac_closes)}
                  hint={{
                    definition: `Acquisition deals closed this ${scopeWord} — the CAC denominator.`,
                    source: "acquisition_closes (closed_at, not dismissed/deleted).",
                    formula: `COUNT(acquisition_closes) where closed_at in ${scopeWord}`,
                  }}
                  delta={{
                    text: `${int(data.portfolio.new_clients_signed)} on roster`,
                    good: null,
                  }}
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                      Cash composition
                    </p>
                    <button
                      type="button"
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: AMBER }}
                      onClick={() => setCeoTab("cash")}
                    >
                      Open Cash →
                    </button>
                  </div>
                  {hasFinanceTrend(data.trend) ? (
                    <FinanceTrendChart trend={data.trend} />
                  ) : (
                    <TrendChart trend={data.trend} />
                  )}
                </div>
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                      Live book / risk
                    </p>
                    <button
                      type="button"
                      className="text-[10px] font-semibold uppercase tracking-wider"
                      style={{ color: AMBER }}
                      onClick={() => setCeoTab("risk")}
                    >
                      Open Risk →
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard
                      label="Active Clients"
                      value={int(data.headline.active_clients)}
                      badge="LIVE"
                      hint="Current active logos on the roster."
                    />
                    <StatCard
                      label="Top Client %"
                      value={pct(data.portfolio.top_client_pct)}
                      badge="LIVE"
                      hint="Largest active client as share of Active MRR."
                    />
                    <StatCard
                      label="At-Risk MRR (90d)"
                      value={money(data.portfolio.contracts_ending_90d_mrr, { round: true })}
                      badge="LIVE"
                      hint="Active MRR with contract_end_date within 90 days."
                    />
                    <StatCard
                      label="Overdue AR"
                      value={money(data.revenue.overdue_ar, { round: true })}
                      badge="ALL-TIME"
                      hint="Unpaid balances past due — not month-scoped."
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── MRR & RETENTION ── */}
          {ceoTab === "mrr" && (
            <div className="space-y-5">
              <PanelIntro
                title="Recurring book"
                sub="MRR movement and retention for the selected period. Expansion/Contraction need monthly snapshots."
              />

              {!snapshotsReady && (
                <HealthBanner
                  tone="danger"
                  title="Bridge incomplete — no snapshots"
                  body="End MRR falls back to live Active MRR for closed months, and Expansion/Contraction stay $0 until snapshots exist. Treat this tab as directional only."
                />
              )}
              {lostMrrSuspect && (
                <HealthBanner
                  tone="danger"
                  title="Lost MRR stamp issue"
                  body="Departures exist but Lost MRR is ~$0. Revenue churn % and NRR will look artificially healthy."
                />
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Net New MRR"
                  value={money(data.headline.net_new_mrr, { round: true })}
                  accent
                  hint={{
                    definition: `Change in recurring book this ${scopeWord} (not cash).`,
                    source: "date_signed + snapshots + churn dates.",
                    formula: "New + Expansion − Contraction − Lost",
                  }}
                />
                <StatCard
                  label="New MRR"
                  value={money(data.mrrBridge.new_mrr, { round: true })}
                  hint="SUM(current clients.mrr) where date_signed in period."
                />
                <StatCard
                  label="Lost MRR"
                  value={money(data.mrrBridge.lost_mrr, { round: true })}
                  hint="mrr_at_change at first off_boarding/churned (effective churn date preferred)."
                />
                <StatCard
                  label="End MRR"
                  value={money(data.mrrBridge.end_mrr, { round: true })}
                  badge={snapshotsReady && !isLivePeriod ? "SNAPSHOT" : "LIVE FALLBACK"}
                  hint="Frozen snapshot when available; otherwise live Active MRR."
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                    MRR bridge
                  </p>
                  <MrrWaterfall bridge={data.mrrBridge} />
                  <div className="grid grid-cols-4 gap-2 pt-1">
                    <MiniStat label="Start" value={money(data.mrrBridge.start_mrr, { round: true })} />
                    <MiniStat label="New" value={money(data.mrrBridge.new_mrr, { round: true })} good />
                    <MiniStat label="Lost" value={money(data.mrrBridge.lost_mrr, { round: true })} bad />
                    <MiniStat label="End" value={money(data.mrrBridge.end_mrr, { round: true })} accent />
                  </div>
                </div>
                <div
                  className="rounded-xl p-4 space-y-3"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                    Retention rates
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard label="Logo Churn" value={pct(data.churn.logo_churn_pct)} hint="Departed ÷ reconstructed start logos. Historical denominator uses live actives — prefer after snapshot backfill." />
                    <StatCard label="Revenue Churn" value={pct(data.churn.gross_revenue_churn_pct)} hint="Lost MRR ÷ Start MRR." />
                    <StatCard label="Net Rev. Retention" value={pct(data.churn.nrr_pct)} hint="(Start + Expansion − Contraction − Lost) ÷ Start." />
                    <StatCard label="Quick Ratio" value={ratio(data.churn.quick_ratio)} hint="(New + Expansion) ÷ (Lost + Contraction)." />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <StatCard
                      label="Expansion MRR"
                      value={money(data.mrrBridge.expansion_mrr, { round: true })}
                      badge={snapshotsReady ? undefined : "NEEDS SNAPSHOTS"}
                    />
                    <StatCard
                      label="Contraction MRR"
                      value={money(data.mrrBridge.contraction_mrr, { round: true })}
                      badge={snapshotsReady ? undefined : "NEEDS SNAPSHOTS"}
                    />
                  </div>
                </div>
              </div>

              {data.churn.churned_clients.length > 0 && (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div
                    className="rounded-xl p-5"
                    style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
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
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                            Departures ({data.churn.churned_count})
                          </th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
                            Status
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
                            <td className="px-4 py-2.5" style={{ color: "#cbd5e1" }}>{c.name}</td>
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
            </div>
          )}

          {/* ── CASH & P&L ── */}
          {ceoTab === "cash" && (
            <div className="space-y-5">
              <PanelIntro
                title="Cash & P&L"
                sub="Cash-collected basis (paid_on). Passthrough excluded. Prefer quarterly margins when months are lumpy."
              />

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                  label="New Cash"
                  value={money(data.revenue.new_cash, { round: true })}
                  sub={`New-logo cross-check: ${money(data.revenue.new_logo_cash, { round: true })}`}
                  accent
                  hint={{
                    definition: "Front-end cash from new-client charges.",
                    source: "client_billings revenue_segment = front_end.",
                    formula: "SUM(amount_paid − passthrough) for front_end",
                  }}
                />
                <StatCard
                  label="Recurring Cash"
                  value={money(data.revenue.recurring_cash, { round: true })}
                  hint="Back-end retainer collections in period."
                />
                <StatCard
                  label="Total Cash"
                  value={money(data.revenue.total_cash, { round: true })}
                  hint="All non-passthrough collected cash in period."
                />
                <StatCard
                  label="Net of Fees"
                  value={money(data.revenue.net_of_fees, { round: true })}
                  hint="After processing fees."
                />
                <StatCard
                  label="Open AR"
                  value={money(data.revenue.open_ar, { round: true })}
                  badge="ALL-TIME"
                  hint="Outstanding unpaid balances — not period-scoped."
                />
                <StatCard
                  label="ARPA"
                  value={money(data.headline.arpa, { round: true })}
                  badge="LIVE"
                  hint="Active MRR ÷ Active Clients (current book)."
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
                    Revenue by type
                  </p>
                  <BreakdownBars rows={data.revenue.by_type} empty={`No cash collected this ${scopeWord}.`} />
                </div>
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
                    Revenue by lead source
                  </p>
                  <BreakdownBars
                    rows={data.revenue.by_lead_source}
                    empty={`No lead-source data on this ${scopeWord}'s billings.`}
                  />
                </div>
              </div>

              <div
                className="rounded-xl p-4 space-y-3"
                style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#64748b" }}>
                    Profit trend
                  </p>
                  <button
                    onClick={() => setEditing(true)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{ background: "rgba(245,158,11,0.12)", color: AMBER }}
                  >
                    Edit inputs for {monthLabel(editMonth)}
                    {granularity !== "month" ? " (end month)" : ""}
                  </button>
                </div>
                {hasFinanceTrend(data.trend) ? (
                  <FinanceTrendChart trend={data.trend} />
                ) : (
                  <TrendChart trend={data.trend} />
                )}
              </div>

              <KpiSection
                title="Unit Economics"
                footnote="Expense rollup + portfolio. Monthly ratios are noisy — cross-check Overview T3."
              >
                <UnitEconomicsGrid u={data.unitEconomics} />
              </KpiSection>
            </div>
          )}

          {/* ── ACQUISITION ── */}
          {ceoTab === "acquisition" && (
            <div className="space-y-5">
              <PanelIntro
                title="Acquisition economics"
                sub="Closes, spend, CAC, and new-cash efficiency. Prefer T3 ratios; monthly CAC swings with small denominators."
              />

              {closesGap > 0 && (
                <HealthBanner
                  tone="info"
                  title="Two acquisition clocks"
                  body={`Period closes ${int(data.unitEconomics.cac_closes)} vs roster signed ${int(data.portfolio.new_clients_signed)}. CAC always uses acquisition_closes.`}
                />
              )}
              {newCashDelta > 500 && (
                <HealthBanner
                  tone="warn"
                  title="New cash reconciliation"
                  body={`Front-end ${money(data.revenue.new_cash, { round: true })} vs first-paid logos ${money(data.revenue.new_logo_cash, { round: true })}.`}
                />
              )}

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <StatCard
                  label="Signed Closes"
                  value={int(data.unitEconomics.cac_closes)}
                  accent
                  hint="CAC denominator for the period."
                />
                <StatCard
                  label="New on Roster"
                  value={int(data.portfolio.new_clients_signed)}
                  hint="date_signed in period — may differ from closes."
                />
                <StatCard
                  label="New Cash"
                  value={money(data.revenue.new_cash, { round: true })}
                  hint="front_end cash collected in period."
                />
                <StatCard
                  label="New-Logo Cash"
                  value={money(data.revenue.new_logo_cash, { round: true })}
                  hint="First-ever paid billing landing in period."
                />
                {data.unitEconomics.marketing_spend == null ? (
                  <PlaceholderCard label="Marketing Spend" need="Roll up expense CAC or Meta spend." />
                ) : (
                  <StatCard
                    label="Marketing Spend"
                    value={money(data.unitEconomics.marketing_spend, { round: true })}
                    hint="Expense rollup ceo_bucket=cac (Meta is informational fallback when null)."
                  />
                )}
                {data.unitEconomics.cac == null ? (
                  <PlaceholderCard label="CAC (period)" need="Needs spend + closes." />
                ) : (
                  <StatCard
                    label="CAC (period)"
                    value={money(data.unitEconomics.cac, { round: true })}
                    hint="Period spend ÷ period closes — prefer T3 below when closes < 3."
                  />
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="CAC (T3)"
                  value={t3?.cac == null ? "—" : money(t3.cac, { round: true })}
                  badge="T3"
                  accent
                  hint="Σ spend ÷ Σ closes over trailing 3 months."
                />
                <StatCard
                  label="ROAS (T3)"
                  value={t3?.roas == null ? "—" : ratio(t3.roas)}
                  badge="T3"
                  hint="Σ new cash ÷ Σ marketing spend (T3)."
                />
                <StatCard
                  label="ROAS (period)"
                  value={data.unitEconomics.roas == null ? "—" : ratio(data.unitEconomics.roas)}
                  hint="New cash ÷ marketing spend this period."
                />
                <StatCard
                  label="Meta Ad Spend"
                  value={
                    data.unitEconomics.acquisition_ad_spend == null
                      ? "—"
                      : money(data.unitEconomics.acquisition_ad_spend, { round: true })
                  }
                  hint="Informational Meta insights for the period (does not override expense CAC when rollup exists)."
                />
              </div>

              <div
                className="rounded-xl p-4"
                style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "#64748b" }}>
                  Spend · profit · ROAS (12 mo)
                </p>
                {hasFinanceTrend(data.trend) ? (
                  <FinanceTrendChart trend={data.trend} />
                ) : (
                  <p className="text-sm py-8 text-center" style={{ color: MUTED }}>
                    Roll up expenses to unlock the acquisition profit chart.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ── PORTFOLIO RISK (LIVE) ── */}
          {ceoTab === "risk" && (
            <div className="space-y-5">
              <PanelIntro
                title="Portfolio risk"
                sub="Point-in-time book health. No period picker — everything here is as-of now (AR is all-time)."
                liveOnly
              />

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatCard
                  label="Active MRR"
                  value={money(data.headline.active_mrr, { round: true })}
                  accent
                  badge="LIVE"
                />
                <StatCard
                  label="Active Clients"
                  value={int(data.headline.active_clients)}
                  badge="LIVE"
                />
                <StatCard
                  label="Top Client %"
                  value={pct(data.portfolio.top_client_pct)}
                  badge="LIVE"
                  hint="MAX(active MRR) ÷ Active MRR."
                />
                <StatCard
                  label="Top 5 %"
                  value={pct(data.portfolio.top5_pct)}
                  badge="LIVE"
                />
                <StatCard
                  label="At-Risk MRR (90d)"
                  value={money(data.portfolio.contracts_ending_90d_mrr, { round: true })}
                  badge="LIVE"
                />
                <StatCard
                  label="Overdue AR"
                  value={money(data.revenue.overdue_ar, { round: true })}
                  badge="ALL-TIME"
                />
                <StatCard
                  label="Open AR"
                  value={money(data.revenue.open_ar, { round: true })}
                  badge="ALL-TIME"
                />
                <StatCard
                  label="Avg Tenure"
                  value={
                    data.churn.avg_tenure_months == null
                      ? "—"
                      : `${data.churn.avg_tenure_months.toFixed(1)} mo`
                  }
                  badge="LIVE"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
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
                <div
                  className="rounded-xl p-5"
                  style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: MUTED }}>
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
                  className="rounded-xl overflow-hidden"
                  style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                >
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
                          <td className="px-4 py-2.5" style={{ color: "#cbd5e1" }}>{c.name}</td>
                          <td
                            className="px-4 py-2.5 text-right"
                            style={{ color: c.days_left <= 14 ? AMBER : "#94a3b8" }}
                          >
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
            </div>
          )}

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
