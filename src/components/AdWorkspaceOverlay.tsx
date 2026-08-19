"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
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
  optin_rate: number | null;
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
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  optin_rate: number | null;
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
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  optin_rate: number | null;
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

type CostKey = "cpl" | "cost_per_qualified" | "cp_conversation";
type RateKey = "qualified_rate" | "hand_raise_rate" | "conversation_rate";

const COST_CHARTS: { key: CostKey; title: string; subtitle: string }[] = [
  { key: "cpl", title: "CPL", subtitle: "Spend ÷ leads" },
  { key: "cost_per_qualified", title: "CPQL", subtitle: "Spend ÷ qualified" },
  { key: "cp_conversation", title: "CPCONV", subtitle: "Spend ÷ unique conversations" },
];

const RATE_CHARTS: { key: RateKey; title: string; subtitle: string; color: string }[] = [
  { key: "qualified_rate", title: "Qual %", subtitle: "Qualified ÷ leads", color: "#22c55e" },
  { key: "hand_raise_rate", title: "Hand-raise %", subtitle: "Unique booked ∪ claimed ∪ LT ÷ qualified", color: "#f59e0b" },
  { key: "conversation_rate", title: "Conversation %", subtitle: "Unique show ∪ claimed ∪ LT ÷ qualified", color: "#a78bfa" },
];

/**
 * One hue per funnel layer. Spend is the shared numerator of every cost metric,
 * so a weak landing page drags CPL, CPQL and CPCONV down together and a healthy
 * creative reads as a bad ad. Colouring by layer makes it visible which metrics
 * the page can actually touch before any label is read.
 */
const LAYER = {
  /** Decided in the auction, before the click. No landing page can move these. */
  interest: "#38bdf8",
  /** The landing page's own conversion step. */
  page: "#34d399",
  /** Money spent after the click. */
  cost: "#f59e0b",
  /** Lead-quality rates. */
  rate: "#a78bfa",
} as const;

type LayerKey = keyof typeof LAYER;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mq = window.matchMedia(REDUCED_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION_QUERY).matches,
    () => false,
  );
}

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

/**
 * Header doubles as the divider — accented label, then a hairline to the right
 * edge — so the three funnel layers read as distinct bands instead of one
 * undifferentiated grid of tiles.
 */
function LayerSection({
  label,
  question,
  layer,
  delay,
  reduced,
  children,
}: {
  label: string;
  question: string;
  layer: LayerKey;
  delay: number;
  reduced: boolean;
  children: React.ReactNode;
}) {
  const color = LAYER[layer];
  return (
    <section
      style={
        reduced
          ? undefined
          : { animation: `adwsReveal 180ms ease-out ${delay}ms both` }
      }
    >
      <h3 className="flex items-center gap-2.5 mb-2.5">
        <span aria-hidden className="h-2.5 w-0.5 rounded-full shrink-0" style={{ background: color }} />
        <span
          className="shrink-0 text-[10px] font-bold uppercase tracking-[0.18em]"
          style={{ color, fontFamily: "var(--font-plex-mono)" }}
        >
          {label}
        </span>
        <span
          className="shrink-0 text-[10px] uppercase tracking-[0.12em]"
          style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}
        >
          {question}
        </span>
        <span aria-hidden className="h-px flex-1" style={{ background: "rgba(255,255,255,0.08)" }} />
      </h3>
      {children}
    </section>
  );
}

