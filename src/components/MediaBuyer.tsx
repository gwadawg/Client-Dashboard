"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AdFormatPicker, useAdFormats } from "./AdFormatPicker";
import { AdTagPicker, useAdTags } from "./AdTagPicker";
import AdWorkspaceOverlay, { type AdWorkspaceDrilldown } from "./AdWorkspaceOverlay";
import ModalCloseButton from "./ModalCloseButton";
import CardActionsMenu from "./ad-library/CardActionsMenu";
import FolderRail from "./ad-library/FolderRail";
import LibraryBreadcrumb from "./ad-library/LibraryBreadcrumb";
import CreativeCommand from "./creative-command/CreativeCommand";
// One set of formatters and primitives across both tabs of this shell, so the
// same CPL cannot render two ways depending on which tab you are looking at.
import { Chip, Empty, Kicker, driveThumb, money, money2, pct } from "./creative-command/ui";
import { adFormatLabel } from "@/lib/ad-formats";
import {
  buildFolderTreeCounts,
  countMatchesOutsideFolder,
  defaultFolderPath,
  DEFAULT_LIBRARY_SORT,
  entryMatchesFolder,
  folderPathForEntry,
  folderPathKey,
  formPrefillFromFolder,
  groupEntriesByFormat,
  libraryAdComparator,
  LIBRARY_SORT_OPTIONS,
  loadStoredFolderPath,
  parseFolderPathKey,
  parseLibrarySort,
  shouldSectionByFormat,
  storeFolderPath,
  type FolderPath,
  type LibrarySort,
} from "@/lib/ad-library-folders";
import type { AdTagRef } from "@/lib/ad-tags";
import AdsPausedControl from "@/components/AdsPausedControl";

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
  optin_rate: number | null;
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
  ready_to_test?: boolean;
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
  /** Open Ad Library with the Ready to test filter on. */
  readyToTest?: boolean;
} | null;

/**
 * Query params this tab owns, so a folder is linkable and the back button
 * works. `media_buyer` is not a hub view, so DashboardView's `goToView` strips
 * `tab` on entry — hence the dedicated names rather than reusing `tab`.
 */
const TAB_PARAM = "mb";
const FOLDER_PARAM = "folder";
const SORT_PARAM = "sort";

/** Long enough for the deep link's smooth scroll to land and register. */
const HIGHLIGHT_LINGER_MS = 2400;

function useTabParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /**
   * `push` for moves the user made on purpose — changing tab or folder — so
   * Back walks them in reverse. `replace` for refinements and for restoring
   * remembered state, which should not pile up history entries.
   */
  const setParams = useCallback(
    (next: Record<string, string | null>, mode: "push" | "replace" = "replace") => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(next)) {
        if (value == null) params.delete(key);
        else params.set(key, value);
      }
      const qs = params.toString();
      const href = qs ? `${pathname}?${qs}` : pathname;
      if (mode === "push") router.push(href, { scroll: false });
      else router.replace(href, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  return { searchParams, setParams };
}

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

type AdSlice = {
  product: ProductFilter;
  tag: string;
  format: string;
  status: string;
  search: string;
};

function adPassesSlice(a: AdRow, slice: AdSlice, skip?: keyof AdSlice): boolean {
  if (skip !== "product" && !productMatches(a.library?.product, slice.product)) return false;
  if (skip !== "tag" && slice.tag !== "all" && !(a.library?.tags ?? []).some((t) => t.slug === slice.tag)) return false;
  if (skip !== "format" && slice.format !== "all" && a.library?.ad_format !== slice.format) return false;
  if (skip !== "status" && slice.status !== "all" && a.library?.status !== slice.status) return false;
  if (
    skip !== "search" &&
    !matchesAdQuery(
      [
        a.ad_name,
        ...(a.variant_names ?? []),
        a.library?.summary,
        ...(a.library?.tags ?? []).flatMap((t) => [t.label, t.slug]),
      ],
      slice.search,
    )
  ) {
    return false;
  }
  return true;
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
    optin_rate: clicks > 0 ? (leads / clicks) * 100 : null,
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

const FILTER_INK = {
  rail: "#64748b",
  live: "#f59e0b",
  muted: "#475569",
  body: "#cbd5e1",
  panel: "#070f1c",
  cell: "#0a1526",
} as const;

function ChannelLabel({
  kicker,
  live,
  onClear,
}: {
  kicker: string;
  live?: boolean;
  onClear?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5 min-h-[14px]">
      <span
        className="text-[9px] uppercase tracking-[0.2em] leading-none"
        style={{
          color: live ? FILTER_INK.live : FILTER_INK.rail,
          fontFamily: "var(--font-archivo), var(--font-display), sans-serif",
          fontWeight: 600,
        }}
      >
        {kicker}
      </span>
      {live && onClear ? (
        <button
          type="button"
          onClick={onClear}
          className="text-[9px] leading-none uppercase tracking-wider"
          style={{ color: FILTER_INK.rail, fontFamily: "var(--font-plex-mono)" }}
        >
          any
        </button>
      ) : null}
    </div>
  );
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
    <FilterSelect
      label="Product"
      value={value}
      onChange={(slug) => onChange(slug as ProductFilter)}
      options={PRODUCT_FILTERS.filter((f) => f.value !== "all").map((f) => ({
        slug: f.value,
        label: f.label,
        count: counts[f.value],
      }))}
      anyLabel="Any product"
      accent="#38bdf8"
    />
  );
}

function normalizeAdQuery(q: string): string {
  return q.trim().toLowerCase();
}

/** Empty/HTML error bodies throw "Unexpected end of JSON input" on res.json(). */
async function readJson<T = unknown>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

function matchesAdQuery(haystacks: Array<string | null | undefined>, q: string): boolean {
  const needle = normalizeAdQuery(q);
  if (!needle) return true;
  return haystacks.some((h) => (h ?? "").toLowerCase().includes(needle));
}

