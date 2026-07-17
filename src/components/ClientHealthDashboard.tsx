"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Fragment } from "react";
import {
  computePriorityScore,
  FOCUS_STYLES,
  FRESH_LAUNCH_DAYS,
  KPI_META,
  LEADING_WINDOW_DAYS,
  MATURITY_DAYS,
  TIER_LABEL,
  leadingGradeFor,
  type ClientHealthRow,
  type HealthTier,
  type KpiKey,
  type PendingIntervention,
} from "@/lib/client-health";
import {
  DEPT_LENS_LABEL,
  TIER_WEIGHT,
  deptStatus,
  gradesForLens,
  rateTierFromBands,
  type DeptLens,
} from "@/lib/dept-health";
import Link from "next/link";
import ClientFile from "./ClientFile";
import ClientHealthDetail from "./ClientHealthDetail";
import PendingInterventionsPanel from "./PendingInterventionsPanel";
import { churnFormHref } from "@/lib/internal-forms";
import { usesCallCenterKpiLayout } from "@/lib/kpi-layouts";

// The grading view owns its own date range, deliberately decoupled from the global
// explore filter. A health verdict must use a consistent, defined period so a
// client's tier is comparable across clients and over time — see
// docs/CLIENT-HEALTH-REDESIGN.md §13.
type Props = {
  startDate?: string;
  endDate?: string;
};

type ClientSegment = "RM" | "CALL_CENTER";

type SortKey =
  | "priority"
  | "focus"
  | "show_rate"
  | "cps"
  | "leads"
  | "name"
  | "booking_rate"
  | "dials"
  | "cpl"
  | "cpql"
  | "hand_raise"
  | "conv_rate"
  | "dept_status";

/**
 * Standardized grading windows. Each is a fixed trailing period that ends at the
 * maturity cutoff (today − MATURITY_DAYS), so the verdict only reflects resolved
 * cohorts (no perpetual "still maturing" caveat), and is compared to the prior
 * equal-length period for the trend.
 */
type GradeWindow = "30d" | "60d" | "90d";
const GRADE_WINDOW_DAYS: Record<GradeWindow, number> = { "30d": 30, "60d": 60, "90d": 90 };
const GRADE_WINDOW_LABELS: Record<GradeWindow, string> = {
  "30d": "Window: Last 30 days",
  "60d": "Window: Last 60 days",
  "90d": "Window: Last 90 days",
};

function ymdUTC(d: Date): string {
  return d.toISOString().split("T")[0];
}

function gradingRange(win: GradeWindow): { start: string; end: string } {
  const days = GRADE_WINDOW_DAYS[win];
  const end = new Date(Date.now() - MATURITY_DAYS * 86400000);
  const start = new Date(end.getTime() - (days - 1) * 86400000);
  return { start: ymdUTC(start), end: ymdUTC(end) };
}

const TIER_STYLES: Record<HealthTier, { bg: string; text: string; border: string }> = {
  critical: { bg: "rgba(239,68,68,0.18)", text: "#f87171", border: "rgba(239,68,68,0.4)" },
  below: { bg: "rgba(245,158,11,0.15)", text: "#fbbf24", border: "rgba(245,158,11,0.35)" },
  at: { bg: "rgba(52,211,153,0.12)", text: "#34d399", border: "rgba(52,211,153,0.3)" },
  above: { bg: "rgba(59,130,246,0.15)", text: "#60a5fa", border: "rgba(59,130,246,0.35)" },
  insufficient: { bg: "rgba(100,116,139,0.12)", text: "#64748b", border: "rgba(100,116,139,0.25)" },
};

const CONSTRAINT_COLORS: Record<string, string> = {
  lead_quality: "#a78bfa",
  lead_cost: "#f472b6",
  call_center: "#f59e0b",
  show_rate: "#38bdf8",
  data_issue: "#fb7185",
  healthy: "#34d399",
  insufficient_data: "#64748b",
};

const TREND_ICONS: Record<ClientHealthRow["trend"], { symbol: string; color: string; label: string }> = {
  improved: { symbol: "↑", color: "#34d399", label: "Improving" },
  worsened: { symbol: "↓", color: "#f87171", label: "Slipping" },
  stable: { symbol: "→", color: "#94a3b8", label: "Stable" },
  new: { symbol: "•", color: "#64748b", label: "New / no prior" },
  insufficient: { symbol: "—", color: "#475569", label: "Low volume" },
};

const RM_CHART_METRICS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Attention score" },
  { key: "show_rate", label: "Show rate % (true)" },
  { key: "cps", label: "Cost per conversation" },
  { key: "leads", label: "Total leads" },
];

const HE_CHART_METRICS: { key: SortKey; label: string }[] = [
  { key: "priority", label: "Attention score" },
  { key: "show_rate", label: "Show rate % (true)" },
  { key: "booking_rate", label: "Booking rate (÷ leads)" },
  { key: "dials", label: "Outbound dials" },
];

const MEDIA_CHART_METRICS: { key: SortKey; label: string }[] = [
  { key: "cpql", label: "CPQL ($)" },
  { key: "cpl", label: "CPL ($)" },
  { key: "leads", label: "Total leads" },
];

const CCM_CHART_METRICS_RM: { key: SortKey; label: string }[] = [
  { key: "hand_raise", label: "Hand-raise %" },
  { key: "show_rate", label: "Show rate %" },
  { key: "conv_rate", label: "Conversation %" },
  { key: "booking_rate", label: "Booking % (÷ qual)" },
];

