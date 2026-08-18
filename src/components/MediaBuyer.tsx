"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdFormatPicker, useAdFormats } from "./AdFormatPicker";
import { AdTagPicker, useAdTags } from "./AdTagPicker";
import AdWorkspaceOverlay, { type AdWorkspaceDrilldown } from "./AdWorkspaceOverlay";
import { adFormatLabel } from "@/lib/ad-formats";
import type { AdTagRef } from "@/lib/ad-tags";

type Props = {
  startDate: string;
  endDate: string;
  clientId?: string;
};

type LibraryMeta = {
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

type AdRow = {
  row_key: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  leads: number;
  qualified: number;
  hot: number;
  appointments: number;
  shows: number;
  no_shows: number;
  closes: number;
  unique_hand_raises: number;
  unique_conversations: number;
  unique_proposals: number;
  unique_submissions: number;
  unique_funded: number;
  cpl: number | null;
  cost_per_qualified: number | null;
  cost_per_appointment: number | null;
  cost_per_show: number | null;
  cost_per_close: number | null;
  cp_conversation: number | null;
  cp_proposal: number | null;
  cp_submission: number | null;
  cp_funded: number | null;
  booking_rate: number | null;
  qualified_rate: number | null;
  show_rate: number | null;
  hand_raise_rate: number | null;
  conversation_rate: number | null;
  client_count: number;
  has_meta: boolean;
  library: LibraryMeta | null;
  variant_names: string[];
  is_sourced: boolean;
};

type Drilldown = AdWorkspaceDrilldown;

type LibraryAlias = {
  id: string;
  alias_name: string;
  created_at: string;
};

type LibEntry = {
  id: string;
  ad_name: string;
  platform: string | null;
  status: string;
  ad_format: string | null;
  product: string | null;
  summary: string | null;
  visual_notes: string | null;
  drive_url: string | null;
  thumbnail_url: string | null;
  knowledge_capture_status?: string | null;
  captured_at?: string | null;
  os_refs?: string[] | null;
  created_at: string;
  updated_at: string;
  aliases: LibraryAlias[];
  tags: AdTagRef[];
};

export type LibraryNav = {
  libraryId?: string;
  prefillAdName?: string;
  openForm?: boolean;
} | null;

const PRODUCT_OPTIONS = [
  { value: "", label: "Select product…" },
  { value: "reverse", label: "RM" },
  { value: "dscr", label: "DSCR" },
  { value: "broad_forward", label: "Broad Forward" },
] as const;

const PRODUCT_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

type ProductFilter = "all" | "reverse" | "dscr";

const PRODUCT_FILTERS: { value: ProductFilter; label: string; color: string }[] = [
  { value: "all", label: "All", color: "#94a3b8" },
  { value: "reverse", label: "RM", color: "#38bdf8" },
  { value: "dscr", label: "DSCR", color: "#fbbf24" },
];

function productMatches(product: string | null | undefined, filter: ProductFilter): boolean {
  if (filter === "all") return true;
  return product === filter;
}

function rollupAds(list: AdRow[]) {
  const spend = list.reduce((s, a) => s + a.spend, 0);
  const impressions = list.reduce((s, a) => s + a.impressions, 0);
  const clicks = list.reduce((s, a) => s + a.clicks, 0);
  const leads = list.reduce((s, a) => s + a.leads, 0);
  const qualified = list.reduce((s, a) => s + a.qualified, 0);
  const appointments = list.reduce((s, a) => s + a.appointments, 0);
  const shows = list.reduce((s, a) => s + a.shows, 0);
  const closes = list.reduce((s, a) => s + a.closes, 0);
  const unique_conversations = list.reduce((s, a) => s + (a.unique_conversations ?? 0), 0);
  const unique_hand_raises = list.reduce((s, a) => s + (a.unique_hand_raises ?? 0), 0);
  const unique_proposals = list.reduce((s, a) => s + (a.unique_proposals ?? 0), 0);
  const unique_submissions = list.reduce((s, a) => s + (a.unique_submissions ?? 0), 0);
  const unique_funded = list.reduce((s, a) => s + (a.unique_funded ?? 0), 0);
  return {
    ads: list.length,
    spend,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpc: clicks > 0 ? spend / clicks : null,
    cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
    leads,
    qualified,
    appointments,
    shows,
    closes,
    cpl: leads > 0 ? spend / leads : null,
    cost_per_qualified: qualified > 0 ? spend / qualified : null,
    cp_conversation: unique_conversations > 0 ? spend / unique_conversations : null,
    unique_proposals,
    unique_submissions,
    unique_funded,
    cp_proposal: unique_proposals > 0 ? spend / unique_proposals : null,
    cp_submission: unique_submissions > 0 ? spend / unique_submissions : null,
    cp_funded: unique_funded > 0 ? spend / unique_funded : null,
    qualified_rate: leads > 0 ? (qualified / leads) * 100 : null,
    hand_raise_rate: qualified > 0 ? (unique_hand_raises / qualified) * 100 : null,
    conversation_rate: qualified > 0 ? (unique_conversations / qualified) * 100 : null,
  };
}

function ProductFilterBar({
  value,
  onChange,
  counts,
}: {
  value: ProductFilter;
  onChange: (v: ProductFilter) => void;
  counts: Record<ProductFilter, number>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="text-[10px] uppercase tracking-wider mr-1"
        style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}
      >
        Product
      </span>
      {PRODUCT_FILTERS.map((f) => {
        const selected = value === f.value;
        return (
          <button
            key={f.value}
            type="button"
            onClick={() => onChange(f.value)}
            className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
            style={{
              fontFamily: "var(--font-plex-mono)",
              background: selected ? `${f.color}22` : "rgba(255,255,255,0.03)",
              color: selected ? f.color : "#94a3b8",
              border: selected ? `1px solid ${f.color}88` : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {f.label}
            <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{counts[f.value]}</span>
          </button>
        );
      })}
    </div>
  );
}

function normalizeAdQuery(q: string): string {
  return q.trim().toLowerCase();
}

function matchesAdQuery(haystacks: Array<string | null | undefined>, q: string): boolean {
  const needle = normalizeAdQuery(q);
  if (!needle) return true;
  return haystacks.some((h) => (h ?? "").toLowerCase().includes(needle));
}

function AdSearchInput({
  value,
  onChange,
  placeholder = "Search ads…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="relative min-w-[14rem] w-full sm:w-72">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder={placeholder}
        aria-label="Search ads"
        className="w-full px-3 py-1.5 rounded-lg text-xs outline-none"
        style={{
          background: "#050c18",
          border: "1px solid rgba(255,255,255,0.1)",
          color: "#e2e8f0",
          fontFamily: "var(--font-plex-mono)",
        }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] uppercase tracking-wider"
          style={{ color: "#64748b" }}
        >
          Clear
        </button>
      ) : null}
    </div>
  );
}

