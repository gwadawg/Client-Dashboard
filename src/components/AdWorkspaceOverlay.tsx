"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { adFormatLabel } from "@/lib/ad-formats";
import type { AdTagRef } from "@/lib/ad-tags";

export type AdWorkspaceLibrary = {
  id: string;
  status: string;
  ad_format: string | null;
  product: string | null;
  summary: string | null;
  visual_notes: string | null;
  drive_url: string | null;
  thumbnail_url: string | null;
  tags?: AdTagRef[];
};

export type AdWorkspaceAd = {
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  leads: number;
  qualified: number;
  qualified_rate: number | null;
  appointments: number;
  shows: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
  cost_per_show: number | null;
  hand_raise_rate: number | null;
  conversation_rate: number | null;
  unique_hand_raises: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  client_count: number;
  library: AdWorkspaceLibrary | null;
  variant_names: string[];
};

export type AdWorkspaceClientRow = {
  client_id: string;
  client_name: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  unique_hand_raises: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
  cost_per_show: number | null;
  qualified_rate: number | null;
  hand_raise_rate: number | null;
  conversation_rate: number | null;
};

export type AdWorkspaceDaily = {
  date: string;
  spend: number;
  leads: number;
  qualified: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
  qualified_rate: number | null;
  hand_raise_rate: number | null;
  conversation_rate: number | null;
};

export type AdWorkspaceClientDaily = AdWorkspaceDaily & { client_id: string };

export type AdWorkspaceVariant = {
  ad_name: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
};

export type AdWorkspaceDrilldown = {
  ad_name: string;
  granularity: "day" | "week";
  perClient: AdWorkspaceClientRow[];
  daily: AdWorkspaceDaily[];
  perClientDaily: AdWorkspaceClientDaily[];
  variants?: AdWorkspaceVariant[];
};

type Props = {
  ad: AdWorkspaceAd;
  drilldown: AdWorkspaceDrilldown | "loading" | null;
  formatLabels: Record<string, string>;
  onClose: () => void;
  onViewInLibrary: (libraryId: string) => void;
  onAddToLibrary: (adName: string) => void;
};

const PRODUCT_LABELS: Record<string, string> = {
  reverse: "RM",
  dscr: "DSCR",
  broad_forward: "Broad Forward",
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  winner: { bg: "rgba(245,158,11,0.14)", text: "#fbbf24", label: "Winner" },
  active: { bg: "rgba(52,211,153,0.12)", text: "#34d399", label: "Active" },
  paused: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", label: "Paused" },
  archived: { bg: "rgba(100,116,139,0.1)", text: "#64748b", label: "Archived" },
};

const CLIENT_LINE_COLORS = [
  "#38bdf8",
  "#34d399",
  "#f472b6",
  "#a78bfa",
  "#fbbf24",
  "#fb7185",
  "#2dd4bf",
  "#c084fc",
];

type CostKey = "cpl" | "cost_per_qualified" | "cp_conversation" | "cp_proposal" | "cp_submission" | "cp_funded";
type RateKey = "qualified_rate" | "hand_raise_rate" | "conversation_rate";

const COST_CHARTS: { key: CostKey; title: string; subtitle: string }[] = [
  { key: "cpl", title: "CPL", subtitle: "Spend ÷ leads" },
  { key: "cost_per_qualified", title: "CPQL", subtitle: "Spend ÷ qualified" },
  { key: "cp_conversation", title: "CPCONV", subtitle: "Spend ÷ unique conversations" },
];

const BACKEND_COST_CHARTS: { key: CostKey; title: string; subtitle: string }[] = [
  { key: "cp_proposal", title: "CPP", subtitle: "Spend ÷ unique proposals" },
  { key: "cp_submission", title: "CPS", subtitle: "Spend ÷ unique submissions" },
  { key: "cp_funded", title: "CPF", subtitle: "Spend ÷ unique funded borrowers" },
];