const CCM_CHART_METRICS_HE: { key: SortKey; label: string }[] = [
  { key: "booking_rate", label: "Booking % (÷ leads)" },
  { key: "show_rate", label: "Show rate %" },
  { key: "conv_rate", label: "Conversation %" },
  { key: "dials", label: "Outbound dials" },
];

const SEGMENT_TABS: { key: ClientSegment; label: string }[] = [
  { key: "RM", label: "Paid Ads (RM + DSCR)" },
  { key: "CALL_CENTER", label: "Call Center" },
];

const DEPT_TABS: {
  key: DeptLens;
  label: string;
  blurb: string;
  /** Media Buyer only applies to paid-ads clients. */
  rmOnly?: boolean;
}[] = [
  {
    key: "overview",
    label: "Overview",
    blurb: "Account north star — CPConv (RM) or booking/show (HE). Role KPIs live on Media / CCM tabs.",
  },
  {
    key: "media_buyer",
    label: "Media Buyer",
    blurb: "Your lane only — CPL, CPQL, and lead→qualified. Account CPConv is on Overview.",
    rmOnly: true,
  },
  {
    key: "ccm",
    label: "CCM",
    blurb: "Your lane only — booking, hand-raise, show, and conversation rate. Account CPConv is on Overview.",
  },
];

function TierBadge({ tier }: { tier: HealthTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {TIER_LABEL[tier]}
    </span>
  );
}

function KpiDot({ tier }: { tier: HealthTier }) {
  const s = TIER_STYLES[tier];
  return (
    <span
      className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: s.text }}
      title={TIER_LABEL[tier]}
    />
  );
}

function freshGrade(row: ClientHealthRow, key: KpiKey): HealthTier {
  return row.fresh?.grades.find(g => g.key === key)?.tier ?? "insufficient";
}

function freshGradeDisplay(row: ClientHealthRow, key: KpiKey): string {
  return row.fresh?.grades.find(g => g.key === key)?.display ?? "—";
}

function FocusBadge({ focus }: { focus: ClientHealthRow["focus"] }) {
  const s = FOCUS_STYLES[focus.focus];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.text, border: `1px solid ${s.border}` }}
    >
      {focus.label}
    </span>
  );
}