function TagFilterBar({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (slug: string) => void;
  options: { slug: string; label: string; count: number }[];
}) {
  if (options.length === 0 && value === "all") return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="text-[10px] uppercase tracking-wider mr-1"
        style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}
      >
        Topic
      </span>
      <button
        type="button"
        onClick={() => onChange("all")}
        className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
        style={{
          fontFamily: "var(--font-plex-mono)",
          background: value === "all" ? "rgba(148,163,184,0.18)" : "rgba(255,255,255,0.03)",
          color: value === "all" ? "#cbd5e1" : "#94a3b8",
          border: value === "all" ? "1px solid rgba(148,163,184,0.45)" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        All
      </button>
      {options.map((opt) => {
        const selected = value === opt.slug;
        return (
          <button
            key={opt.slug}
            type="button"
            onClick={() => onChange(opt.slug)}
            className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
            style={{
              fontFamily: "var(--font-plex-mono)",
              background: selected ? "rgba(52,211,153,0.16)" : "rgba(255,255,255,0.03)",
              color: selected ? "#6ee7b7" : "#94a3b8",
              border: selected ? "1px solid rgba(52,211,153,0.55)" : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {opt.label}
            <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{opt.count}</span>
          </button>
        );
      })}
    </div>
  );
}

function ChipFilterBar({
  label,
  value,
  onChange,
  options,
  activeColor = "#60a5fa",
}: {
  label: string;
  value: string;
  onChange: (slug: string) => void;
  options: { slug: string; label: string; count: number }[];
  activeColor?: string;
}) {
  if (options.length === 0 && value === "all") return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className="text-[10px] uppercase tracking-wider mr-1"
        style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}
      >
        {label}
      </span>
      <button
        type="button"
        onClick={() => onChange("all")}
        className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
        style={{
          fontFamily: "var(--font-plex-mono)",
          background: value === "all" ? "rgba(148,163,184,0.18)" : "rgba(255,255,255,0.03)",
          color: value === "all" ? "#cbd5e1" : "#94a3b8",
          border: value === "all" ? "1px solid rgba(148,163,184,0.45)" : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        All
      </button>
      {options.map((opt) => {
        const selected = value === opt.slug;
        return (
          <button
            key={opt.slug}
            type="button"
            onClick={() => onChange(opt.slug)}
            className="px-2.5 py-1 rounded-md text-[11px] tracking-wide transition-colors"
            style={{
              fontFamily: "var(--font-plex-mono)",
              background: selected ? `${activeColor}22` : "rgba(255,255,255,0.03)",
              color: selected ? activeColor : "#94a3b8",
              border: selected ? `1px solid ${activeColor}88` : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {opt.label}
            <span className="ml-1.5 tabular-nums" style={{ opacity: 0.7 }}>{opt.count}</span>
          </button>
        );
      })}
    </div>
  );
}

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  winner: { bg: "rgba(245,158,11,0.14)", text: "#fbbf24", label: "Winner" },
  active: { bg: "rgba(52,211,153,0.12)", text: "#34d399", label: "Active" },
  paused: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", label: "Paused" },
  archived: { bg: "rgba(100,116,139,0.1)", text: "#64748b", label: "Archived" },
};

const STATUS_OPTIONS = ["active", "winner", "paused", "archived"] as const;

function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function num(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
}

function pct(v: number | null | undefined): string {
  if (v == null) return "—";
  return `${v.toFixed(2)}%`;
}

/** Turn a Google Drive share link into a thumbnail URL when possible. */
function driveThumb(entry: { drive_url: string | null; thumbnail_url: string | null }): string | null {
  if (entry.thumbnail_url) return entry.thumbnail_url;
  const url = entry.drive_url;
  if (!url) return null;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) ?? url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (match) return `https://drive.google.com/thumbnail?id=${match[1]}&sz=w600`;
  return null;
}

type SortKey =
  | "spend"
  | "impressions"
  | "clicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "leads"
  | "qualified"
  | "qualified_rate"
  | "appointments"
  | "shows"
  | "closes"
  | "cpl"
  | "cost_per_qualified"
  | "cp_conversation"
  | "cp_proposal"
  | "cp_submission"
  | "cp_funded"
  | "unique_proposals"
  | "unique_submissions"
  | "unique_funded"
  | "hand_raise_rate"
  | "conversation_rate"
  | "cost_per_show";

function SortHeader({
  label,
  k,
  sortKey,
  asc,
  onSort,
  align = "right",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sortKey === k;
  return (
    <th
      className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap cursor-pointer select-none ${
        align === "left" ? "text-left" : "text-right"
      }`}
      style={{ color: active ? "#f59e0b" : "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
      onClick={() => onSort(k)}
    >
      {label}
      {active ? (asc ? " ↑" : " ↓") : ""}
    </th>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.active;
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
      style={{ background: s.bg, color: s.text }}
    >
      {s.label}
    </span>
  );
}

function ClassBadge({ label, color }: { label: string; color: string }) {
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
      style={{ background: `${color}20`, color }}
    >
      {label}
    </span>
  );
}

// ── Ad Performance leaderboard ────────────────────────────────────────────────
type AdPerformanceProps = Props & {
  onAddToLibrary: (adName: string) => void;
  onViewInLibrary: (libraryId: string) => void;
};

function AdPerformance({ startDate, endDate, clientId, onAddToLibrary, onViewInLibrary }: AdPerformanceProps) {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("spend");
  const [asc, setAsc] = useState(false);
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const [drill, setDrill] = useState<Record<string, Drilldown | "loading">>({});
  const [unsourcedOpen, setUnsourcedOpen] = useState(true);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [libraryOptions, setLibraryOptions] = useState<LibEntry[]>([]);
  const [linkLibraryId, setLinkLibraryId] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [formatFilter, setFormatFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [minSpendOn, setMinSpendOn] = useState(true);
  const [showPlatform, setShowPlatform] = useState(true);
  const [search, setSearch] = useState("");
  const [linkSearch, setLinkSearch] = useState("");
  const { labels: formatLabels } = useAdFormats();

  const MIN_SPEND = 250;

  const loadAds = useCallback(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (clientId) params.set("client_id", clientId);
    return fetch(`/api/media-buyer?${params}`)
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((data) => {
        setAds(
          (data.ads ?? []).map((a: AdRow) => ({
            ...a,
            row_key: a.row_key ?? `unsourced:${a.ad_name.toLowerCase()}`,
            variant_names: a.variant_names ?? [a.ad_name],
            is_sourced: a.is_sourced ?? !!a.library,
            unique_hand_raises: a.unique_hand_raises ?? 0,
            unique_conversations: a.unique_conversations ?? 0,
          })),
        );
        setDrill({});
        setOpenedKey(null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [startDate, endDate, clientId]);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  function onSort(k: SortKey) {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(false);
    }
  }

  function applyPreset(k: SortKey, nextAsc: boolean) {
    setSortKey(k);
    setAsc(nextAsc);
    setMinSpendOn(true);
  }

  const scopedAds = useMemo(
    () =>
      ads.filter(
        (a) =>
          productMatches(a.library?.product, productFilter) &&
          (tagFilter === "all" || (a.library?.tags ?? []).some((t) => t.slug === tagFilter)) &&
          (formatFilter === "all" || a.library?.ad_format === formatFilter) &&
          (statusFilter === "all" || a.library?.status === statusFilter) &&
          matchesAdQuery(
            [
              a.ad_name,
              ...(a.variant_names ?? []),
              a.library?.summary,
              ...(a.library?.tags ?? []).flatMap((t) => [t.label, t.slug]),
            ],
            search,
          ),
      ),
    [ads, productFilter, tagFilter, formatFilter, statusFilter, search],
  );

  const filteredAds = useMemo(
    () => (minSpendOn ? scopedAds.filter((a) => a.spend >= MIN_SPEND) : scopedAds),
    [scopedAds, minSpendOn],
  );

  const sorted = useMemo(() => {
    const copy = [...filteredAds];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return asc ? av - bv : bv - av;
    });
    return copy;
  }, [filteredAds, sortKey, asc]);

  const filterCounts = useMemo(
    () => ({
      all: ads.length,
      reverse: ads.filter((a) => a.library?.product === "reverse").length,
      dscr: ads.filter((a) => a.library?.product === "dscr").length,
    }),
    [ads],
  );

  const tagFilterOptions = useMemo(() => {
    const counts = new Map<string, { slug: string; label: string; count: number }>();
    for (const a of ads) {
      for (const t of a.library?.tags ?? []) {
        const prev = counts.get(t.slug);
        counts.set(t.slug, { slug: t.slug, label: t.label, count: (prev?.count ?? 0) + 1 });
      }
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [ads]);

  const formatFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of ads) {
      const slug = a.library?.ad_format;
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([slug, count]) => ({
        slug,
        label: adFormatLabel(slug, formatLabels) || slug,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [ads, formatLabels]);

  const statusFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of ads) {
      const s = a.library?.status;
      if (!s) continue;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    return STATUS_OPTIONS
      .filter((s) => counts.has(s) || s === statusFilter)
      .map((slug) => ({
        slug,
        label: STATUS_STYLES[slug]?.label ?? slug,
        count: counts.get(slug) ?? 0,
      }));
  }, [ads, statusFilter]);

  const conceptStrip = useMemo(() => {
    const tags = new Map<string, { label: string; spend: number; conversations: number }>();
    const formats = new Map<string, { label: string; spend: number; conversations: number }>();
    for (const a of filteredAds) {
      for (const t of a.library?.tags ?? []) {
        const prev = tags.get(t.slug) ?? { label: t.label, spend: 0, conversations: 0 };
        prev.spend += a.spend;
        prev.conversations += a.unique_conversations ?? 0;
        tags.set(t.slug, prev);
      }
      if (a.library?.ad_format) {
        const slug = a.library.ad_format;
        const prev = formats.get(slug) ?? {
          label: adFormatLabel(slug, formatLabels) || slug,
          spend: 0,
          conversations: 0,
        };
        prev.spend += a.spend;
        prev.conversations += a.unique_conversations ?? 0;
        formats.set(slug, prev);
      }
    }
    const toChips = (map: Map<string, { label: string; spend: number; conversations: number }>) =>
      [...map.entries()]
        .map(([slug, v]) => ({
          slug,
          label: v.label,
          cpconv: v.conversations > 0 ? v.spend / v.conversations : null,
          spend: v.spend,
        }))
        .filter((c) => c.cpconv != null)
        .sort((a, b) => (a.cpconv ?? Infinity) - (b.cpconv ?? Infinity));
    return { tags: toChips(tags), formats: toChips(formats) };
  }, [filteredAds, formatLabels]);

  const rmRollup = useMemo(
    () => rollupAds(ads.filter((a) => a.library?.product === "reverse")),
    [ads],
  );
  const dscrRollup = useMemo(
    () => rollupAds(ads.filter((a) => a.library?.product === "dscr")),
    [ads],
  );

  const unsourcedAds = useMemo(
    () =>
      productFilter === "all"
        ? ads.filter(
            (a) =>
              !a.is_sourced &&
              (a.spend > 0 || a.has_meta) &&
              matchesAdQuery([a.ad_name, ...(a.variant_names ?? [])], search),
          )
        : [],
    [ads, productFilter, search],
  );

  const openedAd = openedKey ? ads.find((a) => a.row_key === openedKey) ?? sorted.find((a) => a.row_key === openedKey) ?? null : null;

  const openLinkModal = useCallback((adName: string) => {
    setLinkTarget(adName);
    setLinkLibraryId("");
    setLinkError(null);
    setLinkSearch("");
    fetch("/api/ad-library")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load library");
        return r.json();
      })
      .then((data: LibEntry[]) => setLibraryOptions(data))
      .catch((e) => setLinkError(e.message));
  }, []);

  async function submitLink() {
    if (!linkTarget || !linkLibraryId) return;
    setLinkSaving(true);
    setLinkError(null);
    const res = await fetch(`/api/ad-library/${linkLibraryId}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias_name: linkTarget }),
    });
    setLinkSaving(false);
    if (!res.ok) {
      setLinkError((await res.json()).error ?? "Link failed");
      return;
    }
    setLinkTarget(null);
    loadAds();
  }

  const openAd = useCallback(
    (ad: AdRow) => {
      const key = ad.row_key;
      setOpenedKey(key);
      if (!drill[key]) {
        setDrill((d) => ({ ...d, [key]: "loading" }));
        const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
        if (clientId) params.set("client_id", clientId);
        if (ad.library?.id) params.set("library_id", ad.library.id);
        else params.set("ad", ad.variant_names[0] ?? ad.ad_name);
        fetch(`/api/media-buyer?${params}`)
          .then((r) => r.json())
          .then((data: Drilldown) => setDrill((d) => ({ ...d, [key]: data })))
          .catch(() =>
            setDrill((d) => ({
              ...d,
              [key]: {
                ad_name: ad.ad_name,
                granularity: "day",
                perClient: [],
                daily: [],
                perClientDaily: [],
                variants: [],
              },
            })),
          );
      }
    },
    [drill, startDate, endDate, clientId],
  );

  if (loading) return <p style={{ color: "#475569" }} className="text-sm py-10 text-center">Loading ad performance…</p>;
  if (error) return <p style={{ color: "#f87171" }} className="text-sm py-10 text-center">{error}</p>;
  if (ads.length === 0)
    return (
      <p style={{ color: "#475569" }} className="text-sm py-10 text-center">
        No ad data for this range. Make sure Meta ad insights are ingested and leads carry an ad name / utm_content.
      </p>
    );

  const totals = rollupAds(filteredAds);
  const colCount = showPlatform ? 20 : 14;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ProductFilterBar value={productFilter} onChange={setProductFilter} counts={filterCounts} />
        <TagFilterBar value={tagFilter} onChange={setTagFilter} options={tagFilterOptions} />
        <ChipFilterBar label="Format" value={formatFilter} onChange={setFormatFilter} options={formatFilterOptions} />
        <ChipFilterBar label="Status" value={statusFilter} onChange={setStatusFilter} options={statusFilterOptions} activeColor="#fbbf24" />
        <AdSearchInput value={search} onChange={setSearch} placeholder="Search ad name…" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[10px] uppercase tracking-wider mr-1" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>Find best</span>
        {([
          { label: "Best CPCONV", key: "cp_conversation" as const, nextAsc: true },
          { label: "Best CPQL", key: "cost_per_qualified" as const, nextAsc: true },
          { label: "Best CPL", key: "cpl" as const, nextAsc: true },
          { label: "Best CPF", key: "cp_funded" as const, nextAsc: true },
          { label: "Best hand-raise", key: "hand_raise_rate" as const, nextAsc: false },
        ]).map((p) => {
          const on = sortKey === p.key && asc === p.nextAsc;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.key, p.nextAsc)}
              className="px-2.5 py-1 rounded-md text-[11px]"
              style={{
                fontFamily: "var(--font-plex-mono)",
                background: on ? "rgba(245,158,11,0.16)" : "rgba(255,255,255,0.03)",
                color: on ? "#fbbf24" : "#94a3b8",
                border: on ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {p.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setMinSpendOn((v) => !v)}
          className="px-2.5 py-1 rounded-md text-[11px]"
          style={{
            fontFamily: "var(--font-plex-mono)",
            background: minSpendOn ? "rgba(52,211,153,0.14)" : "rgba(255,255,255,0.03)",
            color: minSpendOn ? "#6ee7b7" : "#94a3b8",
            border: minSpendOn ? "1px solid rgba(52,211,153,0.45)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          Min spend ${MIN_SPEND}{minSpendOn ? " on" : " off"}
        </button>
        <button
          type="button"
          onClick={() => setShowPlatform((v) => !v)}
          className="px-2.5 py-1 rounded-md text-[11px] ml-auto"
          style={{
            fontFamily: "var(--font-plex-mono)",
            background: showPlatform ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.03)",
            color: showPlatform ? "#93c5fd" : "#94a3b8",
            border: showPlatform ? "1px solid rgba(96,165,250,0.45)" : "1px solid rgba(255,255,255,0.08)",
          }}
        >
          {showPlatform ? "Hide CPC · CPM" : "Show CPC · CPM"}
        </button>
      </div>

      {(conceptStrip.tags.length > 0 || conceptStrip.formats.length > 0) ? (
        <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>
            Concepts by blended CPCONV
          </p>
          {conceptStrip.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {conceptStrip.tags.map((c) => (
                <button
                  key={`tag-${c.slug}`}
                  type="button"
                  onClick={() => setTagFilter(c.slug)}
                  className="px-2 py-1 rounded-md text-[11px]"
                  style={{
                    fontFamily: "var(--font-plex-mono)",
                    background: tagFilter === c.slug ? "rgba(52,211,153,0.16)" : "rgba(255,255,255,0.04)",
                    color: "#6ee7b7",
                    border: "1px solid rgba(52,211,153,0.25)",
                  }}
                >
                  {c.label} · {money(c.cpconv)}
                </button>
              ))}
            </div>
          ) : null}
          {conceptStrip.formats.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {conceptStrip.formats.map((c) => (
                <button
                  key={`fmt-${c.slug}`}
                  type="button"
                  onClick={() => setFormatFilter(c.slug)}
                  className="px-2 py-1 rounded-md text-[11px]"
                  style={{
                    fontFamily: "var(--font-plex-mono)",
                    background: formatFilter === c.slug ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.04)",
                    color: "#93c5fd",
                    border: "1px solid rgba(96,165,250,0.25)",
                  }}
                >
                  {c.label} · {money(c.cpconv)}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {productFilter === "all" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {([
            { key: "reverse" as const, label: "RM", color: "#38bdf8", stats: rmRollup },
            { key: "dscr" as const, label: "DSCR", color: "#fbbf24", stats: dscrRollup },
          ]).map((lane) => (
            <button
              key={lane.key}
              type="button"
              onClick={() => setProductFilter(lane.key)}
              className="rounded-xl p-4 text-left transition-colors"
              style={{
                background: "#0a1424",
                border: `1px solid ${lane.color}33`,
              }}
            >
              <p
                className="text-[11px] uppercase tracking-wider font-semibold"
                style={{ color: lane.color, fontFamily: "var(--font-plex-mono)" }}
              >
                {lane.label}
                <span className="ml-2 font-normal" style={{ color: "#64748b" }}>{lane.stats.ads} ads</span>
              </p>
              <div className="mt-3 grid grid-cols-3 sm:grid-cols-7 gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>Spend</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money(Math.round(lane.stats.spend))}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>Leads</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{num(lane.stats.leads)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CTR</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{pct(lane.stats.ctr)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CPC</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money(lane.stats.cpc)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CPM</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money(lane.stats.cpm)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CPCONV</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money(lane.stats.cp_conversation)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>Funded</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{num(lane.stats.unique_funded)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : null}

      {unsourcedAds.length > 0 ? (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(251,191,36,0.2)" }}>
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left"
            style={{ background: "rgba(251,191,36,0.06)" }}
            onClick={() => setUnsourcedOpen((v) => !v)}
          >
            <span className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
              Needs library entry ({unsourcedAds.length})
            </span>
            <span className="text-xs" style={{ color: "#94a3b8" }}>{unsourcedOpen ? "Hide" : "Show"}</span>
          </button>
          {unsourcedOpen ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#050c18" }}>
                    {["Ad name", "Spend", "Leads", "Actions"].map((h, i) => (
                      <th
                        key={h}
                        className={`px-3 py-2 ${i === 0 ? "text-left" : i === 3 ? "text-right" : "text-right"} text-[10px] font-semibold uppercase tracking-wider`}
                        style={{ color: "#475569" }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {unsourcedAds.map((ad) => (
                    <tr
                      key={ad.row_key}
                      className="cursor-pointer transition-colors"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                      onClick={() => openAd(ad)}
                    >
                      <td className="px-3 py-2 text-left" style={{ color: "#e2e8f0" }}>{ad.ad_name}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{money(ad.spend)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(ad.leads)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="text-[11px] underline mr-3"
                          style={{ color: "#cbd5e1" }}
                          onClick={() => openAd(ad)}
                        >
                          Open
                        </button>
                        <button
                          type="button"
                          className="text-[11px] underline mr-3"
                          style={{ color: "#f59e0b" }}
                          onClick={() => onAddToLibrary(ad.ad_name)}
                        >
                          Add to library
                        </button>
                        <button
                          type="button"
                          className="text-[11px] underline"
                          style={{ color: "#60a5fa" }}
                          onClick={() => openLinkModal(ad.ad_name)}
                        >
                          Link to existing
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 2xl:grid-cols-12 gap-3">
        {[
          { label: "Total Spend", value: money(Math.round(totals.spend)) },
          { label: "Impr", value: num(totals.impressions) },
          { label: "Clicks", value: num(totals.clicks) },
          { label: "CTR", value: pct(totals.ctr) },
          { label: "CPC", value: money(totals.cpc) },
          { label: "CPM", value: money(totals.cpm) },
          { label: "Leads", value: num(totals.leads) },
          { label: "Qual %", value: pct(totals.qualified_rate) },
          { label: "CPL", value: money(totals.cpl) },
          { label: "CPQL", value: money(totals.cost_per_qualified) },
          { label: "CPCONV", value: money(totals.cp_conversation) },
          { label: "Proposals", value: num(totals.unique_proposals) },
          { label: "Submissions", value: num(totals.unique_submissions) },
          { label: "Funded", value: num(totals.unique_funded) },
          { label: "CPF", value: money(totals.cp_funded) },
          { label: "Hand-raise", value: pct(totals.hand_raise_rate) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: "#475569" }}>{s.label}</p>
            <p className="text-xl font-bold mt-1" style={{ color: "#e2e8f0" }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#050c18" }}>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  Ad
                </th>
                <SortHeader label="Spend" k="spend" sortKey={sortKey} asc={asc} onSort={onSort} />
                {showPlatform ? (
                  <>
                    <SortHeader label="Impr" k="impressions" sortKey={sortKey} asc={asc} onSort={onSort} />
                    <SortHeader label="Clicks" k="clicks" sortKey={sortKey} asc={asc} onSort={onSort} />
                    <SortHeader label="CTR" k="ctr" sortKey={sortKey} asc={asc} onSort={onSort} />
                    <SortHeader label="CPC" k="cpc" sortKey={sortKey} asc={asc} onSort={onSort} />
                    <SortHeader label="CPM" k="cpm" sortKey={sortKey} asc={asc} onSort={onSort} />
                  </>
                ) : null}
                <SortHeader label="Leads" k="leads" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Qual %" k="qualified_rate" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="CPL" k="cpl" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="CPQL" k="cost_per_qualified" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="CPCONV" k="cp_conversation" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="HR %" k="hand_raise_rate" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Conv %" k="conversation_rate" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Prop" k="unique_proposals" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Sub" k="unique_submissions" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Funded" k="unique_funded" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="CPF" k="cp_funded" sortKey={sortKey} asc={asc} onSort={onSort} />
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  Clients
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-10 text-center text-sm" style={{ color: "#64748b" }}>
                    {search.trim()
                      ? `No ads match “${search.trim()}”.`
                      : minSpendOn
                        ? `No ads at or above $${MIN_SPEND} spend in this filter. Turn min spend off to see the rest.`
                        : `No ${productFilter === "reverse" ? "RM" : productFilter === "dscr" ? "DSCR" : ""} ads tagged in this range. Tag creatives with a product in Ad Library to split performance.`}
                  </td>
                </tr>
              ) : (
                sorted.map((ad) => (
                  <FragmentRow
                    key={ad.row_key}
                    ad={ad}
                    showPlatform={showPlatform}
                    formatLabels={formatLabels}
                    onOpen={() => openAd(ad)}
                    onAddToLibrary={onAddToLibrary}
                    onViewInLibrary={onViewInLibrary}
                    onLinkToExisting={openLinkModal}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {openedAd ? (
        <AdWorkspaceOverlay
          ad={openedAd}
          drilldown={drill[openedAd.row_key] ?? "loading"}
          formatLabels={formatLabels}
          onClose={() => setOpenedKey(null)}
          onViewInLibrary={(id) => {
            setOpenedKey(null);
            onViewInLibrary(id);
          }}
          onAddToLibrary={(name) => {
            setOpenedKey(null);
            onAddToLibrary(name);
          }}
        />
      ) : null}

      {linkTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setLinkTarget(null)}>
          <div
            className="rounded-xl w-full max-w-md p-5 space-y-3"
            style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>Link to existing creative</h3>
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              Link <span style={{ color: "#e2e8f0" }}>{linkTarget}</span> to a library entry. Metrics will roll up with other variants.
            </p>
            <AdSearchInput value={linkSearch} onChange={setLinkSearch} placeholder="Search library ads…" />
            <select
              value={linkLibraryId}
              onChange={(e) => setLinkLibraryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
            >
              <option value="">Select library entry…</option>
              {libraryOptions
                .filter((e) =>
                  matchesAdQuery(
                    [e.ad_name, ...(e.aliases ?? []).map((a) => a.alias_name)],
                    linkSearch,
                  ),
                )
                .map((e) => (
                <option key={e.id} value={e.id}>{e.ad_name}</option>
              ))}
            </select>
            {linkError ? <p className="text-xs" style={{ color: "#f87171" }}>{linkError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setLinkTarget(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "#94a3b8" }}>
                Cancel
              </button>
              <button
                type="button"
                onClick={submitLink}
                disabled={linkSaving || !linkLibraryId}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "#f59e0b", color: "#0a1424", opacity: linkSaving || !linkLibraryId ? 0.6 : 1 }}
              >
                {linkSaving ? "Linking…" : "Link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FragmentRow({
  ad,
  showPlatform,
  formatLabels,
  onOpen,
  onAddToLibrary,
  onViewInLibrary,
  onLinkToExisting,
}: {
  ad: AdRow;
  showPlatform: boolean;
  formatLabels: Record<string, string>;
  onOpen: () => void;
  onAddToLibrary: (adName: string) => void;
  onViewInLibrary: (libraryId: string) => void;
  onLinkToExisting: (adName: string) => void;
}) {
  return (
    <tr
      className="cursor-pointer transition-colors"
      style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      role="button"
    >
      <td className="px-3 py-3 text-left" style={{ color: "#e2e8f0" }}>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium">{ad.ad_name}</span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpen();
            }}
            className="text-[11px] underline"
            style={{ color: "#e2e8f0" }}
          >
            Open
          </button>
          {ad.library ? <StatusBadge status={ad.library.status} /> : (
            <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase" style={{ background: "rgba(100,116,139,0.15)", color: "#64748b" }}>
              Not in library
            </span>
          )}
          {ad.library?.ad_format ? (
            <ClassBadge label={adFormatLabel(ad.library.ad_format, formatLabels)} color="#60a5fa" />
          ) : null}
          {ad.library?.product ? (
            <ClassBadge
              label={PRODUCT_LABELS[ad.library.product] ?? ad.library.product}
              color={ad.library.product === "dscr" ? "#fbbf24" : "#38bdf8"}
            />
          ) : null}
          {(ad.library?.tags ?? []).slice(0, 3).map((t) => (
            <ClassBadge key={t.slug} label={t.label} color="#34d399" />
          ))}
          {ad.variant_names.length > 1 ? (
            <ClassBadge label={`${ad.variant_names.length} variants`} color="#f59e0b" />
          ) : null}
          {ad.library ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewInLibrary(ad.library!.id);
              }}
              className="text-[11px] underline"
              style={{ color: "#f59e0b" }}
            >
              View in library
            </button>
          ) : null}
          {ad.library?.drive_url ? (
            <a
              href={ad.library.drive_url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[11px] underline"
              style={{ color: "#60a5fa" }}
            >
              creative
            </a>
          ) : null}
          {!ad.is_sourced ? (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToLibrary(ad.ad_name);
                }}
                className="text-[11px] underline"
                style={{ color: "#f59e0b" }}
              >
                Add
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onLinkToExisting(ad.ad_name);
                }}
                className="text-[11px] underline"
                style={{ color: "#60a5fa" }}
              >
                Link
              </button>
            </>
          ) : null}
        </div>
      </td>
      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.spend)}</td>
      {showPlatform ? (
        <>
          <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.impressions)}</td>
          <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.clicks)}</td>
          <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{pct(ad.ctr)}</td>
          <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.cpc)}</td>
          <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.cpm)}</td>
        </>
      ) : null}
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.leads)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#a78bfa" }}>{pct(ad.qualified_rate)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.cpl)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.cost_per_qualified)}</td>
      <td className="px-3 py-3 text-right font-semibold" style={{ color: "#fbbf24" }}>{money(ad.cp_conversation)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{pct(ad.hand_raise_rate)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{pct(ad.conversation_rate)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.unique_proposals ?? 0)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.unique_submissions ?? 0)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{num(ad.unique_funded ?? 0)}</td>
      <td className="px-3 py-3 text-right font-semibold" style={{ color: "#34d399" }}>{money(ad.cp_funded)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#475569" }}>{ad.client_count}</td>
    </tr>
  );
}

// ── Ad Library ────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  id: "",
  ad_name: "",
  status: "active",
  ad_format: "",
  product: "",
  tags: [] as string[],
  drive_url: "",
  thumbnail_url: "",
  summary: "",
  visual_notes: "",
};

type LibraryMetrics = {
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
};

function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-2.5 py-1.5 min-w-0 flex-1"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <p className="text-[9px] uppercase tracking-wider font-semibold" style={{ color: "#64748b" }}>{label}</p>
      <p className="text-sm font-semibold mt-0.5 truncate" style={{ color: "#e2e8f0" }}>{value}</p>
    </div>
  );
}

function AdLibrary({
  startDate,
  endDate,
  clientId,
  libraryNav,
  onNavClear,
}: Props & {
  libraryNav: LibraryNav;
  onNavClear: () => void;
}) {
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [metricsById, setMetricsById] = useState<Map<string, LibraryMetrics>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null);
  const [editAliases, setEditAliases] = useState<LibraryAlias[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [expandedVariants, setExpandedVariants] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [productFilter, setProductFilter] = useState<ProductFilter>("all");
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { formats, labels: formatLabels, createFormat, loading: formatsLoading } = useAdFormats();
  const { tags: tagCatalog, createTag, loading: tagsLoading } = useAdTags();

  const openEditForm = useCallback((e: LibEntry) => {
    setFormError(null);
    setAliasError(null);
    setNewAlias("");
    setEditAliases(e.aliases ?? []);
    setForm({
      id: e.id,
      ad_name: e.ad_name,
      status: e.status,
      ad_format: e.ad_format ?? "",
      product: e.product ?? "",
      tags: (e.tags ?? []).map((t) => t.slug),
      drive_url: e.drive_url ?? "",
      thumbnail_url: e.thumbnail_url ?? "",
      summary: e.summary ?? "",
      visual_notes: e.visual_notes ?? "",
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const perfParams = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (clientId) perfParams.set("client_id", clientId);
    Promise.all([
      fetch("/api/ad-library").then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load library");
        return r.json() as Promise<LibEntry[]>;
      }),
      fetch(`/api/media-buyer?${perfParams}`).then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load metrics");
        return r.json() as Promise<{ ads?: AdRow[] }>;
      }),
    ])
      .then(([libraryData, perfData]) => {
        setEntries(libraryData.map((e) => ({ ...e, aliases: e.aliases ?? [], tags: e.tags ?? [] })));
        const next = new Map<string, LibraryMetrics>();
        for (const ad of perfData.ads ?? []) {
          const libId = ad.library?.id;
          if (!libId) continue;
          next.set(libId, { cpl: ad.cpl, ctr: ad.ctr, cpc: ad.cpc });
        }
        setMetricsById(next);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [startDate, endDate, clientId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!libraryNav) return;
    if (libraryNav.prefillAdName && libraryNav.openForm) {
      setFormError(null);
      setForm({ ...EMPTY_FORM, ad_name: libraryNav.prefillAdName });
      onNavClear();
      return;
    }
    if (libraryNav.libraryId) {
      setHighlightId(libraryNav.libraryId);
      const entry = entries.find((e) => e.id === libraryNav.libraryId);
      requestAnimationFrame(() => {
        document.getElementById(`library-card-${libraryNav.libraryId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      if (libraryNav.openForm && entry) openEditForm(entry);
      onNavClear();
    }
  }, [libraryNav, entries, onNavClear, openEditForm]);

  async function addAlias() {
    if (!form?.id || !newAlias.trim()) return;
    setAliasError(null);
    const res = await fetch(`/api/ad-library/${form.id}/aliases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alias_name: newAlias.trim() }),
    });
    if (!res.ok) {
      setAliasError((await res.json()).error ?? "Failed to add alias");
      return;
    }
    const created = await res.json();
    setEditAliases((prev) => [...prev, created]);
    setNewAlias("");
    load();
  }

  async function removeAlias(aliasId: string) {
    await fetch(`/api/ad-library/aliases/${aliasId}`, { method: "DELETE" });
    setEditAliases((prev) => prev.filter((a) => a.id !== aliasId));
    load();
  }

  async function save() {
    if (!form) return;
    if (!form.ad_name.trim()) {
      setFormError("Ad name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);
    const body = {
      ad_name: form.ad_name.trim(),
      status: form.status,
      ad_format: form.ad_format || null,
      product: form.product || null,
      tags: form.tags,
      drive_url: form.drive_url.trim() || null,
      thumbnail_url: form.thumbnail_url.trim() || null,
      summary: form.summary.trim() || null,
      visual_notes: form.visual_notes.trim() || null,
    };
    const isEdit = !!form.id;
    const res = await fetch(isEdit ? `/api/ad-library/${form.id}` : "/api/ad-library", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError((await res.json()).error ?? "Save failed");
      return;
    }
    setForm(null);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Remove this ad from the library?")) return;
    await fetch(`/api/ad-library/${id}`, { method: "DELETE" });
    load();
  }

  async function queueForKb(entry: LibEntry) {
    if (!entry.summary?.trim()) {
      alert("Add a summary before queuing for the OS knowledge base.");
      openEditForm(entry);
      return;
    }
    const res = await fetch("/api/ad-library/intelligence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: entry.id, knowledge_capture_status: "pending" }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed to queue for KB");
      return;
    }
    load();
  }

  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (e) =>
          productMatches(e.product, productFilter) &&
          (tagFilter === "all" || (e.tags ?? []).some((t) => t.slug === tagFilter)) &&
          matchesAdQuery(
            [
              e.ad_name,
              e.summary,
              ...(e.aliases ?? []).map((a) => a.alias_name),
              ...(e.tags ?? []).flatMap((t) => [t.label, t.slug]),
            ],
            search,
          ),
      ),
    [entries, productFilter, tagFilter, search],
  );
  const libraryFilterCounts = useMemo(
    () => ({
      all: entries.length,
      reverse: entries.filter((e) => e.product === "reverse").length,
      dscr: entries.filter((e) => e.product === "dscr").length,
    }),
    [entries],
  );
  const tagFilterOptions = useMemo(() => {
    const counts = new Map<string, { slug: string; label: string; count: number }>();
    for (const e of entries) {
      for (const t of e.tags ?? []) {
        const prev = counts.get(t.slug);
        counts.set(t.slug, { slug: t.slug, label: t.label, count: (prev?.count ?? 0) + 1 });
      }
    }
    if (tagFilter !== "all" && !counts.has(tagFilter)) {
      const fromCatalog = tagCatalog.find((t) => t.slug === tagFilter);
      counts.set(tagFilter, {
        slug: tagFilter,
        label: fromCatalog?.label ?? tagFilter,
        count: 0,
      });
    }
    return [...counts.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [entries, tagFilter, tagCatalog]);

  if (loading) return <p style={{ color: "#475569" }} className="text-sm py-10 text-center">Loading library…</p>;
  if (error) return <p style={{ color: "#f87171" }} className="text-sm py-10 text-center">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-2 min-w-0 flex-1">
          <ProductFilterBar value={productFilter} onChange={setProductFilter} counts={libraryFilterCounts} />
          <TagFilterBar value={tagFilter} onChange={setTagFilter} options={tagFilterOptions} />
          <AdSearchInput value={search} onChange={setSearch} placeholder="Search name, alias, or topic…" />
        </div>
        <button
          onClick={() => {
            setFormError(null);
            setForm({ ...EMPTY_FORM });
          }}
          className="px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: "#f59e0b", color: "#0a1424" }}
        >
          + Add Ad
        </button>
      </div>

      {entries.length === 0 ? (
        <p style={{ color: "#475569" }} className="text-sm py-10 text-center">
          No ads in the library yet. Add one with its ad name and a Google Drive link.
        </p>
      ) : visibleEntries.length === 0 ? (
        <p style={{ color: "#64748b" }} className="text-sm py-10 text-center">
          {search.trim()
            ? `No ads match “${search.trim()}”.`
            : "No ads match these filters. Adjust product or topic, or tag an ad in the library."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {visibleEntries.map((e) => {
            const thumb = driveThumb(e);
            const allNames = [e.ad_name, ...(e.aliases ?? []).map((a) => a.alias_name)];
            const isHighlighted = highlightId === e.id;
            const metrics = metricsById.get(e.id);
            return (
              <div
                key={e.id}
                id={`library-card-${e.id}`}
                className="rounded-xl overflow-hidden flex flex-col transition-shadow"
                style={{
                  background: "#0a1424",
                  border: isHighlighted ? "1px solid rgba(245,158,11,0.5)" : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: isHighlighted ? "0 0 0 2px rgba(245,158,11,0.25)" : undefined,
                }}
              >
                <div className="p-4 flex gap-3 flex-1">
                  {thumb ? (
                    <button
                      type="button"
                      onClick={() => openEditForm(e)}
                      className="shrink-0 w-16 h-16 rounded-lg overflow-hidden"
                      style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumb} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </button>
                  ) : null}
                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => openEditForm(e)}
                        className="text-left min-w-0"
                      >
                        <p className="font-semibold text-sm leading-snug truncate" style={{ color: "#e2e8f0" }} title={e.ad_name}>
                          {e.ad_name}
                        </p>
                      </button>
                      <StatusBadge status={e.status} />
                    </div>
                    {allNames.length > 1 ? (
                      <div className="mt-1.5">
                        <button
                          type="button"
                          className="text-[11px] underline"
                          style={{ color: "#94a3b8" }}
                          onClick={() => setExpandedVariants(expandedVariants === e.id ? null : e.id)}
                        >
                          {allNames.length} linked names {expandedVariants === e.id ? "▲" : "▼"}
                        </button>
                        {expandedVariants === e.id ? (
                          <ul className="mt-1 space-y-0.5">
                            {allNames.map((name) => (
                              <li key={name} className="text-[11px] truncate" style={{ color: "#64748b" }}>
                                {name}
                                {name === e.ad_name ? " (primary)" : ""}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    ) : null}
                    {(e.ad_format || e.product || (e.tags ?? []).length > 0 || (e.knowledge_capture_status && e.knowledge_capture_status !== "none")) ? (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {e.ad_format ? (
                          <ClassBadge label={adFormatLabel(e.ad_format, formatLabels)} color="#60a5fa" />
                        ) : null}
                        {e.product ? (
                          <ClassBadge label={PRODUCT_LABELS[e.product] ?? e.product} color="#a78bfa" />
                        ) : null}
                        {(e.tags ?? []).map((t) => (
                          <button
                            key={t.slug}
                            type="button"
                            onClick={() => setTagFilter(t.slug)}
                            title={`Filter by ${t.label}`}
                          >
                            <ClassBadge label={t.label} color="#34d399" />
                          </button>
                        ))}
                        {e.knowledge_capture_status && e.knowledge_capture_status !== "none" ? (
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide"
                            style={{
                              background: e.knowledge_capture_status === "processed" ? "rgba(52,211,153,0.12)" : "rgba(245,158,11,0.12)",
                              color: e.knowledge_capture_status === "processed" ? "#34d399" : "#fbbf24",
                            }}
                          >
                            KB {e.knowledge_capture_status.replace("_", " ")}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex gap-2 mt-3">
                      <MetricChip label="CPL" value={money(metrics?.cpl)} />
                      <MetricChip label="CTR" value={pct(metrics?.ctr)} />
                      <MetricChip label="CPC" value={money(metrics?.cpc)} />
                    </div>
                  </div>
                </div>
                <div
                  className="flex items-center gap-3 px-4 py-2.5 flex-wrap"
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.15)" }}
                >
                  <button
                    type="button"
                    onClick={() => openEditForm(e)}
                    className="text-xs font-medium"
                    style={{ color: "#e2e8f0" }}
                  >
                    Open
                  </button>
                  {e.drive_url ? (
                    <a href={e.drive_url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "#60a5fa" }}>
                      Creative
                    </a>
                  ) : null}
                  {e.knowledge_capture_status !== "processed" ? (
                    <button
                      type="button"
                      onClick={() => queueForKb(e)}
                      className="text-xs"
                      style={{ color: "#fbbf24" }}
                    >
                      Queue for OS KB
                    </button>
                  ) : null}
                  <button
                    onClick={() => openEditForm(e)}
                    className="text-xs ml-auto"
                    style={{ color: "#94a3b8" }}
                  >
                    Edit
                  </button>
                  <button onClick={() => remove(e.id)} className="text-xs" style={{ color: "#f87171" }}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setForm(null)}>
          <div
            className="rounded-xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
                  {form.id ? form.ad_name || "Ad details" : "Add Ad"}
                </h3>
                {form.id ? (
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    Script, visual notes, and classification — full overview lives here.
                  </p>
                ) : null}
              </div>
              {form.id && form.drive_url ? (
                <a
                  href={form.drive_url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: "rgba(96,165,250,0.12)", color: "#60a5fa" }}
                >
                  Open creative
                </a>
              ) : null}
            </div>
            {form.id ? (
              <div className="flex gap-2">
                {(["CPL", "CTR", "CPC"] as const).map((label) => {
                  const m = metricsById.get(form.id);
                  const value =
                    label === "CPL" ? money(m?.cpl) : label === "CTR" ? pct(m?.ctr) : money(m?.cpc);
                  return <MetricChip key={label} label={label} value={value} />;
                })}
              </div>
            ) : null}
            <Field label="Ad name (primary — canonical name for this creative)">
              <input
                value={form.ad_name}
                onChange={(e) => setForm({ ...form, ad_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                placeholder="e.g. Spring Promo — UGC v3"
              />
            </Field>
            {form.id ? (
              <Field label="Linked ad names (Facebook variants)">
                <div className="space-y-2">
                  <p className="text-[10px]" style={{ color: "#64748b" }}>
                    Primary: <span style={{ color: "#94a3b8" }}>{form.ad_name}</span>
                  </p>
                  {editAliases.length === 0 ? (
                    <p className="text-xs" style={{ color: "#475569" }}>No variant aliases yet.</p>
                  ) : (
                    <ul className="space-y-1">
                      {editAliases.map((a) => (
                        <li key={a.id} className="flex items-center justify-between gap-2 text-xs" style={{ color: "#cbd5e1" }}>
                          <span className="truncate">{a.alias_name}</span>
                          <button type="button" onClick={() => removeAlias(a.id)} className="shrink-0" style={{ color: "#f87171" }}>
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2">
                    <input
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      className="flex-1 px-3 py-2 rounded-lg text-sm"
                      style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                      placeholder="Facebook ad name variant…"
                    />
                    <button
                      type="button"
                      onClick={addAlias}
                      disabled={!newAlias.trim()}
                      className="px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
                      style={{ background: "#1e293b", color: "#e2e8f0", opacity: newAlias.trim() ? 1 : 0.5 }}
                    >
                      Add
                    </button>
                  </div>
                  {aliasError ? <p className="text-xs" style={{ color: "#f87171" }}>{aliasError}</p> : null}
                </div>
              </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{STATUS_STYLES[s].label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Product">
                <select
                  value={form.product}
                  onChange={(e) => setForm({ ...form, product: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                >
                  {PRODUCT_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "#475569" }}>Ad format</span>
              <div className="mt-1">
                  <AdFormatPicker
                    value={form.ad_format}
                    onChange={(slug) => setForm({ ...form, ad_format: slug })}
                    formats={formats}
                    onCreate={createFormat}
                    loading={formatsLoading}
                  />
              </div>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider" style={{ color: "#475569" }}>Topics</span>
              <div className="mt-1">
                <AdTagPicker
                  value={form.tags}
                  onChange={(slugs) => setForm({ ...form, tags: slugs })}
                  tags={tagCatalog}
                  onCreate={createTag}
                  loading={tagsLoading}
                />
              </div>
            </div>
            <Field label="Thumbnail URL (optional)">
              <input
                value={form.thumbnail_url}
                onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                placeholder="https://…"
              />
            </Field>
            <Field label="Google Drive link">
              <input
                value={form.drive_url}
                onChange={(e) => setForm({ ...form, drive_url: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                placeholder="https://drive.google.com/file/d/…"
              />
            </Field>
            <Field label="Ad overview — script / copy + visual aspects">
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono leading-relaxed"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                placeholder="Full script, hook, offer, on-screen text, talent, pacing, colors, format details…"
              />
            </Field>
            <Field label="Comments & notes (for AI)">
              <textarea
                value={form.visual_notes}
                onChange={(e) => setForm({ ...form, visual_notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                placeholder="Performance notes, what worked, what to test next, context for recreating this ad…"
              />
              <p className="text-[10px] mt-1" style={{ color: "#64748b" }}>
                AI will use both the script/copy above and these notes when generating new creatives.
              </p>
            </Field>
            {formError ? <p className="text-xs" style={{ color: "#f87171" }}>{formError}</p> : null}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setForm(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "#94a3b8" }}>
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "#f59e0b", color: "#0a1424", opacity: saving ? 0.6 : 1 }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: "#475569" }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ── Shell with sub-tabs ───────────────────────────────────────────────────────
export default function MediaBuyer({ startDate, endDate, clientId }: Props) {
  const [tab, setTab] = useState<"performance" | "library">("performance");
  const [libraryNav, setLibraryNav] = useState<LibraryNav>(null);

  const handleAddToLibrary = useCallback((adName: string) => {
    setLibraryNav({ prefillAdName: adName, openForm: true });
    setTab("library");
  }, []);

  const handleViewInLibrary = useCallback((libraryId: string) => {
    setLibraryNav({ libraryId });
    setTab("library");
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {([
          ["performance", "Ad Performance"],
          ["library", "Ad Library"],
        ] as const).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={
                active
                  ? { background: "rgba(245,158,11,0.12)", color: "#f59e0b" }
                  : { background: "#0a1424", color: "#475569", border: "1px solid rgba(255,255,255,0.06)" }
              }
            >
              {label}
            </button>
          );
        })}
      </div>

      {tab === "performance" ? (
        <AdPerformance
          startDate={startDate}
          endDate={endDate}
          clientId={clientId}
          onAddToLibrary={handleAddToLibrary}
          onViewInLibrary={handleViewInLibrary}
        />
      ) : (
        <AdLibrary
          startDate={startDate}
          endDate={endDate}
          clientId={clientId}
          libraryNav={libraryNav}
          onNavClear={() => setLibraryNav(null)}
        />
      )}
    </div>
  );
}