/** Fields library search reads, so folder-scoped and library-wide counts agree. */
function adSearchHaystack(e: LibEntry): Array<string | null | undefined> {
  return [
    e.ad_name,
    e.summary,
    ...(e.aliases ?? []).map((a) => a.alias_name),
    ...(e.tags ?? []).flatMap((t) => [t.label, t.slug]),
  ];
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
    <div className="relative w-full min-w-[12rem]">
      <ChannelLabel kicker="Find" live={!!value} onClear={value ? () => onChange("") : undefined} />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") onChange("");
        }}
        placeholder={placeholder}
        aria-label="Search ads"
        className="w-full px-3 py-1.5 rounded-md text-xs outline-none"
        style={{
          background: FILTER_INK.panel,
          border: value ? "1px solid rgba(245,158,11,0.45)" : "1px solid rgba(255,255,255,0.1)",
          color: "#e2e8f0",
          fontFamily: "var(--font-plex-mono)",
        }}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  anyLabel,
  accent = "#6ee7b7",
  hideCounts = false,
}: {
  label: string;
  value: string;
  onChange: (slug: string) => void;
  options: { slug: string; label: string; count: number }[];
  anyLabel: string;
  accent?: string;
  hideCounts?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const live = value !== "all";
  const selected = options.find((o) => o.slug === value);

  const placeMenu = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 10;
    const width = Math.min(Math.max(r.width, 196), window.innerWidth - pad * 2);
    const spaceBelow = window.innerHeight - r.bottom - pad;
    const spaceAbove = r.top - pad;
    const openUp = spaceBelow < 168 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(280, Math.max(140, openUp ? spaceAbove : spaceBelow));
    const left = Math.min(Math.max(pad, r.left), window.innerWidth - width - pad);
    setMenuPos({
      top: openUp ? Math.max(pad, r.top - maxHeight - 4) : r.bottom + 4,
      left,
      width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    placeMenu();
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", placeMenu);
    document.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", placeMenu);
      document.removeEventListener("scroll", placeMenu, true);
    };
  }, [open, placeMenu]);

  if (options.length === 0 && value === "all") return null;

  const menu =
    open &&
    menuPos &&
    createPortal(
      <ul
        ref={menuRef}
        role="listbox"
        className="fixed z-[220] overflow-y-auto overscroll-contain rounded-md py-1"
        style={{
          top: menuPos.top,
          left: menuPos.left,
          width: menuPos.width,
          maxHeight: menuPos.maxHeight,
          background: "#071018",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
        }}
      >
        <li>
          <button
            type="button"
            role="option"
            aria-selected={!live}
            className="w-full px-3 py-1.5 text-left text-[11px]"
            style={{
              fontFamily: "var(--font-plex-mono)",
              color: !live ? accent : "#94a3b8",
              background: !live ? `${accent}14` : "transparent",
            }}
            onClick={() => {
              onChange("all");
              setOpen(false);
            }}
          >
            {anyLabel}
          </button>
        </li>
        {options.map((opt) => {
          const on = value === opt.slug;
          return (
            <li key={opt.slug}>
              <button
                type="button"
                role="option"
                aria-selected={on}
                className="w-full flex items-center justify-between gap-3 px-3 py-1.5 text-left text-[11px]"
                style={{
                  fontFamily: "var(--font-plex-mono)",
                  color: on ? accent : FILTER_INK.body,
                  background: on ? `${accent}14` : "transparent",
                }}
                onClick={() => {
                  onChange(opt.slug);
                  setOpen(false);
                }}
              >
                <span className="truncate">{opt.label}</span>
                {!hideCounts ? (
                  <span className="tabular-nums" style={{ opacity: 0.55 }}>{opt.count}</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>,
      document.body,
    );

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <ChannelLabel kicker={label} live={live} onClear={() => onChange("all")} />
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) placeMenu();
        }}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] text-left"
        style={{
          fontFamily: "var(--font-plex-mono)",
          background: live ? `${accent}18` : "rgba(255,255,255,0.03)",
          color: live ? accent : "#94a3b8",
          border: live ? `1px solid ${accent}77` : "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <span className="truncate flex-1">{live ? (selected?.label ?? value) : anyLabel}</span>
        {!hideCounts ? (
          live && selected ? (
            <span className="tabular-nums" style={{ opacity: 0.7 }}>{selected.count}</span>
          ) : (
            <span className="tabular-nums" style={{ opacity: 0.45 }}>{options.length}</span>
          )
        ) : null}
        <span aria-hidden style={{ opacity: 0.5 }}>{open ? "▴" : "▾"}</span>
      </button>
      {menu}
    </div>
  );
}

// Winner is green, not amber: amber means selection and primary action, and a
// winner badge sitting next to an amber-selected folder read as the same thing.
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  winner: { bg: "rgba(52,211,153,0.14)", text: "#34d399", label: "Winner" },
  active: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", label: "Active" },
  paused: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", label: "Paused" },
  archived: { bg: "rgba(100,116,139,0.1)", text: "#64748b", label: "Archived" },
};

const STATUS_OPTIONS = ["active", "winner", "paused", "archived"] as const;

function num(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString("en-US");
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
    setError(null);
    const params = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (clientId) params.set("client_id", clientId);
    setLoading(true);
    return fetch(`/api/media-buyer?${params}`)
      .then(async (r) => {
        const body = await readJson<{ ads?: AdRow[]; error?: string }>(r);
        if (!r.ok) {
          throw new Error(body?.error ?? `Failed to load (${r.status})`);
        }
        if (!body) throw new Error("Failed to load ad performance");
        return body;
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

  const slice: AdSlice = useMemo(
    () => ({
      product: productFilter,
      tag: tagFilter,
      format: formatFilter,
      status: statusFilter,
      search,
    }),
    [productFilter, tagFilter, formatFilter, statusFilter, search],
  );

  const scopedAds = useMemo(() => ads.filter((a) => adPassesSlice(a, slice)), [ads, slice]);

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

  const filterCounts = useMemo(() => {
    const pool = ads.filter((a) => adPassesSlice(a, slice, "product"));
    return {
      all: pool.length,
      reverse: pool.filter((a) => a.library?.product === "reverse").length,
      dscr: pool.filter((a) => a.library?.product === "dscr").length,
    };
  }, [ads, slice]);

  const tagFilterOptions = useMemo(() => {
    const counts = new Map<string, { slug: string; label: string; count: number }>();
    for (const a of ads.filter((row) => adPassesSlice(row, slice, "tag"))) {
      for (const t of a.library?.tags ?? []) {
        const prev = counts.get(t.slug);
        counts.set(t.slug, { slug: t.slug, label: t.label, count: (prev?.count ?? 0) + 1 });
      }
    }
    if (tagFilter !== "all" && !counts.has(tagFilter)) {
      counts.set(tagFilter, { slug: tagFilter, label: tagFilter, count: 0 });
    }
    return [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [ads, slice, tagFilter]);

  const formatFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of ads.filter((row) => adPassesSlice(row, slice, "format"))) {
      const slug = a.library?.ad_format;
      if (!slug) continue;
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
    if (formatFilter !== "all" && !counts.has(formatFilter)) counts.set(formatFilter, 0);
    return [...counts.entries()]
      .map(([slug, count]) => ({
        slug,
        label: adFormatLabel(slug, formatLabels) || slug,
        count,
      }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  }, [ads, slice, formatLabels, formatFilter]);

  const statusFilterOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const a of ads.filter((row) => adPassesSlice(row, slice, "status"))) {
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
  }, [ads, slice, statusFilter]);

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
        if (ad.library?.id) {
          params.set("library_id", ad.library.id);
        } else {
          params.set("ad", ad.variant_names[0] ?? ad.ad_name);
          // Newline-separated so commas inside Facebook names stay intact.
          params.set("variants", (ad.variant_names.length ? ad.variant_names : [ad.ad_name]).join("\n"));
        }
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

  // Keep the prior board on screen while a range change loads.
  if (loading && ads.length === 0) {
    return <p style={{ color: "#475569" }} className="text-sm py-10 text-center">Loading ad performance…</p>;
  }
  if (error && ads.length === 0) {
    return <p style={{ color: "#f87171" }} className="text-sm py-10 text-center">{error}</p>;
  }
  if (!loading && ads.length === 0) {
    return (
      <p style={{ color: "#475569" }} className="text-sm py-10 text-center">
        No ad data for this range. Make sure Meta ad insights are ingested and leads carry an ad name / utm_content.
      </p>
    );
  }

  const sliceActive =
    productFilter !== "all" ||
    tagFilter !== "all" ||
    formatFilter !== "all" ||
    statusFilter !== "all" ||
    !!search.trim();

  const totals = rollupAds(filteredAds);
  const colCount = showPlatform ? 20 : 14;
  const rankPresets = [
    { label: "CPCONV", key: "cp_conversation" as const, nextAsc: true },
    { label: "CPQL", key: "cost_per_qualified" as const, nextAsc: true },
    { label: "CPL", key: "cpl" as const, nextAsc: true },
    { label: "CPF", key: "cp_funded" as const, nextAsc: true },
    { label: "Hand-raise", key: "hand_raise_rate" as const, nextAsc: false },
  ];

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl overflow-visible"
        style={{
          background: "linear-gradient(180deg, #0c182c 0%, #08111e 100%)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          className="flex items-center justify-between gap-3 px-4 py-2"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(245,158,11,0.04)",
          }}
        >
          <p
            className="text-[9px] uppercase tracking-[0.22em]"
            style={{ color: FILTER_INK.live, fontFamily: "var(--font-archivo), sans-serif", fontWeight: 600 }}
          >
            Slice
          </p>
          <p className="text-[11px] tabular-nums" style={{ color: "#94a3b8", fontFamily: "var(--font-plex-mono)" }}>
            {filteredAds.length} showing
            {minSpendOn ? ` · $${MIN_SPEND}+ floor` : ""}
            {minSpendOn && scopedAds.length !== filteredAds.length ? ` · ${scopedAds.length} before floor` : ""}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-x-3 gap-y-3 px-4 py-3">
          <ProductFilterBar value={productFilter} onChange={setProductFilter} counts={filterCounts} />
          <FilterSelect
            label="Topic"
            value={tagFilter}
            onChange={setTagFilter}
            options={tagFilterOptions}
            anyLabel="Any topic"
            accent="#6ee7b7"
          />
          <FilterSelect
            label="Format"
            value={formatFilter}
            onChange={setFormatFilter}
            options={formatFilterOptions}
            anyLabel="Any format"
            accent="#60a5fa"
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusFilterOptions}
            anyLabel="Any status"
            accent="#fbbf24"
          />
          <div className="col-span-2 lg:col-span-1 min-w-0">
            <AdSearchInput value={search} onChange={setSearch} placeholder="Name, alias, topic…" />
          </div>
        </div>

        <div
          className="grid grid-cols-2 lg:grid-cols-5 gap-x-3 gap-y-3 px-4 py-3"
          style={{ borderTop: "1px solid rgba(255,255,255,0.06)", background: "rgba(0,0,0,0.18)" }}
        >
          <FilterSelect
            label="Rank by"
            value={rankPresets.some((p) => sortKey === p.key && asc === p.nextAsc) ? sortKey : "all"}
            onChange={(slug) => {
              const preset = rankPresets.find((p) => p.key === slug);
              if (!preset) {
                setSortKey("spend");
                setAsc(false);
                return;
              }
              applyPreset(preset.key, preset.nextAsc);
            }}
            options={rankPresets.map((p) => ({ slug: p.key, label: p.label, count: 0 }))}
            anyLabel="Spend (default)"
            accent="#fbbf24"
            hideCounts
          />
          <div className="min-w-0">
            <ChannelLabel kicker="Floor" live={minSpendOn} />
            <button
              type="button"
              aria-pressed={minSpendOn}
              onClick={() => setMinSpendOn((v) => !v)}
              className="w-full px-2.5 py-1.5 rounded-md text-[11px] text-left"
              style={{
                fontFamily: "var(--font-plex-mono)",
                background: minSpendOn ? "rgba(52,211,153,0.14)" : "rgba(255,255,255,0.03)",
                color: minSpendOn ? "#6ee7b7" : "#94a3b8",
                border: minSpendOn ? "1px solid rgba(52,211,153,0.45)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {minSpendOn ? `$${MIN_SPEND}+ on` : `$${MIN_SPEND}+ off`}
            </button>
          </div>
          <div className="min-w-0">
            <ChannelLabel kicker="Columns" live={showPlatform} />
            <button
              type="button"
              aria-pressed={showPlatform}
              onClick={() => setShowPlatform((v) => !v)}
              className="w-full px-2.5 py-1.5 rounded-md text-[11px] text-left"
              style={{
                fontFamily: "var(--font-plex-mono)",
                background: showPlatform ? "rgba(96,165,250,0.16)" : "rgba(255,255,255,0.03)",
                color: showPlatform ? "#93c5fd" : "#94a3b8",
                border: showPlatform ? "1px solid rgba(96,165,250,0.45)" : "1px solid rgba(255,255,255,0.08)",
              }}
            >
              {showPlatform ? "CPC · CPM on" : "CPC · CPM off"}
            </button>
          </div>
          {sliceActive ? (
            <div className="col-span-2 lg:col-span-2 flex items-end justify-end">
              <button
                type="button"
                onClick={() => {
                  setProductFilter("all");
                  setTagFilter("all");
                  setFormatFilter("all");
                  setStatusFilter("all");
                  setSearch("");
                }}
                className="px-2.5 py-1.5 rounded-md text-[10px] uppercase tracking-wider"
                style={{
                  fontFamily: "var(--font-archivo), sans-serif",
                  color: FILTER_INK.live,
                  border: "1px solid rgba(245,158,11,0.35)",
                  background: "rgba(245,158,11,0.08)",
                }}
              >
                Clear slice
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {(conceptStrip.tags.length > 0 || conceptStrip.formats.length > 0) ? (
        <div className="rounded-xl px-4 py-3 space-y-2" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569", fontFamily: "var(--font-plex-mono)" }}>
            Concepts by blended CPCONV
          </p>
          {conceptStrip.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[9px] uppercase tracking-[0.18em] mr-1" style={{ color: FILTER_INK.rail, fontFamily: "var(--font-archivo), sans-serif" }}>Topic</span>
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
                  {c.label} · {money2(c.cpconv)}
                </button>
              ))}
            </div>
          ) : null}
          {conceptStrip.formats.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[9px] uppercase tracking-[0.18em] mr-1" style={{ color: FILTER_INK.rail, fontFamily: "var(--font-archivo), sans-serif" }}>Format</span>
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
                  {c.label} · {money2(c.cpconv)}
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
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money(lane.stats.spend)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>Leads</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{num(lane.stats.leads)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CTR</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{pct(lane.stats.ctr, 2)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CPC</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money2(lane.stats.cpc)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CPM</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money2(lane.stats.cpm)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider" style={{ color: "#475569" }}>CPCONV</p>
                  <p className="text-lg font-bold mt-0.5 tabular-nums" style={{ color: "#e2e8f0" }}>{money2(lane.stats.cp_conversation)}</p>
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
          { label: "Total Spend", value: money(totals.spend) },
          { label: "Impr", value: num(totals.impressions) },
          { label: "Clicks", value: num(totals.clicks) },
          { label: "CTR", value: pct(totals.ctr, 2) },
          { label: "CPC", value: money2(totals.cpc) },
          { label: "CPM", value: money2(totals.cpm) },
          { label: "Leads", value: num(totals.leads) },
          { label: "Qual %", value: pct(totals.qualified_rate) },
          { label: "CPL", value: money2(totals.cpl) },
          { label: "CPQL", value: money2(totals.cost_per_qualified) },
          { label: "CPCONV", value: money2(totals.cp_conversation) },
          { label: "Proposals", value: num(totals.unique_proposals) },
          { label: "Submissions", value: num(totals.unique_submissions) },
          { label: "Funded", value: num(totals.unique_funded) },
          { label: "CPF", value: money2(totals.cp_funded) },
          { label: "Hand-raise", value: pct(totals.hand_raise_rate) },
        ].map((s) => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ws-text-faint)" }}>{s.label}</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div
            className="rounded-xl w-full max-w-md p-5 space-y-3"
            style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>Link to existing creative</h3>
              <ModalCloseButton onClose={() => setLinkTarget(null)} disabled={linkSaving} />
            </div>
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              Link <span style={{ color: "#e2e8f0" }}>{linkTarget}</span> to a library entry. Metrics will roll up with other variants.
            </p>
            <AdSearchInput value={linkSearch} onChange={setLinkSearch} placeholder="Search library ads…" />
            <select
              value={linkLibraryId}
              onChange={(e) => setLinkLibraryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
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
          <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{pct(ad.ctr, 2)}</td>
          <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money2(ad.cpc)}</td>
          <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money2(ad.cpm)}</td>
        </>
      ) : null}
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.leads)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#a78bfa" }}>{pct(ad.qualified_rate)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money2(ad.cpl)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money2(ad.cost_per_qualified)}</td>
      <td className="px-3 py-3 text-right font-semibold" style={{ color: "#fbbf24" }}>{money2(ad.cp_conversation)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{pct(ad.hand_raise_rate)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{pct(ad.conversation_rate)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.unique_proposals ?? 0)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.unique_submissions ?? 0)}</td>
      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{num(ad.unique_funded ?? 0)}</td>
      <td className="px-3 py-3 text-right font-semibold" style={{ color: "#34d399" }}>{money2(ad.cp_funded)}</td>
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
  ready_to_test: false,
};

type LibraryMetrics = {
  cpl: number | null;
  ctr: number | null;
  cpc: number | null;
};

/** Topic tags shown on a card before collapsing the rest into a +N chip. */
const CARD_TAG_BUDGET = 2;

/**
 * Card-scale sibling of `Stat` — same Kicker and data font, but sized for three
 * across inside a card rather than a dashboard header.
 */
function MetricChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-2.5 py-1.5 min-w-0 flex-1"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid var(--color-ws-hairline-soft)",
      }}
    >
      <Kicker>{label}</Kicker>
      <p
        className="text-xs mt-0.5 truncate adlib-data"
        style={{ color: "var(--color-ws-text)" }}
      >
        {value}
      </p>
    </div>
  );
}