const RATE_CHARTS: { key: RateKey; title: string; subtitle: string; color: string }[] = [
  { key: "qualified_rate", title: "Qual %", subtitle: "Qualified ÷ leads", color: "#22c55e" },
  { key: "hand_raise_rate", title: "Hand-raise %", subtitle: "Unique booked ∪ claimed ∪ LT ÷ qualified", color: "#f59e0b" },
  { key: "conversation_rate", title: "Conversation %", subtitle: "Unique show ∪ claimed ∪ LT ÷ qualified", color: "#a78bfa" },
];

function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function moneyExact(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function num(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function formatDateLabel(date: string, granularity: "day" | "week"): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) +
    (granularity === "week" ? " (wk)" : "")
  );
}

function driveThumb(entry: { drive_url: string | null; thumbnail_url: string | null }): string | null {
  if (entry.thumbnail_url) return entry.thumbnail_url;
  const url = entry.drive_url;
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w600`;
  return null;
}

function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: `${color}20`, color, fontFamily: "var(--font-plex-mono)" }}
    >
      {label}
    </span>
  );
}

function Sparkline({ values, color = "#f59e0b" }: { values: Array<number | null>; color?: string }) {
  const nums = values.filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min || 1;
  const w = 72;
  const h = 22;
  const pts = values
    .map((v, i) => {
      if (v == null) return null;
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <polyline fill="none" stroke={color} strokeWidth="1.6" points={pts} />
    </svg>
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function diagnose(clients: AdWorkspaceClientRow[], dailyByClient: Map<string, AdWorkspaceClientDaily[]>): {
  tone: "fatigue" | "account" | "mixed" | "thin";
  text: string;
} {
  const withConv = clients.filter((c) => c.cp_conversation != null && c.spend > 0);
  if (withConv.length < 2) {
    return {
      tone: "thin",
      text: "Not enough accounts on this ad to separate creative fatigue from an account issue. Compare the blended cost charts over the range.",
    };
  }

  let rising = 0;
  let scored = 0;
  for (const c of withConv) {
    const series = (dailyByClient.get(c.client_id) ?? [])
      .map((p) => p.cp_conversation)
      .filter((v): v is number => v != null);
    if (series.length < 4) continue;
    scored += 1;
    const half = Math.floor(series.length / 2);
    const first = series.slice(0, half).reduce((s, v) => s + v, 0) / half;
    const last = series.slice(series.length - half).reduce((s, v) => s + v, 0) / half;
    if (first > 0 && last > first * 1.15) rising += 1;
  }

  if (scored >= 2 && rising / scored >= 0.6) {
    return {
      tone: "fatigue",
      text: "Most accounts are drifting up together — this looks like creative fatigue / concept decay, not a single client problem.",
    };
  }

  const costs = withConv.map((c) => c.cp_conversation as number);
  const mid = median(costs);
  const outlier = mid != null
    ? withConv.find((c) => (c.cp_conversation as number) > mid * 1.5)
    : undefined;
  if (outlier && withConv.length >= 3) {
    return {
      tone: "account",
      text: `CPCONV is concentrated on ${outlier.client_name} (${money(outlier.cp_conversation)} vs blended). Treat this as an account issue — audience, landing, setters, or spend ramp — not the ad.`,
    };
  }

  return {
    tone: "mixed",
    text: "Performance is mixed across accounts. Use the per-client overlay to see whether a spike is global or isolated.",
  };
}

type ChartMode = "blended" | "clients";

export default function AdWorkspaceOverlay({
  ad,
  drilldown,
  formatLabels,
  onClose,
  onViewInLibrary,
  onAddToLibrary,
}: Props) {
  const [mode, setMode] = useState<ChartMode>("blended");
  const [pinned, setPinned] = useState<string[]>([]);
  const [platformOpen, setPlatformOpen] = useState(true);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clients = drilldown && drilldown !== "loading" ? drilldown.perClient : [];
  const daily = drilldown && drilldown !== "loading" ? drilldown.daily : [];
  const granularity = drilldown && drilldown !== "loading" ? drilldown.granularity : "day";

  const dailyByClient = useMemo(() => {
    const map = new Map<string, AdWorkspaceClientDaily[]>();
    if (!drilldown || drilldown === "loading") return map;
    for (const p of drilldown.perClientDaily ?? []) {
      const list = map.get(p.client_id) ?? [];
      list.push(p);
      map.set(p.client_id, list);
    }
    return map;
  }, [drilldown]);

  const diagnosis = useMemo(
    () => diagnose(clients, dailyByClient),
    [clients, dailyByClient],
  );

  const defaultClientIds = useMemo(() => {
    const bySpend = [...clients].sort((a, b) => b.spend - a.spend);
    const top = bySpend.slice(0, 6).map((c) => c.client_id);
    const costs = clients
      .map((c) => c.cp_conversation)
      .filter((v): v is number => v != null);
    const mid = median(costs);
    const outlier = mid != null
      ? clients.find((c) => c.cp_conversation != null && c.cp_conversation > mid * 1.5)
      : undefined;
    if (outlier && !top.includes(outlier.client_id)) top.push(outlier.client_id);
    return top;
  }, [clients]);

  const visibleClientIds = pinned.length > 0 ? pinned : defaultClientIds;
  const clientColor = useMemo(() => {
    const map = new Map<string, string>();
    visibleClientIds.forEach((id, i) => map.set(id, CLIENT_LINE_COLORS[i % CLIENT_LINE_COLORS.length]));
    return map;
  }, [visibleClientIds]);

  const blendedChartData = useMemo(
    () =>
      daily.map((p) => ({
        ...p,
        label: formatDateLabel(p.date, granularity),
      })),
    [daily, granularity],
  );

  const clientChartData = useMemo(() => {
    const byDate = new Map<string, Record<string, number | string | null>>();
    for (const p of daily) {
      byDate.set(p.date, { date: p.date, label: formatDateLabel(p.date, granularity) });
    }
    for (const id of visibleClientIds) {
      for (const p of dailyByClient.get(id) ?? []) {
        const row = byDate.get(p.date) ?? { date: p.date, label: formatDateLabel(p.date, granularity) };
        row[id] = p.cp_conversation;
        byDate.set(p.date, row);
      }
    }
    return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  }, [daily, dailyByClient, granularity, visibleClientIds]);

  const thumb = ad.library ? driveThumb(ad.library) : null;
  const blendedCpconv = ad.cp_conversation;

  function togglePin(clientId: string) {
    setMode("clients");
    setPinned((prev) => (prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]));
  }

  const diagnosisStyle =
    diagnosis.tone === "fatigue"
      ? { border: "1px solid rgba(251,191,36,0.35)", background: "rgba(251,191,36,0.08)", color: "#fbbf24" }
      : diagnosis.tone === "account"
        ? { border: "1px solid rgba(248,113,113,0.35)", background: "rgba(248,113,113,0.08)", color: "#fca5a5" }
        : { border: "1px solid rgba(148,163,184,0.25)", background: "rgba(15,32,64,0.8)", color: "#94a3b8" };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(2,6,14,0.72)" }}>
      <div
        className="flex-1 min-h-0 m-3 md:m-5 rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#080f1e", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 24px 80px rgba(0,0,0,0.45)" }}
      >
        <header
          className="flex items-start gap-4 px-5 py-4 flex-shrink-0"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "#0a1424" }}
        >
          <button
            type="button"
            onClick={onClose}
            className="mt-1 px-3 py-1.5 rounded-lg text-xs uppercase tracking-wider"
            style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)", fontFamily: "var(--font-plex-mono)" }}
          >
            Back
          </button>
          {thumb ? (
            <img src={thumb} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
          ) : (
            <div className="w-16 h-16 rounded-lg flex-shrink-0" style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }} />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold truncate" style={{ color: "#e2e8f0" }}>{ad.ad_name}</h2>
              {ad.library ? (
                <Badge
                  label={(STATUS_STYLES[ad.library.status] ?? STATUS_STYLES.active).label}
                  color={(STATUS_STYLES[ad.library.status] ?? STATUS_STYLES.active).text}
                />
              ) : (
                <Badge label="Unsourced" color="#64748b" />
              )}
              {ad.library?.product ? (
                <Badge label={PRODUCT_LABELS[ad.library.product] ?? ad.library.product} color="#38bdf8" />
              ) : null}
              {ad.library?.ad_format ? (
                <Badge label={adFormatLabel(ad.library.ad_format, formatLabels)} color="#60a5fa" />
              ) : null}
              {(ad.library?.tags ?? []).map((t) => (
                <Badge key={t.slug} label={t.label} color="#34d399" />
              ))}
            </div>
            {ad.variant_names.length > 1 ? (
              <p className="text-[11px] mt-1 truncate" style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}>
                {ad.variant_names.join(" · ")}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 mt-2">
              {ad.library ? (
                <button type="button" className="text-[11px] underline" style={{ color: "#f59e0b" }} onClick={() => onViewInLibrary(ad.library!.id)}>
                  View in library
                </button>
              ) : (
                <button type="button" className="text-[11px] underline" style={{ color: "#f59e0b" }} onClick={() => onAddToLibrary(ad.ad_name)}>
                  Add to library
                </button>
              )}
              {ad.library?.drive_url ? (
                <a href={ad.library.drive_url} target="_blank" rel="noreferrer" className="text-[11px] underline" style={{ color: "#60a5fa" }}>
                  Creative
                </a>
              ) : null}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
          {drilldown === "loading" || !drilldown ? (
            <p className="text-sm py-16 text-center" style={{ color: "#475569" }}>Loading ad workspace…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-12 gap-2">
                {[
                  { label: "Spend", value: money(ad.spend), tip: "Meta spend in range" },
                  { label: "Impr", value: num(ad.impressions), tip: "Impressions in range" },
                  { label: "Clicks", value: num(ad.clicks), tip: "Link clicks in range" },
                  { label: "CTR", value: pct(ad.ctr), tip: "Clicks ÷ impressions" },
                  { label: "CPC", value: moneyExact(ad.cpc), tip: "Spend ÷ clicks" },
                  { label: "CPM", value: moneyExact(ad.cpm), tip: "Spend ÷ impressions × 1000" },
                  { label: "Leads", value: num(ad.leads), tip: "Attributed lead events" },
                  { label: "Qual %", value: pct(ad.qualified_rate), tip: "Qualified ÷ leads", spark: daily.map((p) => p.qualified_rate) },
                  { label: "CPL", value: moneyExact(ad.cpl), tip: "Spend ÷ leads", spark: daily.map((p) => p.cpl) },
                  { label: "CPQL", value: moneyExact(ad.cost_per_qualified), tip: "Spend ÷ qualified", spark: daily.map((p) => p.cost_per_qualified) },
                  { label: "CPCONV", value: moneyExact(ad.cp_conversation), tip: "Spend ÷ unique (show ∪ claimed ∪ LT)", spark: daily.map((p) => p.cp_conversation) },
                  { label: "Hand-raise", value: pct(ad.hand_raise_rate), tip: "Unique booked ∪ claimed ∪ LT ÷ qualified", spark: daily.map((p) => p.hand_raise_rate) },
                  { label: "Conv %", value: pct(ad.conversation_rate), tip: "Unique conversations ÷ qualified", spark: daily.map((p) => p.conversation_rate) },
                  { label: "Proposals", value: num(ad.unique_proposals ?? 0), tip: "Unique proposal ∪ submission ∪ funded" },
                  { label: "Submissions", value: num(ad.unique_submissions ?? 0), tip: "Unique submission ∪ funded" },
                  { label: "Funded", value: num(ad.unique_funded ?? 0), tip: "Unique funded borrowers" },
                  { label: "CPP", value: moneyExact(ad.cp_proposal), tip: "Spend ÷ unique proposals", spark: daily.map((p) => p.cp_proposal) },
                  { label: "CPS", value: moneyExact(ad.cp_submission), tip: "Spend ÷ unique submissions", spark: daily.map((p) => p.cp_submission) },
                  { label: "CPF", value: moneyExact(ad.cp_funded), tip: "Spend ÷ unique funded", spark: daily.map((p) => p.cp_funded) },
                ].map((tile) => (
                  <div
                    key={tile.label}
                    className="rounded-xl p-3"
                    title={tile.tip}
                    style={{ background: "linear-gradient(180deg, #0f2040 0%, #0a1628 100%)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}>{tile.label}</p>
                    <p className="text-lg font-semibold tabular-nums mt-1" style={{ color: "#e2e8f0" }}>{tile.value}</p>
                    {tile.spark ? <div className="mt-1"><Sparkline values={tile.spark} /></div> : null}
                  </div>
                ))}
              </div>

              <div className="rounded-xl px-4 py-3 text-sm" style={diagnosisStyle}>
                <span className="text-[10px] uppercase tracking-wider mr-2" style={{ fontFamily: "var(--font-plex-mono)", opacity: 0.8 }}>
                  {diagnosis.tone === "fatigue" ? "Fatigue" : diagnosis.tone === "account" ? "Account" : diagnosis.tone === "thin" ? "Thin sample" : "Read"}
                </span>
                {diagnosis.text}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[10px] uppercase tracking-wider mr-1" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>
                  Cost overlay
                </p>
                {(["blended", "clients"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className="px-2.5 py-1 rounded-md text-[11px]"
                    style={{
                      fontFamily: "var(--font-plex-mono)",
                      background: mode === m ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.03)",
                      color: mode === m ? "#fbbf24" : "#94a3b8",
                      border: mode === m ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {m === "blended" ? "All accounts combined" : "Lines per client"}
                  </button>
                ))}
                {granularity === "week" ? (
                  <span className="text-[10px]" style={{ color: "#475569" }}>Weekly buckets (range over 90 days)</span>
                ) : null}
              </div>

              {mode === "blended" ? (
                <div className="grid gap-4 md:grid-cols-3">
                  {COST_CHARTS.map((chart) => (
                    <CostPanel key={chart.key} chart={chart} data={blendedChartData} granularity={granularity} />
                  ))}
                </div>
              ) : (
                <ClientOverlayChart
                  data={clientChartData}
                  clients={clients.filter((c) => visibleClientIds.includes(c.client_id))}
                  colors={clientColor}
                  granularity={granularity}
                />
              )}

              <div className="grid gap-4 md:grid-cols-3">
                {RATE_CHARTS.map((chart) => (
                  <RatePanel key={chart.key} chart={chart} data={blendedChartData} granularity={granularity} />
                ))}
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>
                  Backend conversions
                </p>
                <div className="grid gap-4 md:grid-cols-3">
                  {BACKEND_COST_CHARTS.map((chart) => (
                    <CostPanel key={chart.key} chart={chart} data={blendedChartData} granularity={granularity} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
                  Accounts using this ad
                </p>
                <p className="text-[11px] mb-2" style={{ color: "#64748b" }}>
                  Sorted by CPCONV. Delta is vs this ad’s blended CPCONV. Click a row to pin it on the per-client overlay.
                </p>
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "#050c18" }}>
                        {["Client", "Spend", "Leads", "Qual %", "CPL", "CPQL", "CPCONV", "Δ vs ad", "Prop", "Sub", "Funded", "CPF"].map((h, i) => (
                          <th
                            key={h}
                            className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"} text-[10px] font-semibold uppercase tracking-wider`}
                            style={{ color: "#475569" }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clients.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="px-3 py-4 text-center" style={{ color: "#475569" }}>No client data.</td>
                        </tr>
                      ) : (
                        clients.map((c) => {
                          const delta =
                            c.cp_conversation != null && blendedCpconv != null
                              ? c.cp_conversation - blendedCpconv
                              : null;
                          const pinnedRow = pinned.includes(c.client_id);
                          return (
                            <tr
                              key={c.client_id}
                              className="cursor-pointer"
                              style={{
                                borderTop: "1px solid rgba(255,255,255,0.04)",
                                background: pinnedRow ? "rgba(245,158,11,0.06)" : "transparent",
                              }}
                              onClick={() => togglePin(c.client_id)}
                            >
                              <td className="px-3 py-2 text-left" style={{ color: "#cbd5e1" }}>
                                <button
                                  type="button"
                                  className="text-left"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    togglePin(c.client_id);
                                  }}
                                >
                                  <span
                                    className="inline-block w-2 h-2 rounded-full mr-2"
                                    style={{ background: clientColor.get(c.client_id) ?? "#475569" }}
                                  />
                                  {c.client_name}
                                  {pinnedRow ? (
                                    <span className="ml-2 text-[10px] uppercase" style={{ color: "#fbbf24" }}>Pinned</span>
                                  ) : null}
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{moneyExact(c.spend)}</td>
                              <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(c.leads)}</td>
                              <td className="px-3 py-2 text-right" style={{ color: "#a78bfa" }}>{pct(c.qualified_rate)}</td>
                              <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{moneyExact(c.cpl)}</td>
                              <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{moneyExact(c.cost_per_qualified)}</td>
                              <td className="px-3 py-2 text-right font-semibold" style={{ color: "#fbbf24" }}>{moneyExact(c.cp_conversation)}</td>
                              <td
                                className="px-3 py-2 text-right tabular-nums"
                                style={{ color: delta == null ? "#475569" : delta > 0 ? "#f87171" : "#34d399" }}
                              >
                                {delta == null ? "—" : `${delta > 0 ? "+" : ""}${moneyExact(delta)}`}
                              </td>
                              <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(c.unique_proposals ?? 0)}</td>
                              <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(c.unique_submissions ?? 0)}</td>
                              <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{num(c.unique_funded ?? 0)}</td>
                              <td className="px-3 py-2 text-right font-semibold" style={{ color: "#34d399" }}>{moneyExact(c.cp_funded)}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {drilldown.variants && drilldown.variants.length > 1 ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>By variant</p>
                  <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                    <table className="w-full text-xs">
                      <thead>
                        <tr style={{ background: "#050c18" }}>
                          {["Ad name", "Spend", "Leads", "CPL", "CPCONV", "Prop", "Sub", "Funded", "CPF"].map((h, i) => (
                            <th key={h} className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"} text-[10px] font-semibold uppercase tracking-wider`} style={{ color: "#475569" }}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {drilldown.variants.map((v) => (
                          <tr key={v.ad_name} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <td className="px-3 py-2" style={{ color: "#cbd5e1" }}>{v.ad_name}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{moneyExact(v.spend)}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(v.leads)}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{moneyExact(v.cpl)}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#fbbf24" }}>{moneyExact(v.cp_conversation)}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(v.unique_proposals ?? 0)}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(v.unique_submissions ?? 0)}</td>
                            <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{num(v.unique_funded ?? 0)}</td>
                            <td className="px-3 py-2 text-right font-semibold" style={{ color: "#34d399" }}>{moneyExact(v.cp_funded)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}

              <div>
                <button
                  type="button"
                  onClick={() => setPlatformOpen((v) => !v)}
                  className="text-[11px] uppercase tracking-wider"
                  style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}
                >
                  {platformOpen ? "Hide" : "Show"} platform metrics
                </button>
                {platformOpen ? (
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-6 gap-2">
                    {[
                      { label: "Impr", value: num(ad.impressions) },
                      { label: "Clicks", value: num(ad.clicks) },
                      { label: "CTR", value: ad.ctr != null ? `${ad.ctr.toFixed(2)}%` : "—" },
                      { label: "CPC", value: moneyExact(ad.cpc) },
                      { label: "CPM", value: moneyExact(ad.cpm) },
                      { label: "CP Show", value: moneyExact(ad.cost_per_show) },
                    ].map((s) => (
                      <div key={s.label} className="rounded-lg p-3" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                        <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>{s.label}</p>
                        <p className="text-sm tabular-nums mt-1" style={{ color: "#cbd5e1" }}>{s.value}</p>
                      </div>
                    ))}
                    <p className="col-span-full text-[10px]" style={{ color: "#475569" }}>
                      CP Show is spend ÷ show events — not CPCONV. Hand-raise and conversation rates unique-count claimed and live transfer.
                    </p>
                  </div>
                ) : null}
              </div>

              {ad.library?.summary || ad.library?.visual_notes ? (
                <div className="rounded-xl p-4" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {ad.library.summary ? <p className="text-sm whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>{ad.library.summary}</p> : null}
                  {ad.library.visual_notes ? <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: "#64748b" }}>Notes: {ad.library.visual_notes}</p> : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CostPanel({
  chart,
  data,
  granularity,
}: {
  chart: { key: CostKey; title: string; subtitle: string };
  data: Array<AdWorkspaceDaily & { label: string }>;
  granularity: "day" | "week";
}) {
  const hasAny = data.some((d) => d[chart.key] != null);
  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>{chart.title}</h3>
      <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{chart.subtitle}</p>
      {!hasAny ? (
        <p className="text-xs py-10 text-center" style={{ color: "#475569" }}>No data in this range.</p>
      ) : (
        <div className="h-48 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={48} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as AdWorkspaceDaily & { label: string };
                  const value = point[chart.key];
                  return (
                    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}>
                      <p className="font-semibold mb-1" style={{ color: "#f59e0b" }}>{point.label}</p>
                      <p>{value != null ? moneyExact(value) : "—"}</p>
                      <p style={{ color: "#64748b" }}>Spend: {moneyExact(point.spend)}</p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey={chart.key}
                stroke="#f59e0b"
                strokeWidth={2}
                dot={data.length <= 31 ? { r: 3, fill: "#f59e0b" } : false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function RatePanel({
  chart,
  data,
  granularity,
}: {
  chart: { key: RateKey; title: string; subtitle: string; color: string };
  data: Array<AdWorkspaceDaily & { label: string }>;
  granularity: "day" | "week";
}) {
  const hasAny = data.some((d) => d[chart.key] != null);
  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>{chart.title}</h3>
      <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>{chart.subtitle}</p>
      {!hasAny ? (
        <p className="text-xs py-10 text-center" style={{ color: "#475569" }}>No data in this range.</p>
      ) : (
        <div className="h-48 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={40} domain={[0, 100]} />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const point = payload[0].payload as AdWorkspaceDaily & { label: string };
                  const value = point[chart.key];
                  return (
                    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}>
                      <p className="font-semibold mb-1" style={{ color: chart.color }}>{point.label}</p>
                      <p>{value != null ? pct(value) : "—"}</p>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey={chart.key}
                stroke={chart.color}
                strokeWidth={2}
                dot={data.length <= 31 ? { r: 3, fill: chart.color } : false}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function ClientOverlayChart({
  data,
  clients,
  colors,
  granularity,
}: {
  data: Array<Record<string, number | string | null>>;
  clients: AdWorkspaceClientRow[];
  colors: Map<string, string>;
  granularity: "day" | "week";
}) {
  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>CPCONV by account</h3>
      <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
        If lines rise together, the concept is fatiguing. If one line spikes, it is that account.
        {granularity === "week" ? " Weekly buckets." : ""}
      </p>
      <div className="flex flex-wrap gap-2 mt-2 mb-2">
        {clients.map((c) => (
          <span key={c.client_id} className="text-[10px]" style={{ color: colors.get(c.client_id) ?? "#94a3b8", fontFamily: "var(--font-plex-mono)" }}>
            {c.client_name}
          </span>
        ))}
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => `$${v}`} width={48} />
            <Tooltip
              contentStyle={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "#94a3b8" }}
            />
            {clients.map((c) => (
              <Line
                key={c.client_id}
                type="monotone"
                dataKey={c.client_id}
                name={c.client_name}
                stroke={colors.get(c.client_id) ?? "#94a3b8"}
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