export default function ClientHealthDashboard(_props: Props) {
  const [clientSegment, setClientSegment] = useState<ClientSegment>("RM");
  const [deptLens, setDeptLens] = useState<DeptLens>("overview");
  const [gradeWindow, setGradeWindow] = useState<GradeWindow>("30d");
  const { start: startDate, end: endDate } = useMemo(
    () => gradingRange(gradeWindow),
    [gradeWindow],
  );
  const [rows, setRows] = useState<ClientHealthRow[]>([]);
  const [priorLabel, setPriorLabel] = useState<string>("");
  const [maturity, setMaturity] = useState<{
    days: number;
    matured_through: string;
    clamped: boolean;
    empty: boolean;
    leading_window_days: number;
    leading_start: string;
    leading_end: string;
    recent_window_days?: number;
    recent_start?: string;
    recent_end?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [liveOnly, setLiveOnly] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>("priority");
  const [sortAsc, setSortAsc] = useState(false);
  const [chartMetric, setChartMetric] = useState<SortKey>("priority");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hideInactive, setHideInactive] = useState(true);
  const [detail, setDetail] = useState<{ id: string; name: string; lens: DeptLens } | null>(null);
  const [fileFor, setFileFor] = useState<{ id: string; name: string } | null>(null);
  const [summaryStats, setSummaryStats] = useState({
    act_now: 0,
    monitor: 0,
    recovering: 0,
    on_track: 0,
    follow_up_overdue: 0,
  });
  const [pendingInterventions, setPendingInterventions] = useState<PendingIntervention[]>([]);

  useEffect(() => {
    fetch("/api/client-actions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!startDate || !endDate) return;
    setLoading(true);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (liveOnly) params.set("live_only", "true");
    fetch(`/api/client-health?${params}`)
      .then(r => r.json())
      .then(d => {
        setRows(d.clients ?? []);
        setMaturity(d.maturity ?? null);
        if (d.summary) {
          setSummaryStats({
            act_now: d.summary.act_now ?? 0,
            monitor: d.summary.monitor ?? 0,
            recovering: d.summary.recovering ?? 0,
            on_track: d.summary.on_track ?? 0,
            follow_up_overdue: d.summary.follow_up_overdue ?? 0,
          });
        }
        setPendingInterventions(d.pending_interventions ?? []);
        if (d.prior_period) {
          setPriorLabel(`${d.prior_period.start} → ${d.prior_period.end}`);
        } else {
          setPriorLabel("");
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [startDate, endDate, liveOnly]);

  const isCallCenterSegment = clientSegment === "CALL_CENTER";
  /** Media Buyer lens only makes sense on paid-ads clients. */
  const effectiveLens: DeptLens =
    deptLens === "media_buyer" && isCallCenterSegment ? "overview" : deptLens;

  const chartMetrics = useMemo(() => {
    if (effectiveLens === "media_buyer") return MEDIA_CHART_METRICS;
    if (effectiveLens === "ccm") {
      return isCallCenterSegment ? CCM_CHART_METRICS_HE : CCM_CHART_METRICS_RM;
    }
    return isCallCenterSegment ? HE_CHART_METRICS : RM_CHART_METRICS;
  }, [effectiveLens, isCallCenterSegment]);

  const segmentRows = useMemo(() => {
    return rows.filter(r =>
      isCallCenterSegment
        ? usesCallCenterKpiLayout(r.reporting_type)
        : !usesCallCenterKpiLayout(r.reporting_type),
    );
  }, [rows, isCallCenterSegment]);

  const freshLaunches = useMemo(() => {
    return [...segmentRows.filter(r => r.is_fresh_launch)].sort(
      (a, b) => (a.fresh?.days_since_launch ?? 0) - (b.fresh?.days_since_launch ?? 0),
    );
  }, [segmentRows]);

  const filtered = useMemo(() => {
    let list = segmentRows.filter(r => !r.is_fresh_launch);
    if (hideInactive) list = list.filter(r => r.has_activity);
    return list;
  }, [segmentRows, hideInactive]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const dir = sortAsc ? 1 : -1;
    list.sort((a, b) => {
      if (sortKey === "name") {
        return dir * a.client_name.localeCompare(b.client_name);
      }
      if (sortKey === "dept_status") {
        return (
          dir *
          (TIER_WEIGHT[deptStatus(a, effectiveLens, isCallCenterSegment)] -
            TIER_WEIGHT[deptStatus(b, effectiveLens, isCallCenterSegment)])
        );
      }
      if (sortKey === "priority" || sortKey === "focus") {
        if (effectiveLens !== "overview") {
          const da = TIER_WEIGHT[deptStatus(a, effectiveLens, isCallCenterSegment)];
          const db = TIER_WEIGHT[deptStatus(b, effectiveLens, isCallCenterSegment)];
          if (da !== db) return dir * (da - db);
        }
        return dir * (computePriorityScore(a) - computePriorityScore(b));
      }
      if (sortKey === "show_rate") {
        return dir * (a.current.metrics.net_show_pct - b.current.metrics.net_show_pct);
      }
      if (sortKey === "cps") {
        return dir * (a.current.metrics.cp_conversation - b.current.metrics.cp_conversation);
      }
      if (sortKey === "booking_rate") {
        const av = isCallCenterSegment
          ? a.current.metrics.lead_booking_rate
          : a.current.metrics.appt_booking_rate;
        const bv = isCallCenterSegment
          ? b.current.metrics.lead_booking_rate
          : b.current.metrics.appt_booking_rate;
        return dir * (av - bv);
      }
      if (sortKey === "hand_raise") {
        return dir * (a.current.metrics.hand_raise_rate - b.current.metrics.hand_raise_rate);
      }
      if (sortKey === "conv_rate") {
        return dir * (a.current.metrics.conversation_rate - b.current.metrics.conversation_rate);
      }
      if (sortKey === "cpl") {
        const av = a.recent?.cpl ?? a.current.metrics.cpl;
        const bv = b.recent?.cpl ?? b.current.metrics.cpl;
        return dir * (av - bv);
      }
      if (sortKey === "cpql") {
        const av = a.recent?.cpql ?? a.current.cpql;
        const bv = b.recent?.cpql ?? b.current.cpql;
        return dir * (av - bv);
      }
      if (sortKey === "dials") {
        return dir * (a.current.metrics.outbound_dials - b.current.metrics.outbound_dials);
      }
      if (sortKey === "leads") {
        return dir * (a.current.metrics.new_leads - b.current.metrics.new_leads);
      }
      return 0;
    });
    return list;
  }, [filtered, sortKey, sortAsc, effectiveLens, isCallCenterSegment]);

  const summary = useMemo(() => {
    const active = filtered.filter(r => r.has_activity);
    const deptCritical = active.filter(
      r => deptStatus(r, effectiveLens, isCallCenterSegment) === "critical",
    ).length;
    const deptBelow = active.filter(
      r => deptStatus(r, effectiveLens, isCallCenterSegment) === "below",
    ).length;
    const deptOk = active.filter(r => {
      const t = deptStatus(r, effectiveLens, isCallCenterSegment);
      return t === "at" || t === "above";
    }).length;
    return {
      active: active.length,
      fresh_launches: freshLaunches.length,
      dept_critical: deptCritical,
      dept_below: deptBelow,
      dept_ok: deptOk,
      ...summaryStats,
    };
  }, [filtered, freshLaunches.length, summaryStats, effectiveLens, isCallCenterSegment]);

  const chartData = useMemo(() => {
    return sorted.slice(0, 20).map(r => {
      let value = 0;
      if (chartMetric === "priority" || chartMetric === "dept_status") {
        value =
          effectiveLens === "overview"
            ? computePriorityScore(r)
            : TIER_WEIGHT[deptStatus(r, effectiveLens, isCallCenterSegment)];
      } else if (chartMetric === "show_rate") value = r.current.metrics.net_show_pct;
      else if (chartMetric === "cps") value = r.current.metrics.cp_conversation;
      else if (chartMetric === "booking_rate") {
        value = isCallCenterSegment
          ? r.current.metrics.lead_booking_rate
          : r.current.metrics.appt_booking_rate;
      } else if (chartMetric === "hand_raise") value = r.current.metrics.hand_raise_rate;
      else if (chartMetric === "conv_rate") value = r.current.metrics.conversation_rate;
      else if (chartMetric === "cpl") value = r.recent?.cpl ?? r.current.metrics.cpl;
      else if (chartMetric === "cpql") value = r.recent?.cpql ?? r.current.cpql;
      else if (chartMetric === "dials") value = r.current.metrics.outbound_dials;
      else if (chartMetric === "leads") value = r.current.metrics.new_leads;
      return {
        name: r.client_name.length > 18 ? `${r.client_name.slice(0, 16)}…` : r.client_name,
        fullName: r.client_name,
        value: Math.round(value * 10) / 10,
        tier: deptStatus(r, effectiveLens, isCallCenterSegment),
      };
    });
  }, [sorted, chartMetric, effectiveLens, isCallCenterSegment]);

  function handleSegmentChange(segment: ClientSegment) {
    setClientSegment(segment);
    setExpandedId(null);
    if (segment === "CALL_CENTER" && deptLens === "media_buyer") {
      setDeptLens("ccm");
      setSortKey("dept_status");
      setChartMetric("booking_rate");
      return;
    }
    if (segment === "CALL_CENTER") {
      if (sortKey === "cps" || sortKey === "cpl" || sortKey === "cpql" || sortKey === "hand_raise") {
        setSortKey(deptLens === "ccm" ? "dept_status" : "priority");
      }
      if (
        chartMetric === "cps" ||
        chartMetric === "cpl" ||
        chartMetric === "cpql" ||
        chartMetric === "hand_raise"
      ) {
        setChartMetric(deptLens === "ccm" ? "booking_rate" : "priority");
      }
    }
  }

  function handleDeptChange(lens: DeptLens) {
    setDeptLens(lens);
    setExpandedId(null);
    if (lens === "media_buyer") {
      setClientSegment("RM");
      setSortKey("cpql");
      setSortAsc(false);
      setChartMetric("cpql");
    } else if (lens === "ccm") {
      setSortKey("dept_status");
      setSortAsc(false);
      setChartMetric(isCallCenterSegment ? "booking_rate" : "hand_raise");
    } else {
      setSortKey("priority");
      setChartMetric("priority");
    }
  }

  const selectStyle = {
    background: "#0f2040",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    outline: "none",
  } as React.CSSProperties;

  const deptMeta = DEPT_TABS.find(t => t.key === effectiveLens) ?? DEPT_TABS[0];

  const tableHeaders = useMemo(() => {
    if (effectiveLens === "media_buyer") {
      return ["Client", "Media status", "7d CPL", "7d CPQL", "30d CPL", "30d CPQL", "Leads", "Qual %", "Follow-up", ""];
    }
    if (effectiveLens === "ccm") {
      return isCallCenterSegment
        ? ["Client", "CCM status", "30d book", "30d show", "Conv %", "7d book", "Leads", "Dials", "Follow-up", ""]
        : ["Client", "CCM status", "Hand-raise", "Booking", "Show", "Conv %", "7d hand-raise", "Follow-up", ""];
    }
    return isCallCenterSegment
      ? ["Client", "Focus", "30d status", `7d book`, "Follow-up", "Leads", "Dials", "30d book", "30d show", ""]
      : ["Client", "Focus", "30d CPConv", "7d CPL", "7d CPQL", "7d qual", "7d hand-raise", "30d show", "Follow-up", ""];
  }, [effectiveLens, isCallCenterSegment]);

  if (detail) {
    return (
      <>
        <ClientHealthDetail
          clientId={detail.id}
          clientName={detail.name}
          startDate={startDate}
          endDate={endDate}
          lens={detail.lens}
          onBack={() => setDetail(null)}
          onOpenClientFile={() => setFileFor({ id: detail.id, name: detail.name })}
        />
        {fileFor && (
          <ClientFile
            clientId={fileFor.id}
            fallbackName={fileFor.name}
            onClose={() => setFileFor(null)}
          />
        )}
      </>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" style={{ color: "#334155" }}>
        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm font-medium">Loading client health…</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
          Client Success
        </h2>
        <p className="text-sm mt-1 max-w-3xl" style={{ color: "#475569" }}>
          {deptMeta.blurb}{" "}
          <span style={{ color: "#94a3b8" }}>
            Baseline: {startDate} → {endDate}
            {maturity?.leading_start && maturity?.leading_end ? (
              <> · Leading: {maturity.leading_start} → {maturity.leading_end}</>
            ) : null}
          </span>
          {priorLabel ? (
            <span style={{ color: "#64748b" }}> · vs prior ({priorLabel})</span>
          ) : null}
        </p>
        </div>
        <Link
          href={churnFormHref()}
          className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap shrink-0"
          style={{ color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
        >
          Churn offboarding →
        </Link>
      </div>

      {/* Department lens — same data, role-specific columns */}
      <div className="flex flex-wrap gap-1 p-1 rounded-xl w-fit" style={{ background: "#0a1628" }}>
        {DEPT_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleDeptChange(t.key)}
            title={t.rmOnly ? "Paid-ads clients only (CPL / CPQL)" : t.blurb}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={
              deptLens === t.key
                ? { background: "#38bdf8", color: "#0a1628" }
                : { color: "#64748b" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Client type segment */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "#0a1628" }}>
        {SEGMENT_TABS.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleSegmentChange(t.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={
              clientSegment === t.key
                ? { background: "#f59e0b", color: "#fff" }
                : { color: "#475569" }
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        className="rounded-xl px-4 py-3 text-xs leading-relaxed"
        style={{ background: "#0a1628", border: "1px solid rgba(56,189,248,0.18)", color: "#94a3b8" }}
      >
        {effectiveLens === "media_buyer" ? (
          <>
            <span style={{ color: "#38bdf8", fontWeight: 600 }}>Media Buyer lens.</span>{" "}
            Status = worst of CPL / CPQL / lead→qualified (leading 7d preferred). Account CPConv lives on Overview — not your scorecard.
          </>
        ) : effectiveLens === "ccm" ? (
          <>
            <span style={{ color: "#38bdf8", fontWeight: 600 }}>CCM lens.</span>{" "}
            Status = worst of booking, hand-raise, show, and conversation rate. Account CPConv lives on Overview — not your scorecard.
          </>
        ) : (
          <>
            <span style={{ color: "#38bdf8", fontWeight: 600 }}>Two windows.</span>{" "}
            <strong>Baseline</strong> ({startDate} → {endDate}) ends {MATURITY_DAYS} days before today so CPConv, show, and close reflect resolved cohorts.{" "}
            <strong>Leading</strong> (
            {maturity?.leading_start ?? "…"} → {maturity?.leading_end ?? "today"}) is calendar-last {LEADING_WINDOW_DAYS} days through today. Act now = north-star 911 only.
          </>
        )}
      </div>

      {/* Summary — dept lens uses department KPI status; overview keeps focus buckets */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        {(effectiveLens === "overview"
          ? [
              { label: "Fresh launches", value: summary.fresh_launches, color: "#38bdf8" },
              { label: "Act now", value: summary.act_now, color: "#f87171" },
              { label: "Monitor", value: summary.monitor, color: "#fbbf24" },
              { label: "Recovering", value: summary.recovering, color: "#38bdf8" },
              { label: "On track", value: summary.on_track, color: "#34d399" },
              { label: "Active clients", value: summary.active, color: "#e2e8f0" },
            ]
          : [
              { label: "Fresh launches", value: summary.fresh_launches, color: "#38bdf8" },
              { label: "911 / critical", value: summary.dept_critical, color: "#f87171" },
              { label: "Below KPI", value: summary.dept_below, color: "#fbbf24" },
              { label: "At / above", value: summary.dept_ok, color: "#34d399" },
              { label: "Reviews overdue", value: summary.follow_up_overdue, color: "#fb7185" },
              { label: "Active clients", value: summary.active, color: "#e2e8f0" },
            ]
        ).map(s => (
          <div
            key={s.label}
            className="rounded-xl px-4 py-3"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#475569" }}>
              {s.label}
            </p>
            <p className="text-2xl font-bold mt-1" style={{ color: s.color }}>
              {s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          style={{ ...selectStyle, background: "#f59e0b", color: "#fff", border: "none", fontWeight: 600 }}
          value={gradeWindow}
          onChange={e => setGradeWindow(e.target.value as GradeWindow)}
          title="Standardized grading window — independent of the global date filter. Compared to the prior equal period."
        >
          {(Object.keys(GRADE_WINDOW_LABELS) as GradeWindow[]).map(w => (
            <option key={w} value={w} style={{ background: "#0f2040", color: "#e2e8f0" }}>
              {GRADE_WINDOW_LABELS[w]}
            </option>
          ))}
        </select>
        <select style={selectStyle} value={sortKey} onChange={e => setSortKey(e.target.value as SortKey)}>
          {effectiveLens !== "overview" && (
            <option value="dept_status">Sort: Dept status</option>
          )}
          <option value="priority">Sort: Focus priority</option>
          {effectiveLens === "media_buyer" && (
            <>
              <option value="cpql">Sort: CPQL</option>
              <option value="cpl">Sort: CPL</option>
              <option value="leads">Sort: Lead volume</option>
            </>
          )}
          {effectiveLens === "ccm" && (
            <>
              {!isCallCenterSegment && <option value="hand_raise">Sort: Hand-raise</option>}
              <option value="booking_rate">Sort: Booking rate</option>
              <option value="show_rate">Sort: Show rate</option>
              <option value="conv_rate">Sort: Conversation %</option>
              {isCallCenterSegment && <option value="dials">Sort: Outbound dials</option>}
            </>
          )}
          {effectiveLens === "overview" && (
            <>
              <option value="focus">Sort: Focus label</option>
              <option value="show_rate">Sort: Show rate</option>
              {isCallCenterSegment ? (
                <>
                  <option value="booking_rate">Sort: Booking rate (÷ leads)</option>
                  <option value="dials">Sort: Outbound dials</option>
                </>
              ) : (
                <>
                  <option value="cps">Sort: Cost per conversation</option>
                  <option value="leads">Sort: Lead volume</option>
                </>
              )}
            </>
          )}
          <option value="name">Sort: Name</option>
        </select>
        <button
          type="button"
          onClick={() => setSortAsc(v => !v)}
          className="px-3 py-2 rounded-lg text-sm font-medium"
          style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8" }}
        >
          {sortAsc ? "↑ Ascending" : "↓ Descending"}
        </button>
        <select style={selectStyle} value={chartMetric} onChange={e => setChartMetric(e.target.value as SortKey)}>
          {chartMetrics.map(m => (
            <option key={m.key} value={m.key}>
              Chart: {m.label}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#64748b" }}>
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={e => setLiveOnly(e.target.checked)}
            className="rounded"
          />
          Live clients only
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer" style={{ color: "#64748b" }}>
          <input
            type="checkbox"
            checked={hideInactive}
            onChange={e => setHideInactive(e.target.checked)}
            className="rounded"
          />
          Hide no baseline data
        </label>
      </div>

      {/* Fresh launches — first 14 days after launch */}
      {freshLaunches.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "#0a1628", border: "1px solid rgba(56,189,248,0.22)" }}
        >
          <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: "1px solid rgba(56,189,248,0.12)" }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: "#38bdf8" }}>
                Fresh launches
              </h3>
              <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                First {FRESH_LAUNCH_DAYS} days after launch — graded on CPL, CPQL, qual %, and booking (no CPConv yet).
              </p>
            </div>
            <span className="text-xs font-semibold px-2 py-1 rounded-lg" style={{ color: "#38bdf8", background: "rgba(56,189,248,0.12)" }}>
              {freshLaunches.length} client{freshLaunches.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {(isCallCenterSegment
                    ? ["Client", "Day", "Status", "Booking %", "Leads", "Dials", ""]
                    : ["Client", "Day", "Status", "CPL", "CPQL", "Qual %", "Booking %", "Leads", ""]
                  ).map(h => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest"
                      style={{ color: "#475569" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {freshLaunches.map(row => {
                  const day = (row.fresh?.days_since_launch ?? 0) + 1;
                  return (
                    <tr
                      key={row.client_id}
                      className="cursor-pointer transition-colors"
                      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                      onClick={() => setDetail({ id: row.client_id, name: row.client_name, lens: effectiveLens })}
                    >
                      <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                        {row.client_name}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-xs" style={{ color: "#94a3b8" }}>
                        Day {day} / {FRESH_LAUNCH_DAYS}
                      </td>
                      <td className="px-4 py-3">
                        <TierBadge tier={row.fresh?.worst_tier ?? "insufficient"} />
                      </td>
                      {isCallCenterSegment ? (
                        <>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                              <KpiDot tier={freshGrade(row, "lead_booking_rate")} />
                              {freshGradeDisplay(row, "lead_booking_rate")}
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums" style={{ color: "#94a3b8" }}>
                            {row.fresh?.leads ?? 0}
                          </td>
                          <td className="px-4 py-3 tabular-nums" style={{ color: "#94a3b8" }}>
                            {row.fresh?.dials ?? 0}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                              <KpiDot tier={freshGrade(row, "cpl")} />
                              {freshGradeDisplay(row, "cpl")}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                              <KpiDot tier={freshGrade(row, "cpql")} />
                              {freshGradeDisplay(row, "cpql")}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                              <KpiDot tier={freshGrade(row, "lead_to_qualified")} />
                              {freshGradeDisplay(row, "lead_to_qualified")}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                              <KpiDot tier={freshGrade(row, "lead_booking_rate")} />
                              {freshGradeDisplay(row, "lead_booking_rate")}
                            </div>
                          </td>
                          <td className="px-4 py-3 tabular-nums" style={{ color: "#94a3b8" }}>
                            {row.fresh?.leads ?? 0}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 text-xs" style={{ color: "#334155" }}>→</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Chart */}
      {chartData.length > 0 && (
        <div
          className="rounded-xl p-4 pt-6"
          style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)", height: Math.max(280, chartData.length * 36) }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 24, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
              <XAxis type="number" tick={{ fill: "#475569", fontSize: 11 }} />
              <YAxis
                type="category"
                dataKey="name"
                width={120}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  background: "#0f2040",
                  border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) => [
                  typeof v === "number" ? v : Number(v ?? 0),
                  chartMetrics.find(m => m.key === chartMetric)?.label ?? "",
                ]}
                labelFormatter={(_, payload) =>
                  payload?.[0]?.payload?.fullName ? String(payload[0].payload.fullName) : ""
                }
              />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={22}>
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={TIER_STYLES[entry.tier].text} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <div className="overflow-x-auto">
            <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {tableHeaders.map(h => (
                  <th
                    key={h}
                    className="text-left px-4 py-3 text-[10px] font-bold uppercase tracking-widest"
                    style={{ color: "#475569" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={tableHeaders.length} className="px-4 py-12 text-center" style={{ color: "#334155" }}>
                    No clients match this filter for the selected period.
                  </td>
                </tr>
              ) : (
                sorted.map(row => {
                  const expanded = expandedId === row.client_id;
                  const m = row.current.metrics;
                  const grade = (key: KpiKey) =>
                    row.current.grades.find(g => g.key === key);
                  const lead = row.recent;
                  const leadGrade = (key: KpiKey) => leadingGradeFor(lead, key);
                  const status = deptStatus(row, effectiveLens, isCallCenterSegment);
                  const bookPct = isCallCenterSegment ? m.lead_booking_rate : m.appt_booking_rate;
                  const bookTier = isCallCenterSegment
                    ? grade("lead_booking_rate")?.tier ?? "insufficient"
                    : rateTierFromBands("booking_rate", m.appt_booking_rate, m.qualified_leads, 5);
                  const convTier = rateTierFromBands(
                    "hand_raise_rate",
                    m.conversation_rate,
                    m.qualified_leads,
                    5,
                  );

                  return (
                    <Fragment key={row.client_id}>
                      <tr
                        className="cursor-pointer transition-colors"
                        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
                        onClick={() => setExpandedId(expanded ? null : row.client_id)}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.02)";
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.background = "";
                        }}
                      >
                        <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                          {row.client_name}
                          {!row.is_live && (
                            <span className="ml-2 text-[10px]" style={{ color: "#475569" }}>
                              offline
                            </span>
                          )}
                        </td>

                        {effectiveLens === "media_buyer" ? (
                          <>
                            <td className="px-4 py-3">
                              <TierBadge tier={status} />
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={leadGrade("cpl")} />
                                ${Math.round(lead?.cpl ?? 0)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={leadGrade("cpql")} />
                                ${Math.round(lead?.cpql ?? 0)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={grade("cpl")?.tier ?? "insufficient"} />
                                ${Math.round(m.cpl)}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={grade("cpql")?.tier ?? "insufficient"} />
                                ${Math.round(row.current.cpql)}
                              </div>
                            </td>
                            <td className="px-4 py-3 tabular-nums" style={{ color: "#94a3b8" }}>
                              {m.new_leads}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={grade("lead_to_qualified")?.tier ?? "insufficient"} />
                                {row.current.lead_to_qualified_pct.toFixed(0)}%
                              </div>
                            </td>
                          </>
                        ) : effectiveLens === "ccm" ? (
                          <>
                            <td className="px-4 py-3">
                              <TierBadge tier={status} />
                            </td>
                            {!isCallCenterSegment && (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                  <KpiDot tier={grade("hand_raise_rate")?.tier ?? "insufficient"} />
                                  {m.hand_raise_rate.toFixed(0)}%
                                </div>
                              </td>
                            )}
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={bookTier} />
                                {bookPct.toFixed(1)}%
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={grade("show_rate")?.tier ?? "insufficient"} />
                                {m.net_show_pct.toFixed(0)}%
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={convTier} />
                                {m.conversation_rate.toFixed(0)}%
                              </div>
                            </td>
                            {isCallCenterSegment ? (
                              <>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                    <KpiDot tier={leadGrade("lead_booking_rate")} />
                                    {(lead?.booking_rate ?? 0).toFixed(1)}%
                                  </div>
                                </td>
                                <td className="px-4 py-3 tabular-nums" style={{ color: "#94a3b8" }}>
                                  {m.new_leads}
                                </td>
                                <td className="px-4 py-3 tabular-nums" style={{ color: "#e2e8f0" }}>
                                  {m.outbound_dials}
                                </td>
                              </>
                            ) : (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                  <KpiDot tier={leadGrade("hand_raise_rate")} />
                                  {(lead?.hand_raise_rate ?? 0).toFixed(0)}%
                                </div>
                              </td>
                            )}
                          </>
                        ) : (
                          <>
                            <td className="px-4 py-3">
                              <FocusBadge focus={row.focus} />
                            </td>
                            <td className="px-4 py-3">
                              {isCallCenterSegment ? (
                                <TierBadge tier={row.current.worst_tier} />
                              ) : (
                                <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                  <KpiDot tier={grade("cps")?.tier ?? "insufficient"} />
                                  ${Math.round(m.cp_conversation)}
                                </div>
                              )}
                            </td>
                            {isCallCenterSegment ? (
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                  <KpiDot tier={leadGrade("lead_booking_rate")} />
                                  {(lead?.booking_rate ?? 0).toFixed(1)}%
                                </div>
                              </td>
                            ) : (
                              <>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                    <KpiDot tier={leadGrade("cpl")} />
                                    ${Math.round(lead?.cpl ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                    <KpiDot tier={leadGrade("cpql")} />
                                    ${Math.round(lead?.cpql ?? 0)}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                    <KpiDot tier={leadGrade("lead_to_qualified")} />
                                    {(lead?.lead_to_qualified_pct ?? 0).toFixed(0)}%
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                    <KpiDot tier={leadGrade("hand_raise_rate")} />
                                    {(lead?.hand_raise_rate ?? 0).toFixed(0)}%
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                    <KpiDot tier={grade("show_rate")?.tier ?? "insufficient"} />
                                    {m.net_show_pct.toFixed(0)}%
                                  </div>
                                </td>
                              </>
                            )}
                          </>
                        )}

                        <td className="px-4 py-3 text-xs" style={{ color: row.open_action?.overdue ? "#f87171" : "#64748b" }}>
                          {row.open_action ? (
                            <>
                              {row.open_action.overdue ? "Overdue · " : "Review · "}
                              {row.open_action.review_date ?? "—"}
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
                        {effectiveLens === "overview" && isCallCenterSegment ? (
                          <>
                            <td className="px-4 py-3 tabular-nums" style={{ color: "#94a3b8" }}>
                              {m.new_leads}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-medium" style={{ color: "#e2e8f0" }}>
                              {m.outbound_dials}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={grade("lead_booking_rate")?.tier ?? "insufficient"} />
                                {m.lead_booking_rate.toFixed(1)}%
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 tabular-nums" style={{ color: "#94a3b8" }}>
                                <KpiDot tier={grade("show_rate")?.tier ?? "insufficient"} />
                                {m.net_show_pct.toFixed(0)}%
                              </div>
                            </td>
                          </>
                        ) : null}
                        <td className="px-4 py-3 text-xs" style={{ color: "#334155" }}>
                          {expanded ? "▲" : "▼"}
                        </td>
                      </tr>
                      {expanded && (
                        <tr key={`${row.client_id}-detail`}>
                          <td colSpan={tableHeaders.length} className="px-4 pb-4 pt-0">
                            <div
                              className="rounded-lg p-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
                              style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.05)" }}
                            >
                              <p className="col-span-full text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: "#475569" }}>
                                {effectiveLens === "overview"
                                  ? `Baseline grades · ${startDate} → ${endDate}`
                                  : `${DEPT_LENS_LABEL[effectiveLens]} lane grades · ${startDate} → ${endDate}`}
                              </p>
                              {gradesForLens(row.current.grades, effectiveLens).map(g => (
                                <div key={g.key}>
                                  <p className="text-[10px] uppercase tracking-wide mb-1" style={{ color: "#475569" }}>
                                    {KPI_META[g.key].short}
                                  </p>
                                  <p className="text-sm font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
                                    {g.display}
                                  </p>
                                  <TierBadge tier={g.tier} />
                                </div>
                              ))}
                              {effectiveLens !== "overview" && (
                                <p className="col-span-full text-[10px] mt-1" style={{ color: "#334155" }}>
                                  Account north star (CPConv) is on Overview — not graded as {DEPT_LENS_LABEL[effectiveLens]} status.
                                </p>
                              )}
                            </div>
                            {row.prior && row.prior.metrics.new_leads + row.prior.metrics.booked_appointments > 0 && (
                              <p className="text-xs mt-2" style={{ color: "#475569" }}>
                                Prior period: {row.prior.metrics.new_leads} leads
                                {isCallCenterSegment ? (
                                  <>
                                    {" "}· {row.prior.metrics.outbound_dials} dials · {row.prior.metrics.lead_booking_rate.toFixed(1)}% book · {row.prior.metrics.net_show_pct.toFixed(0)}% show
                                  </>
                                ) : (
                                  <>
                                    {" "}· {row.prior.metrics.net_show_pct.toFixed(0)}% show · $
                                    {Math.round(row.prior.metrics.cp_conversation)} CPConv
                                  </>
                                )}
                                {" "}· attention score {row.prior.attention_score} → {row.current.attention_score}
                              </p>
                            )}
                            {row.recent && (
                              <div className="mt-3">
                                <p className="text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: "#38bdf8" }}>
                                  Leading {row.recent.window_days}d · {row.recent.start} → {row.recent.end} (calendar · through today)
                                </p>
                                <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums" style={{ color: "#94a3b8" }}>
                                  <span>{row.recent.leads} leads</span>
                                  <span>{row.recent.dials} dials</span>
                                  {isCallCenterSegment ? (
                                    <span>{row.recent.booking_rate.toFixed(1)}% booking (÷ leads)</span>
                                  ) : (
                                    <>
                                      <span>{row.recent.lead_to_qualified_pct.toFixed(0)}% lead→qual</span>
                                      <span>{row.recent.hand_raise_rate.toFixed(0)}% hand-raise</span>
                                      <span style={{ color: "#475569" }}>({row.recent.booking_rate.toFixed(0)}% booked)</span>
                                      <span>
                                        CPL ${Math.round(row.recent.cpl)} · CPQL ${Math.round(row.recent.cpql)}
                                      </span>
                                      <span>{row.recent.conversations} conv (LT+show+claimed)</span>
                                    </>
                                  )}
                                  <span style={{ color: row.recent.momentum === "improving" ? "#34d399" : row.recent.momentum === "slipping" ? "#f87171" : "#64748b" }}>
                                    {row.recent.momentum}
                                  </span>
                                </div>
                                {!isCallCenterSegment && row.recent.leading_grades.length > 0 ? (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {row.recent.leading_grades.map(g => (
                                      <span key={g.key} className="text-[10px] inline-flex items-center gap-1" style={{ color: "#64748b" }}>
                                        <KpiDot tier={g.tier} />
                                        {KPI_META[g.key].short}: {g.display}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            )}
                            {isCallCenterSegment && (
                              <p className="text-[10px] mt-2" style={{ color: "#475569" }}>
                                HE booking rate = appointments booked ÷ total leads (not qualified leads).
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={() => setDetail({ id: row.client_id, name: row.client_name, lens: effectiveLens })}
                              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
                              style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa", border: "1px solid rgba(96,165,250,0.3)" }}
                            >
                              Open diagnosis, KPI standards & action log →
                            </button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <PendingInterventionsPanel
        interventions={pendingInterventions}
        segment={clientSegment}
        onOpenClient={(id, name) => setDetail({ id, name, lens: effectiveLens })}
      />

      <p className="text-[10px]" style={{ color: "#334155" }}>
        {effectiveLens === "media_buyer" ? (
          <>Media Buyer: status = worst of CPL / CPQL / lead→qualified. Expanded grades show your lane only.</>
        ) : effectiveLens === "ccm" ? (
          <>
            CCM: status = worst of booking, hand-raise, show, and conversation %
            {isCallCenterSegment ? " (HE booking ÷ total leads)." : " (RM booking ÷ qualified)."} Account CPConv is on Overview.
          </>
        ) : isCallCenterSegment ? (
          <>
            HE baseline: 30d matured booking + show. Leading {LEADING_WINDOW_DAYS}d booking in table. Act now = north-star 911 only; leading reds = Monitor / Leading watch.
          </>
        ) : (
          <>
            RM baseline: 30d matured CPConv north star. Leading {LEADING_WINDOW_DAYS}d CPL/CPQL/qual/hand-raise in table.
            Act now = CPConv 911 only; leading cost/funnel reds = Monitor / Leading watch.
          </>
        )}
      </p>
    </div>
  );
}