function AdLibrary({
  startDate,
  endDate,
  clientId,
  libraryNav,
  onNavClear,
  onReadyCountChange,
}: Props & {
  libraryNav: LibraryNav;
  onNavClear: () => void;
  onReadyCountChange?: (count: number) => void;
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
  const [tagFilter, setTagFilter] = useState("all");
  const [search, setSearch] = useState("");
  const { formats, labels: formatLabels, createFormat, loading: formatsLoading } = useAdFormats();
  const { tags: tagCatalog, createTag, loading: tagsLoading } = useAdTags();

  const { searchParams, setParams } = useTabParams();
  const folderParam = searchParams.get(FOLDER_PARAM);
  const sort = parseLibrarySort(searchParams.get(SORT_PARAM)) ?? DEFAULT_LIBRARY_SORT;

  const setSort = useCallback(
    (next: string) => {
      setParams({ [SORT_PARAM]: next === DEFAULT_LIBRARY_SORT ? null : next });
    },
    [setParams],
  );

  // URL is the source of truth so folders are linkable and the back button
  // steps through them; localStorage only seeds the first visit.
  const folderPath = useMemo<FolderPath>(
    () => parseFolderPathKey(folderParam) ?? defaultFolderPath(),
    [folderParam],
  );

  const selectFolder = useCallback(
    (next: FolderPath) => {
      storeFolderPath(next);
      // A highlight belongs to the folder it was deep-linked into.
      setHighlightId(null);
      setParams({ [FOLDER_PARAM]: folderPathKey(next) }, "push");
    },
    [setParams],
  );

  const seededFromStorage = useRef(false);
  useEffect(() => {
    if (seededFromStorage.current) return;
    seededFromStorage.current = true;
    if (folderParam) return;
    const stored = loadStoredFolderPath();
    if (folderPathKey(stored) !== folderPathKey(defaultFolderPath())) {
      setParams({ [FOLDER_PARAM]: folderPathKey(stored) });
    }
  }, [folderParam, setParams]);

  const openCreateForm = useCallback(() => {
    setFormError(null);
    const prefill = formPrefillFromFolder(folderPath);
    setForm({
      ...EMPTY_FORM,
      product: prefill.product,
      ad_format: prefill.ad_format,
      ready_to_test: folderPath.kind === "smart" && folderPath.id === "ready",
    });
  }, [folderPath]);

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
      ready_to_test: !!e.ready_to_test,
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    const perfParams = new URLSearchParams({ start_date: startDate, end_date: endDate });
    if (clientId) perfParams.set("client_id", clientId);

    // Library rows are required; spend metrics are optional. Coupling them meant a
    // timed-out /api/media-buyer (empty body) wiped the whole Ad Library tab.
    fetch("/api/ad-library")
      .then(async (r) => {
        const body = await readJson<LibEntry[] | { error?: string }>(r);
        if (!r.ok) {
          const err = body && typeof body === "object" && "error" in body ? body.error : null;
          throw new Error(err ?? `Failed to load library (${r.status})`);
        }
        if (!Array.isArray(body)) throw new Error("Failed to load library");
        return body;
      })
      .then((libraryData) => {
        const nextEntries = libraryData.map((e) => ({
          ...e,
          aliases: e.aliases ?? [],
          tags: e.tags ?? [],
          ready_to_test: !!e.ready_to_test,
        }));
        setEntries(nextEntries);
        onReadyCountChange?.(nextEntries.filter((e) => e.ready_to_test).length);
        setLoading(false);

        return fetch(`/api/media-buyer?${perfParams}`)
          .then(async (r) => {
            const body = await readJson<{ ads?: AdRow[]; error?: string }>(r);
            if (!r.ok || !body) return;
            const next = new Map<string, LibraryMetrics>();
            for (const ad of body.ads ?? []) {
              const libId = ad.library?.id;
              if (!libId) continue;
              next.set(libId, { cpl: ad.cpl, ctr: ad.ctr, cpc: ad.cpc });
            }
            setMetricsById(next);
          })
          .catch(() => {
            /* metrics are best-effort — cards show "No spend in range" */
          });
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [startDate, endDate, clientId, onReadyCountChange]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!libraryNav) return;
    if (libraryNav.readyToTest) {
      selectFolder({ kind: "smart", id: "ready" });
      onNavClear();
      return;
    }
    if (libraryNav.prefillAdName && libraryNav.openForm) {
      setFormError(null);
      setForm({ ...EMPTY_FORM, ad_name: libraryNav.prefillAdName });
      onNavClear();
      return;
    }
    if (libraryNav.libraryId) {
      const entry = entries.find((e) => e.id === libraryNav.libraryId);
      // Select before highlighting: selectFolder clears the ring.
      if (entry) selectFolder(folderPathForEntry(entry));
      setHighlightId(libraryNav.libraryId);
      requestAnimationFrame(() => {
        document.getElementById(`library-card-${libraryNav.libraryId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      if (libraryNav.openForm && entry) openEditForm(entry);
      onNavClear();
    }
  }, [libraryNav, entries, onNavClear, openEditForm, selectFolder]);

  // The deep link from Ad Performance flashes a ring to say "this one". Left
  // set it reads as a permanent selection for the rest of the session, so it
  // retires once the smooth scroll has landed.
  useEffect(() => {
    if (!highlightId) return;
    const t = setTimeout(() => setHighlightId(null), HIGHLIGHT_LINGER_MS);
    return () => clearTimeout(t);
  }, [highlightId]);

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
      ready_to_test: !!form.ready_to_test,
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

  async function clearReadyToTest(id: string) {
    const res = await fetch(`/api/ad-library/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ready_to_test: false }),
    });
    if (!res.ok) {
      alert((await res.json()).error ?? "Failed to clear Ready to test");
      return;
    }
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

  const folderCounts = useMemo(
    () => buildFolderTreeCounts(entries, formats.map((f) => f.slug)),
    [entries, formats],
  );

  const folderEntries = useMemo(
    () => entries.filter((e) => entryMatchesFolder(e, folderPath)),
    [entries, folderPath],
  );

  const passesFilters = useCallback(
    (e: LibEntry) =>
      (tagFilter === "all" || (e.tags ?? []).some((t) => t.slug === tagFilter)) &&
      matchesAdQuery(adSearchHaystack(e), search),
    [tagFilter, search],
  );

  const visibleEntries = useMemo(() => {
    const filtered = folderEntries.filter(passesFilters);
    // The test queue is a worklist, so newest-first wins over the chosen sort.
    const effective: LibrarySort =
      folderPath.kind === "smart" && folderPath.id === "ready" ? "created" : sort;
    return filtered.sort(
      libraryAdComparator(effective, (e: LibEntry) => metricsById.get(e.id)?.cpl),
    );
  }, [folderEntries, passesFilters, folderPath, sort, metricsById]);

  // Only computed when the folder came up empty: counts the same filters across
  // the rest of the library so the escape hatch can never lead to another
  // empty state.
  const elsewhereCount = useMemo(() => {
    if (visibleEntries.length > 0 || !search.trim()) return 0;
    return countMatchesOutsideFolder(entries, folderPath, passesFilters);
  }, [visibleEntries.length, search, entries, folderPath, passesFilters]);

  const sectionedEntries = useMemo(() => {
    if (!shouldSectionByFormat(folderPath)) return null;
    return groupEntriesByFormat(visibleEntries, formatLabels);
  }, [folderPath, visibleEntries, formatLabels]);

  const sortOptions = useMemo(
    () =>
      LIBRARY_SORT_OPTIONS.filter((o) => o.slug !== DEFAULT_LIBRARY_SORT).map((o) => ({
        slug: o.slug,
        label: o.label,
        count: 0,
      })),
    [],
  );

  const tagFilterOptions = useMemo(() => {
    const counts = new Map<string, { slug: string; label: string; count: number }>();
    for (const e of folderEntries) {
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
  }, [folderEntries, tagFilter, tagCatalog]);

  if (loading) return <Empty>Loading library…</Empty>;
  if (error) {
    return (
      <p style={{ color: "var(--color-ws-negative)" }} className="text-sm py-10 text-center">
        {error}
      </p>
    );
  }

  function renderCard(e: LibEntry, index: number) {
    const thumb = driveThumb(e);
    const allNames = [e.ad_name, ...(e.aliases ?? []).map((a) => a.alias_name)];
    const isHighlighted = highlightId === e.id;
    const metrics = metricsById.get(e.id);
    const hasMetrics = !!metrics && (metrics.cpl != null || metrics.ctr != null || metrics.cpc != null);

    // The rail, breadcrumb, and format section headers already name the folder
    // you're standing in, so a card badge repeating it is pure duplication.
    // Active is likewise the default for nearly every entry.
    const formatImplied =
      shouldSectionByFormat(folderPath) ||
      (folderPath.kind === "product" && folderPath.format !== undefined);
    const inWinners = folderPath.kind === "smart" && folderPath.id === "winners";
    const badgeFormat = formatImplied ? null : e.ad_format;
    const badgeProduct = folderPath.kind === "product" ? null : e.product;
    const badgeKb =
      e.knowledge_capture_status && e.knowledge_capture_status !== "none"
        ? e.knowledge_capture_status
        : null;
    const showReadyBadge =
      !!e.ready_to_test && !(folderPath.kind === "smart" && folderPath.id === "ready");
    const showStatusBadge = e.status !== "active" && !(inWinners && e.status === "winner");

    const tags = e.tags ?? [];
    const shownTags = tags.slice(0, CARD_TAG_BUDGET);
    const hiddenTags = tags.slice(CARD_TAG_BUDGET);
    const showBadgeRow = !!badgeFormat || !!badgeProduct || tags.length > 0 || !!badgeKb;

    const overflowActions = [
      ...(e.ready_to_test
        ? [
            {
              id: "clear-ready",
              label: "Clear ready to test",
              onClick: () => clearReadyToTest(e.id),
              tone: "muted" as const,
            },
          ]
        : []),
      ...(e.drive_url
        ? [
            {
              id: "creative",
              label: "Open creative",
              onClick: () => undefined,
              href: e.drive_url,
              tone: "default" as const,
            },
          ]
        : []),
      ...(e.knowledge_capture_status !== "processed"
        ? [
            {
              id: "queue-kb",
              label: "Queue for OS KB",
              onClick: () => queueForKb(e),
              tone: "accent" as const,
            },
          ]
        : []),
      {
        id: "delete",
        label: "Delete",
        onClick: () => remove(e.id),
        tone: "danger" as const,
      },
    ];

    return (
      <div
        key={e.id}
        id={`library-card-${e.id}`}
        className="rounded-xl overflow-hidden flex flex-col transition-shadow ad-library-card-enter"
        style={{
          background: "var(--color-ws-panel)",
          border: isHighlighted
            ? "1px solid color-mix(in srgb, var(--color-ws-accent) 50%, transparent)"
            : "1px solid var(--color-ws-hairline)",
          boxShadow: isHighlighted
            ? "0 0 0 2px color-mix(in srgb, var(--color-ws-accent) 25%, transparent)"
            : undefined,
          animationDelay: `${Math.min(index, 12) * 40}ms`,
        }}
      >
        <div className="p-4 flex gap-3 flex-1">
          {/* Rendered even without art so titles share one left edge across the grid. */}
          <button
            type="button"
            onClick={() => openEditForm(e)}
            aria-label={`Open ${e.ad_name}`}
            className="shrink-0 w-16 h-16 rounded-lg overflow-hidden"
            style={{
              background: "var(--color-ws-chrome)",
              border: "1px solid var(--color-ws-hairline)",
            }}
          >
            {thumb ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={thumb} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            ) : null}
          </button>
          <div className="min-w-0 flex-1 flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => openEditForm(e)} className="text-left min-w-0">
                <p
                  className="font-semibold text-sm leading-snug line-clamp-2 break-words"
                  style={{ color: "var(--color-ws-text)" }}
                  title={e.ad_name}
                >
                  {e.ad_name}
                </p>
              </button>
              {showReadyBadge || showStatusBadge ? (
                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0">
                  {showReadyBadge ? (
                    <span
                      className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: "rgba(167,139,250,0.16)", color: "#c4b5fd" }}
                    >
                      Ready to test
                    </span>
                  ) : null}
                  {/* Violet is reserved for ready-to-test; status carries its own tone. */}
                  {showStatusBadge ? <StatusBadge status={e.status} /> : null}
                </div>
              ) : null}
            </div>
            {allNames.length > 1 ? (
              <div className="mt-1.5">
                <button
                  type="button"
                  className="text-xs underline"
                  style={{ color: "var(--color-ws-text-muted)" }}
                  onClick={() => setExpandedVariants(expandedVariants === e.id ? null : e.id)}
                >
                  {allNames.length} linked names {expandedVariants === e.id ? "▲" : "▼"}
                </button>
                {expandedVariants === e.id ? (
                  <ul className="mt-1 space-y-0.5">
                    {allNames.map((name) => (
                      <li
                        key={name}
                        className="text-xs truncate"
                        style={{ color: "var(--color-ws-text-dim)" }}
                      >
                        {name}
                        {name === e.ad_name ? " (primary)" : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {/* Format, product, and topic are all classification, so they share
                one neutral chip — colour here only competed with selection. */}
            {showBadgeRow ? (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {badgeFormat ? <Chip>{adFormatLabel(badgeFormat, formatLabels)}</Chip> : null}
                {badgeProduct ? (
                  <Chip>{PRODUCT_LABELS[badgeProduct] ?? badgeProduct}</Chip>
                ) : null}
                {shownTags.map((t) => (
                  <button
                    key={t.slug}
                    type="button"
                    onClick={() => setTagFilter(t.slug)}
                    title={`Filter by ${t.label}`}
                  >
                    <Chip>{t.label}</Chip>
                  </button>
                ))}
                {hiddenTags.length > 0 ? (
                  <span title={hiddenTags.map((t) => t.label).join(", ")}>
                    <Chip>+{hiddenTags.length}</Chip>
                  </span>
                ) : null}
                {badgeKb ? <Chip>KB {badgeKb.replace("_", " ")}</Chip> : null}
              </div>
            ) : null}
            {/* Pinned to the bottom of the content area so numbers line up across a row. */}
            {hasMetrics ? (
              <div className="flex gap-2 mt-auto pt-3">
                <MetricChip label="CPL" value={money2(metrics?.cpl)} />
                <MetricChip label="CTR" value={pct(metrics?.ctr, 2)} />
                <MetricChip label="CPC" value={money2(metrics?.cpc)} />
              </div>
            ) : (
              <p className="text-xs mt-auto pt-3" style={{ color: "var(--color-ws-text-muted)" }}>
                No spend in range
              </p>
            )}
          </div>
        </div>
        <div
          className="flex items-center gap-3 px-4 py-2.5"
          style={{
            borderTop: "1px solid var(--color-ws-hairline)",
            background: "rgba(0,0,0,0.15)",
          }}
        >
          <button
            type="button"
            onClick={() => openEditForm(e)}
            className="text-xs font-medium"
            style={{ color: "var(--color-ws-text-muted)" }}
          >
            Edit
          </button>
          <div className="ml-auto">
            <CardActionsMenu actions={overflowActions} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 adlib">
      <style>{`
        @keyframes adLibCardIn {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .ad-library-card-enter {
          animation: adLibCardIn 0.28s ease-out both;
        }
      `}</style>

      <div className="lg:flex lg:items-start lg:gap-4">
        <FolderRail
          path={folderPath}
          onSelect={(next) => {
            selectFolder(next);
            setTagFilter("all");
          }}
          counts={folderCounts}
          formatLabels={formatLabels}
        />

        <div className="min-w-0 flex-1 space-y-3">
          {/* items-stretch so Add Ad matches the toolbar's height instead of
              floating at the top of a two-row panel. */}
          <div className="flex flex-wrap items-stretch justify-between gap-3">
            <div
              className="flex flex-wrap items-end gap-x-5 gap-y-3 min-w-0 flex-1 rounded-xl px-4 py-3"
              style={{
                background:
                  "linear-gradient(180deg, var(--color-ws-panel) 0%, var(--color-ws-base) 100%)",
                border: "1px solid var(--color-ws-hairline)",
              }}
            >
              <div className="w-full">
                <LibraryBreadcrumb
                  path={folderPath}
                  onSelect={(next) => {
                    selectFolder(next);
                    setTagFilter("all");
                  }}
                  formatLabels={formatLabels}
                  count={visibleEntries.length}
                />
              </div>
              <FilterSelect
                label="Topic"
                value={tagFilter}
                onChange={setTagFilter}
                options={tagFilterOptions}
                anyLabel="Any topic"
                // Topic is classification, so it takes the same neutral as the
                // card chips rather than a colour that competes with selection.
                accent="#cbd5e1"
              />
              <FilterSelect
                label="Sort"
                // FilterSelect's "all" is its neutral value; here that is the
                // default order, so its clear affordance restores Name A–Z.
                value={sort === DEFAULT_LIBRARY_SORT ? "all" : sort}
                onChange={(slug) => setSort(slug === "all" ? DEFAULT_LIBRARY_SORT : slug)}
                options={sortOptions}
                anyLabel={
                  LIBRARY_SORT_OPTIONS.find((o) => o.slug === DEFAULT_LIBRARY_SORT)?.label ?? "Name"
                }
                accent="#cbd5e1"
                hideCounts
              />
              <div className="flex-1 min-w-[14rem]">
                <AdSearchInput value={search} onChange={setSearch} placeholder="Name, alias, or topic…" />
              </div>
            </div>
            <button
              onClick={openCreateForm}
              className="px-4 rounded-lg text-sm font-semibold self-stretch"
              style={{ background: "var(--color-ws-accent)", color: "var(--color-ws-panel)" }}
            >
              + Add Ad
            </button>
          </div>

          {entries.length === 0 ? (
            <Empty>
              No ads in the library yet. Add one with its ad name and a Google Drive link.
            </Empty>
          ) : visibleEntries.length === 0 ? (
            <div className="text-center py-10 space-y-3">
              <p style={{ color: "var(--color-ws-text-dim)" }} className="text-sm">
                {search.trim()
                  ? `No ads match “${search.trim()}” in this folder.`
                  : folderPath.kind === "smart" && folderPath.id === "ready"
                    ? "Nothing in the test queue. Flag a creative only when the buyer should launch it — not when backfilling the library."
                    : "No ads in this folder. Adjust topic, or add an ad here."}
              </p>
              {elsewhereCount > 0 ? (
                <button
                  type="button"
                  onClick={() => selectFolder({ kind: "smart", id: "all" })}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    background: "var(--color-ws-accent-wash)",
                    color: "var(--color-ws-accent-bright)",
                  }}
                >
                  {elsewhereCount} {elsewhereCount === 1 ? "match" : "matches"} in other folders —
                  search everywhere
                </button>
              ) : !search.trim() && !(folderPath.kind === "smart" && folderPath.id === "ready") ? (
                <button
                  type="button"
                  onClick={openCreateForm}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{
                    background: "var(--color-ws-accent-wash)",
                    color: "var(--color-ws-accent-bright)",
                  }}
                >
                  Add ad in this folder
                </button>
              ) : null}
            </div>
          ) : sectionedEntries ? (
            <div className="space-y-6">
              {sectionedEntries.map((section) => (
                <section key={section.key} className="space-y-2">
                  <div
                    className="sticky top-0 z-[1] flex items-center gap-2 px-1 py-1.5 backdrop-blur-sm"
                    style={{
                      background:
                        "color-mix(in srgb, var(--color-ws-chrome) 85%, transparent)",
                    }}
                  >
                    <h3
                      className="text-xs font-semibold uppercase tracking-[0.14em]"
                      style={{ color: "var(--color-ws-text-muted)" }}
                    >
                      {section.label}
                    </h3>
                    <span
                      className="text-[10px] adlib-data"
                      style={{ color: "var(--color-ws-text-muted)" }}
                    >
                      {section.entries.length}
                    </span>
                    {folderPath.kind === "product" ? (
                      <button
                        type="button"
                        className="text-[10px] underline ml-1"
                        style={{ color: "var(--color-ws-text-muted)" }}
                        onClick={() =>
                          selectFolder({
                            kind: "product",
                            product: folderPath.product,
                            format: section.key,
                          })
                        }
                      >
                        Open folder
                      </button>
                    ) : null}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                    {section.entries.map((e, i) => renderCard(e, i))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleEntries.map((e, i) => renderCard(e, i))}
            </div>
          )}
        </div>
      </div>

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div
            className="rounded-xl w-full max-w-2xl p-5 space-y-4 max-h-[90vh] overflow-y-auto"
            style={{
              background: "var(--color-ws-panel)",
              border: "1px solid var(--color-ws-hairline)",
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold" style={{ color: "var(--color-ws-text)" }}>
                  {form.id ? form.ad_name || "Ad details" : "Add Ad"}
                </h3>
                {form.id ? (
                  <p className="text-xs mt-1" style={{ color: "var(--color-ws-text-dim)" }}>
                    Script, visual notes, and classification — full overview lives here.
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {form.id && form.drive_url ? (
                  <a
                    href={form.drive_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                    style={{
                      background: "var(--color-ws-accent-wash)",
                      color: "var(--color-ws-accent-bright)",
                    }}
                  >
                    Open creative
                  </a>
                ) : null}
                <ModalCloseButton onClose={() => setForm(null)} />
              </div>
            </div>
            {form.id ? (
              <div className="flex gap-2">
                {(["CPL", "CTR", "CPC"] as const).map((label) => {
                  const m = metricsById.get(form.id);
                  const value =
                    label === "CPL"
                      ? money2(m?.cpl)
                      : label === "CTR"
                        ? pct(m?.ctr, 2)
                        : money2(m?.cpc);
                  return <MetricChip key={label} label={label} value={value} />;
                })}
              </div>
            ) : null}
            <Field label="Ad name (primary — canonical name for this creative)">
              <input
                value={form.ad_name}
                onChange={(e) => setForm({ ...form, ad_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
                placeholder="e.g. Spring Promo — UGC v3"
              />
            </Field>
            {form.id ? (
              <Field label="Linked ad names (Facebook variants)">
                <div className="space-y-2">
                  <p className="text-[10px]" style={{ color: "var(--color-ws-text-dim)" }}>
                    Primary:{" "}
                    <span style={{ color: "var(--color-ws-text-muted)" }}>{form.ad_name}</span>
                  </p>
                  {editAliases.length === 0 ? (
                    <p className="text-xs" style={{ color: "var(--color-ws-text-faint)" }}>
                      No variant aliases yet.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {editAliases.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-2 text-xs"
                          style={{ color: "var(--color-ws-text-muted)" }}
                        >
                          <span className="truncate">{a.alias_name}</span>
                          <button
                            type="button"
                            onClick={() => removeAlias(a.id)}
                            className="shrink-0"
                            style={{ color: "var(--color-ws-negative)" }}
                          >
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
                      style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
                      placeholder="Facebook ad name variant…"
                    />
                    <button
                      type="button"
                      onClick={addAlias}
                      disabled={!newAlias.trim()}
                      className="px-3 py-2 rounded-lg text-sm font-semibold shrink-0"
                      style={{
                        background: "var(--color-ws-input)",
                        color: "var(--color-ws-text)",
                        opacity: newAlias.trim() ? 1 : 0.5,
                      }}
                    >
                      Add
                    </button>
                  </div>
                  {aliasError ? (
                    <p className="text-xs" style={{ color: "var(--color-ws-negative)" }}>
                      {aliasError}
                    </p>
                  ) : null}
                </div>
              </Field>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Status">
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
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
                  style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
                >
                  {PRODUCT_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <label
              className="flex items-start gap-3 rounded-lg px-3 py-2.5 cursor-pointer"
              style={{ background: "rgba(167,139,250,0.06)", border: "1px solid rgba(167,139,250,0.22)" }}
            >
              <input
                type="checkbox"
                checked={!!form.ready_to_test}
                onChange={(e) => setForm({ ...form, ready_to_test: e.target.checked })}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium" style={{ color: "var(--color-ws-text)" }}>
                  Ready to test
                </span>
                <span className="block text-xs mt-0.5" style={{ color: "var(--color-ws-text-muted)" }}>
                  Only for creatives the media buyer should launch/test now (e.g. across accounts).
                  Leave off when backfilling older ads into the library.
                </span>
              </span>
            </label>
            <div>
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ws-text-faint)" }}>Ad format</span>
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
              <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ws-text-faint)" }}>Topics</span>
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
                style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
                placeholder="https://…"
              />
            </Field>
            <Field label="Google Drive link">
              <input
                value={form.drive_url}
                onChange={(e) => setForm({ ...form, drive_url: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
                placeholder="https://drive.google.com/file/d/…"
              />
            </Field>
            <Field label="Ad overview — script / copy + visual aspects">
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={8}
                className="w-full px-3 py-2 rounded-lg text-sm font-mono leading-relaxed"
                style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
                placeholder="Full script, hook, offer, on-screen text, talent, pacing, colors, format details…"
              />
            </Field>
            <Field label="Comments & notes (for AI)">
              <textarea
                value={form.visual_notes}
                onChange={(e) => setForm({ ...form, visual_notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "var(--color-ws-chrome)", border: "1px solid var(--color-ws-hairline)", color: "var(--color-ws-text)" }}
                placeholder="Performance notes, what worked, what to test next, context for recreating this ad…"
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--color-ws-text-dim)" }}>
                AI will use both the script/copy above and these notes when generating new creatives.
              </p>
            </Field>
            {formError ? (
              <p className="text-xs" style={{ color: "var(--color-ws-negative)" }}>
                {formError}
              </p>
            ) : null}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setForm(null)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: "var(--color-ws-text-muted)" }}
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{
                  background: "var(--color-ws-accent)",
                  color: "var(--color-ws-panel)",
                  opacity: saving ? 0.6 : 1,
                }}
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
      <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--color-ws-text-faint)" }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

// ── Shell with sub-tabs ───────────────────────────────────────────────────────
type MediaBuyerTab = "command" | "performance" | "library";

const MEDIA_BUYER_TABS: readonly [MediaBuyerTab, string][] = [
  ["command", "Creative Command"],
  ["performance", "Ad Performance"],
  ["library", "Ad Library"],
];

function isMediaBuyerTab(v: string | null): v is MediaBuyerTab {
  return v === "command" || v === "performance" || v === "library";
}

export default function MediaBuyer({ startDate, endDate, clientId }: Props) {
  const { searchParams, setParams } = useTabParams();
  const tabParam = searchParams.get(TAB_PARAM);
  const tab: MediaBuyerTab = isMediaBuyerTab(tabParam) ? tabParam : "command";
  const [libraryNav, setLibraryNav] = useState<LibraryNav>(null);
  const [readyToTestCount, setReadyToTestCount] = useState(0);
  const [clientAds, setClientAds] = useState<{
    name: string;
    ads_paused: boolean;
    ads_paused_note: string | null;
  } | null>(null);
  // Mount each heavy tab once, then hide — switching back must not re-hit the API.
  const [mountedTabs, setMountedTabs] = useState<Record<MediaBuyerTab, boolean>>({
    command: true,
    performance: false,
    library: false,
  });

  useEffect(() => {
    setMountedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, [tab]);

  useEffect(() => {
    if (!clientId) {
      setClientAds(null);
      return;
    }
    let cancelled = false;
    // Use the shared client list (any auth user) — full client file GET is admin-only.
    fetch("/api/clients")
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then((d) => {
        if (cancelled || !d?.clients) return;
        const match = (d.clients as Array<{
          id: string;
          name?: string;
          ads_paused?: boolean;
          ads_paused_note?: string | null;
        }>).find(c => c.id === clientId);
        if (!match) {
          setClientAds(null);
          return;
        }
        setClientAds({
          name: match.name ?? "Client",
          ads_paused: !!match.ads_paused,
          ads_paused_note: match.ads_paused_note ?? null,
        });
      })
      .catch(() => {
        if (!cancelled) setClientAds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const setTab = useCallback(
    (next: MediaBuyerTab) => {
      // Leaving the library abandons its folder and sort selection.
      setParams(
        next === "library"
          ? { [TAB_PARAM]: next }
          : { [TAB_PARAM]: next, [FOLDER_PARAM]: null, [SORT_PARAM]: null },
        "push",
      );
    },
    [setParams],
  );

  const handleReadyCountChange = useCallback((count: number) => {
    setReadyToTestCount(count);
  }, []);

  // Count once per shell mount — not on every tab flip.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/ad-library")
      .then(async (r) => {
        if (!r.ok) return [] as LibEntry[];
        return r.json() as Promise<LibEntry[]>;
      })
      .then((data) => {
        if (!cancelled) setReadyToTestCount(data.filter((e) => e.ready_to_test).length);
      })
      .catch(() => {
        /* strip is best-effort */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAddToLibrary = useCallback(
    (adName: string) => {
      setLibraryNav({ prefillAdName: adName, openForm: true });
      setTab("library");
    },
    [setTab],
  );

  const handleViewInLibrary = useCallback(
    (libraryId: string) => {
      setLibraryNav({ libraryId });
      setTab("library");
    },
    [setTab],
  );

  return (
    <div className="space-y-5">
      {/* No banner here: the tab's count badge and the Ready to test smart
          folder already carry this, and a third copy read as an alert. */}
      {clientId && clientAds && (
        <div
          className="flex items-center justify-between gap-3 flex-wrap px-3 py-2 rounded-lg"
          style={{
            background: clientAds.ads_paused ? "rgba(245,158,11,0.08)" : "rgba(52,211,153,0.06)",
            border: `1px solid ${clientAds.ads_paused ? "rgba(245,158,11,0.25)" : "rgba(52,211,153,0.2)"}`,
          }}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: "#e2e8f0" }}>
              {clientAds.name}
            </p>
            <p className="text-[11px]" style={{ color: "#64748b" }}>
              Account-level ads status (separate from creative pause in the library)
            </p>
          </div>
          <AdsPausedControl
            clientId={clientId}
            adsPaused={clientAds.ads_paused}
            adsPausedNote={clientAds.ads_paused_note}
            onUpdated={next =>
              setClientAds(prev =>
                prev
                  ? {
                      ...prev,
                      ads_paused: !!next.ads_paused,
                      ads_paused_note: next.ads_paused_note ?? null,
                    }
                  : prev,
              )
            }
          />
        </div>
      )}
      <div className="flex gap-2">
        {MEDIA_BUYER_TABS.map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={
                active
                  ? {
                      background: "var(--color-ws-accent-wash)",
                      color: "var(--color-ws-accent)",
                    }
                  : {
                      background: "var(--color-ws-panel)",
                      color: "var(--color-ws-text-faint)",
                      border: "1px solid var(--color-ws-hairline)",
                    }
              }
            >
              {label}
              {key === "library" && readyToTestCount > 0 ? (
                <span
                  className="ml-2 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                  style={{ background: "rgba(167,139,250,0.2)", color: "#c4b5fd" }}
                >
                  {readyToTestCount}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {mountedTabs.command ? (
        <div style={{ display: tab === "command" ? undefined : "none" }} aria-hidden={tab !== "command"}>
          <CreativeCommand
            startDate={startDate}
            endDate={endDate}
            clientId={clientId}
            onAddToLibrary={handleAddToLibrary}
            onViewInLibrary={handleViewInLibrary}
          />
        </div>
      ) : null}
      {mountedTabs.performance ? (
        <div
          style={{ display: tab === "performance" ? undefined : "none" }}
          aria-hidden={tab !== "performance"}
        >
          <AdPerformance
            startDate={startDate}
            endDate={endDate}
            clientId={clientId}
            onAddToLibrary={handleAddToLibrary}
            onViewInLibrary={handleViewInLibrary}
          />
        </div>
      ) : null}
      {mountedTabs.library ? (
        <div style={{ display: tab === "library" ? undefined : "none" }} aria-hidden={tab !== "library"}>
          <AdLibrary
            startDate={startDate}
            endDate={endDate}
            clientId={clientId}
            libraryNav={libraryNav}
            onNavClear={() => setLibraryNav(null)}
            onReadyCountChange={handleReadyCountChange}
          />
        </div>
      ) : null}
    </div>
  );
}