/** Large-format metric. Reserved for the four numbers that decide the verdict. */
function HeroTile({
  label,
  value,
  tip,
  layer,
  spark,
}: {
  label: string;
  value: string;
  tip: string;
  layer: LayerKey;
  spark?: Array<number | null>;
}) {
  const color = LAYER[layer];
  return (
    <div
      className="rounded-xl px-4 py-3.5 flex flex-col justify-between"
      title={tip}
      style={{
        background: "linear-gradient(160deg, #10223f 0%, #0a1628 100%)",
        border: `1px solid ${color}38`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,0.04), 0 0 24px -18px ${color}`,
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.14em]"
        style={{ color, fontFamily: "var(--font-plex-mono)" }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 text-[30px] leading-none font-bold tabular-nums"
        style={{ color: "#f1f5f9", fontFamily: "var(--font-archivo), var(--font-display)" }}
      >
        {value}
      </p>
      {spark ? <div className="mt-2"><Sparkline values={spark} color={color} /></div> : null}
    </div>
  );
}

/** Compact metric for the supporting strip beneath each band's hero numbers. */
function StatTile({
  label,
  value,
  tip,
  layer,
  spark,
}: {
  label: string;
  value: string;
  tip: string;
  layer: LayerKey;
  spark?: Array<number | null>;
}) {
  const color = LAYER[layer];
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      title={tip}
      style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p
        className="text-[9.5px] uppercase tracking-[0.12em] truncate"
        style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}
      >
        {label}
      </p>
      <p className="mt-1 text-[17px] leading-none font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
        {value}
      </p>
      {spark ? <div className="mt-1.5"><Sparkline values={spark} color={color} /></div> : null}
    </div>
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type DiagnosisTone = "fatigue" | "landing" | "ops" | "account" | "mixed" | "thin";

/** Mean of the first half of a series against the last half. */
function halfSplitTrend(series: number[]): { first: number; last: number } | null {
  if (series.length < 4) return null;
  const half = Math.floor(series.length / 2);
  const first = series.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const last = series.slice(series.length - half).reduce((s, v) => s + v, 0) / half;
  return { first, last };
}

/**
 * Names the layer that owns the problem. CTR is checked before any cost metric
 * because it is the only signal here a client's landing page cannot distort —
 * so a sagging CTR convicts the creative, while a healthy CTR sitting beside a
 * collapsed opt-in convicts that one account's page instead.
 */
function diagnose(clients: AdWorkspaceClientRow[], dailyByClient: Map<string, AdWorkspaceClientDaily[]>): {
  tone: DiagnosisTone;
  text: string;
} {
  const withConv = clients.filter((c) => c.cp_conversation != null && c.spend > 0);
  if (withConv.length < 2) {
    return {
      tone: "thin",
      text: "Not enough accounts on this ad to separate creative fatigue from an account issue. Compare the blended cost charts over the range.",
    };
  }

  let ctrFalling = 0;
  let ctrScored = 0;
  for (const c of withConv) {
    const trend = halfSplitTrend(
      (dailyByClient.get(c.client_id) ?? []).map((p) => p.ctr).filter((v): v is number => v != null),
    );
    if (!trend) continue;
    ctrScored += 1;
    if (trend.first > 0 && trend.last < trend.first * 0.85) ctrFalling += 1;
  }

  if (ctrScored >= 2 && ctrFalling / ctrScored >= 0.6) {
    return {
      tone: "fatigue",
      text: "CTR is sliding on most accounts at once. Nothing downstream can cause that — the creative is wearing out. Refresh the hook before touching pages or targets.",
    };
  }

  const withOptin = withConv.filter((c) => c.optin_rate != null && c.clicks > 0);
  const optinMid = median(withOptin.map((c) => c.optin_rate as number));
  const optinOutlier = optinMid != null && optinMid > 0
    ? withOptin.find((c) => (c.optin_rate as number) < optinMid * 0.6)
    : undefined;
  if (optinOutlier && withOptin.length >= 3) {
    return {
      tone: "landing",
      text: `${optinOutlier.client_name} opts in at ${pct(optinOutlier.optin_rate)} against ${pct(optinMid)} across the rest, on normal CTR. The clicks are arriving and the page is losing them — fix that header before judging this ad on its CPL.`,
    };
  }

  let convRising = 0;
  let convScored = 0;
  for (const c of withConv) {
    const trend = halfSplitTrend(
      (dailyByClient.get(c.client_id) ?? []).map((p) => p.cp_conversation).filter((v): v is number => v != null),
    );
    if (!trend) continue;
    convScored += 1;
    if (trend.first > 0 && trend.last > trend.first * 1.15) convRising += 1;
  }

  if (convScored >= 2 && convRising / convScored >= 0.6) {
    return {
      tone: "ops",
      text: "CPCONV is climbing while CTR holds. The ad is still earning its clicks, so the loss is downstream — speed to lead, setter follow-up, or the LO. Do not refresh the creative for this.",
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
      text: `CPCONV is concentrated on ${outlier.client_name} (${money(outlier.cp_conversation)} vs blended) on comparable CTR and opt-in. Treat this as an account issue — audience, setters, or spend ramp — not the ad.`,
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
  const reducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const clients = useMemo(
    () => (drilldown && drilldown !== "loading" ? drilldown.perClient : []),
    [drilldown],
  );
  const daily = useMemo(
    () => (drilldown && drilldown !== "loading" ? drilldown.daily : []),
    [drilldown],
  );
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

  const buildClientSeries = useCallback(
    (pick: (p: AdWorkspaceClientDaily) => number | null) => {
      const byDate = new Map<string, Record<string, number | string | null>>();
      for (const p of daily) {
        byDate.set(p.date, { date: p.date, label: formatDateLabel(p.date, granularity) });
      }
      for (const id of visibleClientIds) {
        for (const p of dailyByClient.get(id) ?? []) {
          const row = byDate.get(p.date) ?? { date: p.date, label: formatDateLabel(p.date, granularity) };
          row[id] = pick(p);
          byDate.set(p.date, row);
        }
      }
      return [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    },
    [daily, dailyByClient, granularity, visibleClientIds],
  );

  const clientChartData = useMemo(
    () => buildClientSeries((p) => p.cp_conversation),
    [buildClientSeries],
  );

  const clientCtrData = useMemo(() => buildClientSeries((p) => p.ctr), [buildClientSeries]);

  const thumb = ad.library ? driveThumb(ad.library) : null;
  const blendedCpconv = ad.cp_conversation;

  function togglePin(clientId: string) {
    setMode("clients");
    setPinned((prev) => (prev.includes(clientId) ? prev.filter((id) => id !== clientId) : [...prev, clientId]));
  }

  const DIAGNOSIS_STYLES: Record<DiagnosisTone, { accent: string; label: string }> = {
    fatigue: { accent: "#fbbf24", label: "Creative" },
    landing: { accent: LAYER.page, label: "Landing page" },
    ops: { accent: LAYER.rate, label: "Downstream" },
    account: { accent: "#fca5a5", label: "Account" },
    mixed: { accent: "#94a3b8", label: "Read" },
    thin: { accent: "#94a3b8", label: "Thin sample" },
  };
  const diagnosisTone = DIAGNOSIS_STYLES[diagnosis.tone];
  const diagnosisStyle = {
    border: `1px solid ${diagnosisTone.accent}59`,
    background: `${diagnosisTone.accent}14`,
    color: diagnosisTone.accent,
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "rgba(2,6,14,0.72)" }}>
      <style>{"@keyframes adwsReveal{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}"}</style>
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
              <LayerSection
                label="Before the click"
                question="Did they want it"
                layer="interest"
                delay={0}
                reduced={reducedMotion}
              >
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <HeroTile
                    label="CTR"
                    value={pct(ad.ctr)}
                    tip="Clicks ÷ impressions. Set in the auction — a weak landing page cannot move this."
                    layer="interest"
                    spark={daily.map((p) => p.ctr)}
                  />
                  <div className="grid grid-cols-2 xl:col-span-3 xl:grid-cols-4 gap-2">
                    <StatTile label="CPC" value={moneyExact(ad.cpc)} tip="Spend ÷ clicks" layer="interest" spark={daily.map((p) => p.cpc)} />
                    <StatTile label="CPM" value={moneyExact(ad.cpm)} tip="Spend ÷ impressions × 1000" layer="interest" spark={daily.map((p) => p.cpm)} />
                    <StatTile label="Impr" value={num(ad.impressions)} tip="Impressions in range" layer="interest" />
                    <StatTile label="Clicks" value={num(ad.clicks)} tip="Link clicks in range" layer="interest" />
                  </div>
                </div>
              </LayerSection>

              <LayerSection
                label="The page"
                question="Did the click become a lead"
                layer="page"
                delay={60}
                reduced={reducedMotion}
              >
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <HeroTile
                    label="Opt-in"
                    value={pct(ad.optin_rate)}
                    tip="Leads ÷ clicks. The landing page's own conversion step — this is where a bad header shows up."
                    layer="page"
                    spark={daily.map((p) => p.optin_rate)}
                  />
                  <div className="grid grid-cols-2 xl:col-span-3 xl:grid-cols-4 gap-2">
                    <StatTile label="Leads" value={num(ad.leads)} tip="Attributed lead events" layer="page" />
                    <StatTile label="Qual %" value={pct(ad.qualified_rate)} tip="Qualified ÷ leads" layer="rate" spark={daily.map((p) => p.qualified_rate)} />
                    <StatTile label="Hand-raise" value={pct(ad.hand_raise_rate)} tip="Unique booked ∪ claimed ∪ LT ÷ qualified" layer="rate" spark={daily.map((p) => p.hand_raise_rate)} />
                    <StatTile label="Conv %" value={pct(ad.conversation_rate)} tip="Unique conversations ÷ qualified" layer="rate" spark={daily.map((p) => p.conversation_rate)} />
                  </div>
                </div>
              </LayerSection>

              <LayerSection
                label="After the click"
                question="Did it convert"
                layer="cost"
                delay={120}
                reduced={reducedMotion}
              >
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  <HeroTile
                    label="CPCONV"
                    value={moneyExact(ad.cp_conversation)}
                    tip="Spend ÷ unique (show ∪ claimed ∪ LT). The verdict metric."
                    layer="cost"
                    spark={daily.map((p) => p.cp_conversation)}
                  />
                  <HeroTile label="Spend" value={money(ad.spend)} tip="Meta spend in range" layer="cost" />
                  <div className="grid grid-cols-2 xl:col-span-2 gap-2">
                    <StatTile label="CPL" value={moneyExact(ad.cpl)} tip="Spend ÷ leads" layer="cost" spark={daily.map((p) => p.cpl)} />
                    <StatTile label="CPQL" value={moneyExact(ad.cost_per_qualified)} tip="Spend ÷ qualified" layer="cost" spark={daily.map((p) => p.cost_per_qualified)} />
                  </div>
                  <div className="grid grid-cols-3 xl:col-span-4 gap-2">
                    <StatTile label="Proposals" value={num(ad.unique_proposals ?? 0)} tip="Unique proposal ∪ submission ∪ funded" layer="cost" />
                    <StatTile label="Submissions" value={num(ad.unique_submissions ?? 0)} tip="Unique submission ∪ funded" layer="cost" />
                    <StatTile label="Funded" value={num(ad.unique_funded ?? 0)} tip="Unique funded borrowers" layer="cost" />
                  </div>
                </div>
              </LayerSection>

              <div className="rounded-xl px-4 py-3 text-sm" style={diagnosisStyle}>
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.14em] mr-2"
                  style={{ fontFamily: "var(--font-plex-mono)", opacity: 0.85 }}
                >
                  {diagnosisTone.label}
                </span>
                <span style={{ color: "#cbd5e1" }}>{diagnosis.text}</span>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                <EngagementScatter
                  clients={clients}
                  pinned={pinned}
                  onPick={togglePin}
                  reduced={reducedMotion}
                />
                <CtrTrendPanel
                  mode={mode}
                  blended={blendedChartData}
                  perClient={clientCtrData}
                  clients={clients.filter((c) => visibleClientIds.includes(c.client_id))}
                  colors={clientColor}
                  granularity={granularity}
                  reduced={reducedMotion}
                />
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

              <FunnelWaterfall ad={ad} reduced={reducedMotion} />

              <BackendCostTable ad={ad} />

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
                  Accounts using this ad
                </p>
                <p className="text-[11px] mb-2" style={{ color: "#64748b" }}>
                  Sorted by CPCONV. Delta is vs this ad’s blended CPCONV. Click a row to pin it on the per-client overlay.
                  Normal CTR beside a collapsed opt-in is that account’s landing page, not the creative.
                </p>
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="w-full text-xs">
                    <thead>
                      <tr style={{ background: "#050c18" }}>
                        {[
                          { h: "Client", layer: null },
                          { h: "Spend", layer: null },
                          { h: "CTR", layer: "interest" as const },
                          { h: "CPC", layer: "interest" as const },
                          { h: "Opt-in", layer: "page" as const, divide: true },
                          { h: "Leads", layer: null },
                          { h: "Qual %", layer: "rate" as const },
                          { h: "CPL", layer: "cost" as const, divide: true },
                          { h: "CPQL", layer: "cost" as const },
                          { h: "CPCONV", layer: "cost" as const },
                          { h: "Δ vs ad", layer: null },
                          { h: "Prop", layer: null, divide: true },
                          { h: "CPP", layer: "cost" as const },
                          { h: "Sub", layer: null },
                          { h: "CPS", layer: "cost" as const },
                          { h: "Funded", layer: null },
                          { h: "CPF", layer: "cost" as const },
                        ].map((col, i) => (
                          <th
                            key={col.h}
                            className={`px-3 py-2 ${i === 0 ? "text-left" : "text-right"} text-[10px] font-semibold uppercase tracking-wider`}
                            style={{
                              color: col.layer ? LAYER[col.layer] : "#475569",
                              borderLeft: col.divide ? "1px solid rgba(255,255,255,0.08)" : undefined,
                            }}
                          >
                            {col.h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {clients.length === 0 ? (
                        <tr>
                          <td colSpan={17} className="px-3 py-4 text-center" style={{ color: "#475569" }}>No client data.</td>
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
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#e2e8f0" }}>{moneyExact(c.spend)}</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: LAYER.interest }}>{pct(c.ctr)}</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: LAYER.interest }}>{moneyExact(c.cpc)}</td>
                              <td
                                className="px-3 py-2 text-right tabular-nums font-semibold"
                                style={{ color: LAYER.page, borderLeft: "1px solid rgba(255,255,255,0.08)" }}
                              >
                                {pct(c.optin_rate)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#94a3b8" }}>{num(c.leads)}</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: LAYER.rate }}>{pct(c.qualified_rate)}</td>
                              <td
                                className="px-3 py-2 text-right tabular-nums"
                                style={{ color: "#e2e8f0", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
                              >
                                {moneyExact(c.cpl)}
                              </td>
                              <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{moneyExact(c.cost_per_qualified)}</td>
                              <td className="px-3 py-2 text-right font-semibold" style={{ color: "#fbbf24" }}>{moneyExact(c.cp_conversation)}</td>
                              <td
                                className="px-3 py-2 text-right tabular-nums"
                                style={{ color: delta == null ? "#475569" : delta > 0 ? "#f87171" : "#34d399" }}
                              >
                                {delta == null ? "—" : `${delta > 0 ? "+" : ""}${moneyExact(delta)}`}
                              </td>
                              <td
                                className="px-3 py-2 text-right tabular-nums"
                                style={{ color: "#94a3b8", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
                              >
                                {num(c.unique_proposals ?? 0)}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: LAYER.cost }}>{moneyExact(c.cp_proposal)}</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#94a3b8" }}>{num(c.unique_submissions ?? 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: LAYER.cost }}>{moneyExact(c.cp_submission)}</td>
                              <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#e2e8f0" }}>{num(c.unique_funded ?? 0)}</td>
                              <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: LAYER.cost }}>{moneyExact(c.cp_funded)}</td>
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
                          {["Ad name", "Spend", "Leads", "CPL", "CPCONV", "Prop", "CPP", "Sub", "CPS", "Funded", "CPF"].map((h, i) => (
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
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#94a3b8" }}>{num(v.unique_proposals ?? 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: LAYER.cost }}>{moneyExact(v.cp_proposal)}</td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#94a3b8" }}>{num(v.unique_submissions ?? 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: LAYER.cost }}>{moneyExact(v.cp_submission)}</td>
                            <td className="px-3 py-2 text-right tabular-nums" style={{ color: "#e2e8f0" }}>{num(v.unique_funded ?? 0)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: LAYER.cost }}>{moneyExact(v.cp_funded)}</td>
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

/** Three-stop ramp: cheap delivery reads cool, expensive delivery reads hot. */
function cpmColor(cpm: number | null, min: number, max: number): string {
  if (cpm == null || max <= min) return "#94a3b8";
  const t = (cpm - min) / (max - min);
  const stops = [
    { at: 0, rgb: [56, 189, 248] },
    { at: 0.5, rgb: [148, 163, 184] },
    { at: 1, rgb: [251, 113, 133] },
  ];
  const hi = stops.find((s) => t <= s.at) ?? stops[2];
  const lo = [...stops].reverse().find((s) => t >= s.at) ?? stops[0];
  if (hi === lo) return `rgb(${hi.rgb.join(",")})`;
  const k = (t - lo.at) / (hi.at - lo.at);
  const rgb = lo.rgb.map((c, i) => Math.round(c + (hi.rgb[i] - c) * k));
  return `rgb(${rgb.join(",")})`;
}

type ScatterPoint = {
  client_id: string;
  client_name: string;
  ctr: number;
  cpc: number;
  cpm: number | null;
  spend: number;
  optin_rate: number | null;
  radius: number;
  color: string;
  labelled: boolean;
  pinned: boolean;
};

/**
 * CTR against CPC, one dot per account. Both axes are settled in the auction, so
 * a client whose landing page is failing still lands in the same place as every
 * other account running this creative — which is exactly what separates a tired
 * ad from a bad header.
 */
function EngagementScatter({
  clients,
  pinned,
  onPick,
  reduced,
}: {
  clients: AdWorkspaceClientRow[];
  pinned: string[];
  onPick: (clientId: string) => void;
  reduced: boolean;
}) {
  const points = useMemo<ScatterPoint[]>(() => {
    const usable = clients.filter(
      (c) => c.ctr != null && c.cpc != null && c.impressions > 0,
    );
    if (usable.length === 0) return [];
    const cpms = usable.map((c) => c.cpm).filter((v): v is number => v != null);
    const cpmMin = cpms.length ? Math.min(...cpms) : 0;
    const cpmMax = cpms.length ? Math.max(...cpms) : 0;
    const roots = usable.map((c) => Math.sqrt(Math.max(c.spend, 0)));
    const rootMin = Math.min(...roots);
    const rootMax = Math.max(...roots);
    const topSpend = new Set(
      [...usable].sort((a, b) => b.spend - a.spend).slice(0, 3).map((c) => c.client_id),
    );
    return usable.map((c) => {
      const root = Math.sqrt(Math.max(c.spend, 0));
      // Area, not radius, tracks spend — otherwise big accounts visually scream.
      const t = rootMax > rootMin ? (root - rootMin) / (rootMax - rootMin) : 0.5;
      return {
        client_id: c.client_id,
        client_name: c.client_name,
        ctr: c.ctr as number,
        cpc: c.cpc as number,
        cpm: c.cpm,
        spend: c.spend,
        optin_rate: c.optin_rate,
        radius: 7 + t * 15,
        color: cpmColor(c.cpm, cpmMin, cpmMax),
        labelled: topSpend.has(c.client_id),
        pinned: pinned.includes(c.client_id),
      };
    });
  }, [clients, pinned]);

  const medCtr = useMemo(() => median(points.map((p) => p.ctr)), [points]);
  const medCpc = useMemo(() => median(points.map((p) => p.cpc)), [points]);

  const bounds = useMemo(() => {
    if (points.length === 0) return null;
    const xs = points.map((p) => p.ctr);
    const ys = points.map((p) => p.cpc);
    const padX = Math.max((Math.max(...xs) - Math.min(...xs)) * 0.25, 0.3);
    const padY = Math.max((Math.max(...ys) - Math.min(...ys)) * 0.25, 0.3);
    return {
      xMin: Math.max(0, Math.min(...xs) - padX),
      xMax: Math.max(...xs) + padX,
      yMin: Math.max(0, Math.min(...ys) - padY),
      yMax: Math.max(...ys) + padY,
    };
  }, [points]);

  // One dot cannot show a spread, and a lone point implies a pack that is not there.
  if (points.length < 2 || !bounds || medCtr == null || medCpc == null) {
    return (
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Engagement map</h3>
        <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
          Needs two or more accounts with impressions to show a spread.
        </p>
        {points.length === 1 ? (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              { label: "CTR", value: pct(points[0].ctr), color: LAYER.interest },
              { label: "CPC", value: moneyExact(points[0].cpc), color: LAYER.interest },
              { label: "CPM", value: moneyExact(points[0].cpm), color: LAYER.interest },
            ].map((s) => (
              <div key={s.label} className="rounded-lg px-3 py-2" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[9.5px] uppercase tracking-[0.12em]" style={{ color: "#64748b", fontFamily: "var(--font-plex-mono)" }}>{s.label}</p>
                <p className="text-base font-semibold tabular-nums mt-0.5" style={{ color: s.color }}>{s.value}</p>
              </div>
            ))}
            <p className="col-span-3 text-[10px]" style={{ color: "#475569" }}>
              {points[0].client_name} only.
            </p>
          </div>
        ) : (
          <p className="text-xs py-10 text-center" style={{ color: "#475569" }}>No impression data in this range.</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Engagement map</h3>
          <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
            CTR against CPC per account. Both are set before the click, so a weak landing page cannot move a dot. Bubble size is spend. Click to pin.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] uppercase tracking-[0.12em]" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>CPM</span>
          <span className="text-[9px]" style={{ color: "#38bdf8" }}>cheap</span>
          <span className="h-1.5 w-16 rounded-full" style={{ background: "linear-gradient(90deg, #38bdf8, #94a3b8, #fb7185)" }} />
          <span className="text-[9px]" style={{ color: "#fb7185" }}>costly</span>
        </div>
      </div>

      <div className="h-72 mt-3 relative">
        {/* Corner verdicts sit in HTML so the quadrant reading survives without a
            hover, and without depending on colour alone. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 z-10" style={{ paddingLeft: 66, paddingRight: 22, paddingTop: 18, paddingBottom: 42 }}>
          <div className="relative h-full w-full text-[9px] uppercase tracking-[0.1em]" style={{ color: "#94a3b8", opacity: 0.45, fontFamily: "var(--font-plex-mono)" }}>
            <span className="absolute left-0 top-0">Expensive + ignored</span>
            <span className="absolute right-0 top-0">Expensive + wanted</span>
            <span className="absolute left-0 bottom-0">Cheap + ignored</span>
            <span className="absolute right-0 bottom-0" style={{ color: LAYER.page, opacity: 0.9 }}>Cheap + wanted</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 14, right: 18, left: 4, bottom: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey="ctr"
              domain={[bounds.xMin, bounds.xMax]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickFormatter={(v: number) => `${v.toFixed(1)}%`}
              label={{ value: "CTR — did they want it", position: "insideBottom", offset: -6, fill: "#475569", fontSize: 10 }}
            />
            <YAxis
              type="number"
              dataKey="cpc"
              domain={[bounds.yMin, bounds.yMax]}
              tick={{ fill: "#64748b", fontSize: 10 }}
              tickFormatter={(v: number) => `$${v.toFixed(2)}`}
              width={58}
              label={{ value: "CPC", angle: -90, position: "insideLeft", fill: "#475569", fontSize: 10 }}
            />
            <ZAxis range={[60, 60]} />

            <ReferenceArea
              x1={medCtr}
              x2={bounds.xMax}
              y1={bounds.yMin}
              y2={medCpc}
              fill="rgba(52,211,153,0.05)"
              stroke="none"
            />
            <ReferenceArea
              x1={bounds.xMin}
              x2={medCtr}
              y1={medCpc}
              y2={bounds.yMax}
              fill="rgba(248,113,113,0.05)"
              stroke="none"
            />

            <ReferenceLine
              x={medCtr}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="4 4"
              label={{ value: `med ${medCtr.toFixed(2)}%`, position: "top", fill: "#64748b", fontSize: 9 }}
            />
            <ReferenceLine
              y={medCpc}
              stroke="rgba(255,255,255,0.18)"
              strokeDasharray="4 4"
              label={{ value: `med $${medCpc.toFixed(2)}`, position: "right", fill: "#64748b", fontSize: 9 }}
            />

            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "rgba(255,255,255,0.2)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as ScatterPoint;
                return (
                  <div className="rounded-lg px-3 py-2 text-xs" style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}>
                    <p className="font-semibold mb-1" style={{ color: LAYER.interest }}>{p.client_name}</p>
                    <p className="tabular-nums">CTR {pct(p.ctr)} · CPC {moneyExact(p.cpc)}</p>
                    <p className="tabular-nums" style={{ color: "#94a3b8" }}>CPM {moneyExact(p.cpm)} · Spend {money(p.spend)}</p>
                    <p className="tabular-nums mt-1" style={{ color: LAYER.page }}>Opt-in {pct(p.optin_rate)}</p>
                  </div>
                );
              }}
            />

            <Scatter
              data={points}
              isAnimationActive={!reduced}
              onClick={(p: unknown) => {
                const point = p as { client_id?: string };
                if (point?.client_id) onPick(point.client_id);
              }}
              shape={(props: unknown) => {
                const { cx, cy, payload } = props as { cx: number; cy: number; payload: ScatterPoint };
                return (
                  <g style={{ cursor: "pointer" }}>
                    {payload.pinned ? (
                      <circle cx={cx} cy={cy} r={payload.radius + 4} fill="none" stroke="#fbbf24" strokeWidth={1.5} />
                    ) : null}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={payload.radius}
                      fill={payload.color}
                      fillOpacity={0.5}
                      stroke={payload.color}
                      strokeWidth={1.5}
                    />
                    {payload.labelled ? (
                      <text
                        x={cx}
                        y={cy - payload.radius - 5}
                        textAnchor="middle"
                        fontSize={9.5}
                        fill="#cbd5e1"
                        style={{ fontFamily: "var(--font-plex-mono)" }}
                      >
                        {payload.client_name}
                      </text>
                    ) : null}
                  </g>
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] mt-1" style={{ color: "#475569" }}>
        Bottom-right is the winner: wanted and cheap. Top-left is a dead creative. A single stray dot is that account&apos;s auction, not the concept.
      </p>
    </div>
  );
}

/**
 * LO-side conversions are too sparse for a weekly line. A table of count and
 * cost is the honest read: most weeks are empty, and a single funded loan
 * should not pretend to be a trend.
 */
function BackendCostTable({ ad }: { ad: AdWorkspaceAd }) {
  const rows = [
    {
      event: "Proposals",
      costLabel: "CPP",
      count: ad.unique_proposals ?? 0,
      cost: ad.cp_proposal,
      formula: "Spend ÷ unique proposals",
    },
    {
      event: "Submissions",
      costLabel: "CPS",
      count: ad.unique_submissions ?? 0,
      cost: ad.cp_submission,
      formula: "Spend ÷ unique submissions",
    },
    {
      event: "Funded",
      costLabel: "CPF",
      count: ad.unique_funded ?? 0,
      cost: ad.cp_funded,
      formula: "Spend ÷ unique funded borrowers",
    },
  ];

  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider mb-2" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>
        Backend conversions
      </p>
      <p className="text-[11px] mb-2" style={{ color: "#64748b" }}>
        These close too rarely to chart. Cost is spend in range divided by unique contacts who reached the stage.
      </p>
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["Event", "Count", "Cost", "Formula"].map((h, i) => (
                <th
                  key={h}
                  className={`px-3 py-2 ${i === 0 ? "text-left" : i === 3 ? "text-left" : "text-right"} text-[10px] font-semibold uppercase tracking-wider`}
                  style={{ color: i === 2 ? LAYER.cost : "#475569" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.event} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="px-3 py-2.5" style={{ color: "#cbd5e1" }}>
                  {row.event}
                  <span className="ml-2 text-[10px] uppercase tracking-wider" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>
                    {row.costLabel}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums" style={{ color: "#e2e8f0" }}>
                  {num(row.count)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: LAYER.cost }}>
                  {moneyExact(row.cost)}
                </td>
                <td className="px-3 py-2.5" style={{ color: "#64748b" }}>
                  {row.formula}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type FunnelStage = {
  label: string;
  count: number;
  layer: LayerKey;
  /** Name of the rate into this stage, printed on the connector above it. */
  step: string | null;
  owner: string | null;
};

/**
 * Drop-off top to bottom, each row scaled against impressions on a log axis so
 * the tail stages stay visible. The conversion into each stage is printed on the
 * connector and tinted by the layer that owns it, so a collapse is attributable
 * without cross-referencing eighteen separate averages.
 */
function FunnelWaterfall({ ad, reduced }: { ad: AdWorkspaceAd; reduced: boolean }) {
  const stages: FunnelStage[] = [
    { label: "Impressions", count: ad.impressions, layer: "interest", step: null, owner: null },
    { label: "Clicks", count: ad.clicks, layer: "interest", step: "CTR", owner: "Creative" },
    { label: "Leads", count: ad.leads, layer: "page", step: "Opt-in", owner: "Landing page" },
    { label: "Qualified", count: ad.qualified, layer: "rate", step: "Qual %", owner: "Targeting" },
    { label: "Hand-raises", count: ad.unique_hand_raises ?? 0, layer: "rate", step: "Hand-raise", owner: "Setters" },
    { label: "Conversations", count: ad.unique_conversations ?? 0, layer: "rate", step: "Conv", owner: "Setters" },
    { label: "Proposals", count: ad.unique_proposals ?? 0, layer: "cost", step: "Prop", owner: "LO" },
    { label: "Submissions", count: ad.unique_submissions ?? 0, layer: "cost", step: "Sub", owner: "LO" },
    { label: "Funded", count: ad.unique_funded ?? 0, layer: "cost", step: "Fund", owner: "LO" },
  ];

  const top = stages[0].count;
  if (top <= 0) {
    return (
      <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Funnel</h3>
        <p className="text-xs py-10 text-center" style={{ color: "#475569" }}>No impression data in this range.</p>
      </div>
    );
  }

  // Counts span ~5 orders of magnitude, so a linear bar makes every stage past
  // "leads" an invisible sliver.
  const widthFor = (n: number) => (n <= 0 ? 0 : Math.max((Math.log10(n + 1) / Math.log10(top + 1)) * 100, 2));

  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Funnel</h3>
      <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
        Each step is tinted by the layer that owns it. Bars are log-scaled so the back end stays readable.
      </p>

      <div className="mt-3">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1] : null;
          const rate = prev && prev.count > 0 ? (s.count / prev.count) * 100 : null;
          const color = LAYER[s.layer];
          return (
            <div key={s.label}>
              {prev ? (
                <div className="flex items-center gap-2 pl-1 py-1">
                  <span aria-hidden className="h-3 w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
                  <span
                    className="text-[9.5px] uppercase tracking-[0.1em] tabular-nums"
                    style={{ color, fontFamily: "var(--font-plex-mono)" }}
                  >
                    {s.step} {rate == null ? "—" : `${rate.toFixed(rate < 10 ? 1 : 0)}%`}
                  </span>
                  {s.owner ? (
                    <span className="text-[9px] uppercase tracking-[0.1em]" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>
                      {s.owner}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <span className="w-24 shrink-0 text-[10px] uppercase tracking-[0.1em]" style={{ color: "#94a3b8", fontFamily: "var(--font-plex-mono)" }}>
                  {s.label}
                </span>
                <span
                  className="relative h-6 flex-1 rounded"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 rounded"
                    style={{
                      width: `${widthFor(s.count)}%`,
                      background: `linear-gradient(90deg, ${color}66, ${color}22)`,
                      borderRight: `2px solid ${color}`,
                      transition: reduced ? undefined : "width 240ms ease-out",
                    }}
                  />
                </span>
                <span className="w-20 shrink-0 text-right text-xs font-semibold tabular-nums" style={{ color: "#e2e8f0" }}>
                  {num(s.count)}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The fatigue read. CTR sagging across every account is the concept wearing out;
 * CTR holding flat while CPCONV climbs points at the page or the floor instead.
 */
function CtrTrendPanel({
  mode,
  blended,
  perClient,
  clients,
  colors,
  granularity,
  reduced,
}: {
  mode: ChartMode;
  blended: Array<AdWorkspaceDaily & { label: string }>;
  perClient: Array<Record<string, number | string | null>>;
  clients: AdWorkspaceClientRow[];
  colors: Map<string, string>;
  granularity: "day" | "week";
  reduced: boolean;
}) {
  const showClients = mode === "clients" && clients.length > 0;
  const hasAny = showClients
    ? perClient.some((row) => clients.some((c) => row[c.client_id] != null))
    : blended.some((d) => d.ctr != null);

  return (
    <div className="rounded-xl p-4" style={{ background: "linear-gradient(135deg, #0f2040 0%, #0c1a30 100%)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>CTR over time</h3>
      <p className="text-[10px] mt-0.5" style={{ color: "#475569" }}>
        Falling across accounts is fatigue. Flat here while costs climb means the page or the floor.
        {granularity === "week" ? " Weekly buckets." : ""}
      </p>
      {showClients ? (
        <div className="flex flex-wrap gap-2 mt-2">
          {clients.map((c) => (
            <span key={c.client_id} className="text-[10px]" style={{ color: colors.get(c.client_id) ?? "#94a3b8", fontFamily: "var(--font-plex-mono)" }}>
              {c.client_name}
            </span>
          ))}
        </div>
      ) : null}
      {!hasAny ? (
        <p className="text-xs py-10 text-center" style={{ color: "#475569" }}>No impression data in this range.</p>
      ) : (
        <div className="h-48 mt-2">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={showClients ? perClient : blended} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 10 }} interval="preserveStartEnd" minTickGap={24} />
              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={(v) => `${v}%`} width={44} />
              <Tooltip
                contentStyle={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: "#94a3b8" }}
                formatter={(v: unknown, name: unknown) => [pct(typeof v === "number" ? v : null), String(name)]}
              />
              {showClients ? (
                clients.map((c) => (
                  <Line
                    key={c.client_id}
                    type="monotone"
                    dataKey={c.client_id}
                    name={c.client_name}
                    stroke={colors.get(c.client_id) ?? "#94a3b8"}
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={!reduced}
                  />
                ))
              ) : (
                <Line
                  type="monotone"
                  dataKey="ctr"
                  name="CTR"
                  stroke={LAYER.interest}
                  strokeWidth={2}
                  dot={blended.length <= 31 ? { r: 3, fill: LAYER.interest } : false}
                  connectNulls={false}
                  isAnimationActive={!reduced}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
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
