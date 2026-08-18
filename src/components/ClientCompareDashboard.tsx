"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  COMPARE_PRESET_LABELS,
  COMPARE_TABLE_COLUMNS,
  barsForChart,
  costChartsCaption,
  costMapPoints,
  countWithSpend,
  lineColorForIndex,
  mapMedians,
  medianForBars,
  nextSortState,
  parseIdList,
  parseOfferFilter,
  parseSortDir,
  parseTableSortKey,
  pivotCostHistory,
  rangeForComparePreset,
  rateMapPoints,
  rosterIdsForOffer,
  shouldDefaultToRateMap,
  showPendingCaveat,
  sortCompareRows,
  tableValueFor,
  visibleChartKeys,
  type ClientCompareRow,
  type CompareBar,
  type CompareClientCostSeries,
  type CompareCostMetric,
  type CompareDatePreset,
  type CompareKpiKey,
  type CompareMapPoint,
  type CompareOfferFilter,
  type CompareSortDir,
  type CompareTableColumnKey,
} from "@/lib/client-compare";
import type { HealthTier } from "@/lib/client-health";
import { getReportingTypeLabel, type ReportingType } from "@/lib/kpi-layouts";
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";
import { todayYmdInCallCenterTz } from "@/lib/time";
import MetricInfoTip from "@/components/kpi/MetricInfoTip";

const STALE_MS = 45_000;
const CACHE_PREFIX = "client-compare";

const TIER_FILL: Record<HealthTier, string> = {
  critical: "#f87171",
  below: "#fbbf24",
  at: "#34d399",
  above: "#60a5fa",
  insufficient: "#64748b",
};

const CARD = {
  background: "#0a1628",
  border: "1px solid rgba(255,255,255,0.06)",
};

const TOOLTIP_STYLE = {
  background: "#0f2040",
  border: "1px solid rgba(255,255,255,0.1)",
  borderRadius: 8,
  fontSize: 12,
};

const CHART_META: Record<
  CompareKpiKey,
  { title: string; format: "money" | "pct" | "int"; hint: string; formula: string }
> = {
  spend: {
    title: "Total Spend",
    format: "money",
    hint: "Meta ad spend in the selected window.",
    formula: "SUM(ad spend)",
  },
  cpl: {
    title: "CPL",
    format: "money",
    hint: "Cost per lead.",
    formula: "Ad Spend ÷ Total Leads",
  },
  cpql: {
    title: "CPQL",
    format: "money",
    hint: "Cost per qualified lead.",
    formula: "Ad Spend ÷ Qualified Leads",
  },
  cpconv: {
    title: "CPConv",
    format: "money",
    hint: "Cost per unique conversation (show ∪ claimed ∪ live transfer).",
    formula: "Ad Spend ÷ Unique Conversations",
  },
  hand_raise: {
    title: "Hand-raise",
    format: "pct",
    hint: "Paid ads: ÷ qualified. Call Center: ÷ total leads.",
    formula: "Unique booked ∪ claimed ∪ LT ÷ Qualified (or Total Leads for CC)",
  },
  show_rate: {
    title: "Show Rate",
    format: "pct",
    hint: "Unique booked leads who spoke to the LO.",
    formula: "Unique (booked ∩ show∪claimed∪LT) ÷ Unique booked",
  },
  leads: {
    title: "Leads",
    format: "int",
    hint: "New lead events in the window.",
    formula: "COUNT(lead)",
  },
  conversations: {
    title: "Unique Conversations",
    format: "int",
    hint: "Unique leads with show, claimed, or live transfer.",
    formula: "Unique leads with show ∪ claimed ∪ live_transfer",
  },
  booked: {
    title: "Booked",
    format: "int",
    hint: "Appointment booked events (Call Center volume).",
    formula: "COUNT(appointment_booked)",
  },
};

const TABLE_META: Record<
  CompareTableColumnKey,
  { title: string; format: "money" | "pct" | "int" | "ratio" | "text"; hint?: string; formula?: string }
> = {
  name: { title: "Client", format: "text" },
  spend: {
    title: "Spend",
    format: "money",
    hint: "Meta ad spend in the selected window. Call Center is —.",
    formula: "SUM(ad spend)",
  },
  cpl: {
    title: "CPL",
    format: "money",
    hint: "Cost per lead.",
    formula: "Ad Spend ÷ Total Leads",
  },
  cpql: {
    title: "CPQL",
    format: "money",
    hint: "Cost per qualified lead.",
    formula: "Ad Spend ÷ Qualified Leads",
  },
  hand_raise: {
    title: "Hand-raise",
    format: "pct",
    hint: "Paid ads: ÷ qualified. Call Center: ÷ total leads.",
    formula: "Unique booked ∪ claimed ∪ LT ÷ Qualified (or Total Leads for CC)",
  },
  conversation_rate: {
    title: "Conv %",
    format: "pct",
    hint: "Unique conversations per qualified lead. Not pickup→conversation.",
    formula: "Unique Conversations ÷ Qualified Leads",
  },
  show_rate: {
    title: "Show %",
    format: "pct",
    hint: "Unique booked leads who spoke to the LO.",
    formula: "Unique (booked ∩ show∪claimed∪LT) ÷ Unique booked",
  },
  cpconv: {
    title: "CPConv",
    format: "money",
    hint: "Cost per unique conversation (show ∪ claimed ∪ live transfer).",
    formula: "Ad Spend ÷ Unique Conversations",
  },
  dials: {
    title: "Dials",
    format: "int",
    hint: "Outbound dial events in the window. Zero is a real number.",
    formula: "COUNT(dial)",
  },
  dials_per_qualified: {
    title: "Dials / QL",
    format: "ratio",
    hint: "How many dials it took to produce each qualified lead. Display only — not graded.",
    formula: "Outbound Dials ÷ Qualified Leads",
  },
};

const GRADED_TABLE_KEYS = new Set<CompareTableColumnKey>([
  "cpl",
  "cpql",
  "cpconv",
  "hand_raise",
  "show_rate",
]);

type DirectoryClient = {
  id: string;
  name: string;
  reporting_type?: string | null;
};

type Bundle = {
  period: { start: string; end: string };
  granularity?: "day" | "week";
  clients: ClientCompareRow[];
  costHistory?: CompareClientCostSeries[];
  error?: string;
};

function formatValue(n: number, format: "money" | "pct" | "int"): string {
  if (format === "pct") return `${n.toFixed(0)}%`;
  if (format === "int") return n.toLocaleString();
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

function formatTableCell(n: number, format: "money" | "pct" | "int" | "ratio" | "text"): string {
  if (format === "pct") return `${n.toFixed(0)}%`;
  if (format === "int") return n.toLocaleString();
  if (format === "ratio") return n.toFixed(1);
  if (format === "text") return String(n);
  return `$${Math.round(n).toLocaleString()}`;
}

function gradeForColumn(row: ClientCompareRow, key: CompareTableColumnKey): HealthTier | null {
  if (!GRADED_TABLE_KEYS.has(key)) return null;
  if (key === "cpl") return row.grades.cpl ?? null;
  if (key === "cpql") return row.grades.cpql ?? null;
  if (key === "cpconv") return row.grades.cpconv ?? null;
  if (key === "hand_raise") return row.grades.hand_raise ?? null;
  if (key === "show_rate") return row.grades.show_rate ?? null;
  return null;
}

function idFromChartEvent(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const rec = data as Record<string, unknown>;
  if (typeof rec.id === "string") return rec.id;
  const payload = rec.payload;
  if (payload && typeof payload === "object" && typeof (payload as { id?: unknown }).id === "string") {
    return (payload as { id: string }).id;
  }
  return null;
}

function workspaceHref(clientId: string, start: string, end: string): string {
  const params = new URLSearchParams();
  params.set("view", "client_workspace");
  params.set("tab", "kpis");
  params.set("client", clientId);
  params.set("range", "custom");
  params.set("from", start);
  params.set("to", end);
  return `/dashboard?${params.toString()}`;
}

type Props = {
  directory: DirectoryClient[];
};

export default function ClientCompareDashboard({ directory }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const today = todayYmdInCallCenterTz();

  const urlPreset = (searchParams.get("range") as CompareDatePreset | null) ?? "last_30";
  const preset: CompareDatePreset = urlPreset in COMPARE_PRESET_LABELS ? urlPreset : "last_30";
  const customStart = searchParams.get("start") ?? "";
  const customEnd = searchParams.get("end") ?? "";
  const offer = parseOfferFilter(searchParams.get("product"));
  const urlClientIds = parseIdList(searchParams.get("clients"));
  const sortKey = parseTableSortKey(searchParams.get("sort"));
  const sortDir = parseSortDir(searchParams.get("dir"), sortKey);

  const derivedRange = rangeForComparePreset(
    preset,
    today,
    preset === "custom" ? { start: customStart, end: customEnd } : undefined,
  );
  const start = derivedRange.start;
  const end = derivedRange.end;

  const [bundle, setBundle] = useState<Bundle | null>(() =>
    peekCachedJson<Bundle>(`${CACHE_PREFIX}:${start}:${end}`) ?? null,
  );
  const [loading, setLoading] = useState(!bundle);
  const [error, setError] = useState<string | null>(null);
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[] | null>(
    urlClientIds.length > 0 ? urlClientIds : null,
  );
  const [mapMode, setMapMode] = useState<"cost" | "rate">("cost");
  const [pickerQuery, setPickerQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  const replaceParams = useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", "client_compare");
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "") params.delete(k);
        else params.set(k, v);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const load = useCallback(async () => {
    const key = `${CACHE_PREFIX}:${start}:${end}:${extraIds.slice().sort().join(",")}`;
    try {
      const qs = new URLSearchParams({ start, end });
      if (extraIds.length) qs.set("ids", extraIds.join(","));
      const json = await cachedJsonFetch<Bundle>(key, `/api/client-compare?${qs.toString()}`, {
        staleTime: STALE_MS,
        preferCache: false,
      });
      if (json.error) {
        setError(json.error);
        return;
      }
      setBundle(json);
      setError(null);
    } catch (e) {
      setError(prev => prev ?? (e instanceof Error ? e.message : "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [start, end, extraIds]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!pickerRef.current?.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const allRows = bundle?.clients ?? [];

  const effectiveIds = useMemo(() => {
    if (selectedIds !== null) return selectedIds;
    return rosterIdsForOffer(allRows, offer);
  }, [selectedIds, allRows, offer]);

  const visible = useMemo(
    () => allRows.filter(r => effectiveIds.includes(r.id)),
    [allRows, effectiveIds],
  );

  const sortedVisible = useMemo(
    () => sortCompareRows(visible, sortKey, sortDir),
    [visible, sortKey, sortDir],
  );

  const missingKey = effectiveIds.filter(id => !allRows.some(r => r.id === id)).join(",");
  useEffect(() => {
    if (!missingKey) return;
    const missing = missingKey.split(",");
    setExtraIds(prev => {
      const next = Array.from(new Set([...prev, ...missing]));
      return next.length === prev.length && next.every(id => prev.includes(id)) ? prev : next;
    });
  }, [missingKey]);

  useEffect(() => {
    if (shouldDefaultToRateMap(visible)) setMapMode("rate");
  }, [visible]);

  function setPreset(next: CompareDatePreset) {
    if (next === "custom") {
      replaceParams({ range: "custom", start, end });
      return;
    }
    const r = rangeForComparePreset(next, today);
    replaceParams({ range: next, start: r.start, end: r.end });
  }

  function setOffer(next: CompareOfferFilter) {
    const ids = rosterIdsForOffer(allRows, next);
    setSelectedIds(ids);
    replaceParams({
      product: next === "all" ? null : next,
      clients: ids.join(","),
    });
  }

  function setClients(ids: string[]) {
    setSelectedIds(ids);
    replaceParams({ clients: ids.join(",") });
  }

  function removeClient(id: string) {
    setClients(effectiveIds.filter(x => x !== id));
  }

  function addClient(id: string) {
    if (effectiveIds.includes(id)) return;
    setClients([...effectiveIds, id]);
    setPickerQuery("");
    setPickerOpen(false);
  }

  function goClient(id: string) {
    router.push(workspaceHref(id, start, end));
  }

  function setSort(clicked: CompareTableColumnKey) {
    const next = nextSortState(sortKey, sortDir, clicked);
    replaceParams({
      sort: next.key,
      dir: next.dir,
    });
  }

  const chartKeys = visibleChartKeys(visible);
  const costCaption = costChartsCaption(visible);
  const costPoints = costMapPoints(visible);
  const ratePoints = rateMapPoints(visible);
  const mapPoints = mapMode === "cost" ? costPoints : ratePoints;
  const mapMedian = mapMedians(mapPoints);
  const pending = showPendingCaveat(start, end);
  const withSpend = countWithSpend(visible);

  const pickerMatches = useMemo(() => {
    const q = pickerQuery.trim().toLowerCase();
    const pool = directory.length > 0 ? directory : allRows;
    return pool
      .filter(c => !effectiveIds.includes(c.id))
      .filter(c => !q || c.name.toLowerCase().includes(q))
      .slice(0, 12);
  }, [directory, allRows, effectiveIds, pickerQuery]);

  if (loading && !bundle) {
    return (
      <div className="space-y-4">
        <div className="h-16 animate-pulse rounded-xl" style={{ background: "rgba(148,163,184,0.1)" }} />
        <div className="h-72 animate-pulse rounded-xl" style={{ background: "rgba(148,163,184,0.1)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Controls
        preset={preset}
        start={start}
        end={end}
        offer={offer}
        today={today}
        pending={pending}
        pickerQuery={pickerQuery}
        pickerOpen={pickerOpen}
        pickerRef={pickerRef}
        pickerMatches={pickerMatches}
        visible={visible}
        withSpend={withSpend}
        onPreset={setPreset}
        onCustom={(s, e) => replaceParams({ range: "custom", start: s, end: e })}
        onOffer={setOffer}
        onQuery={setPickerQuery}
        onOpenPicker={setPickerOpen}
        onAdd={addClient}
        onRemove={removeClient}
      />

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 text-sm" style={{ ...CARD, color: "#f87171" }}>
          <span>{error}</span>
          <button type="button" className="text-xs underline" style={{ color: "#94a3b8" }} onClick={() => void load()}>
            Retry
          </button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyWall />
      ) : (
        <>
          <EfficiencyMap
            mode={mapMode}
            onMode={setMapMode}
            points={mapPoints}
            median={mapMedian}
            canCost={costPoints.length > 0}
            onPoint={goClient}
          />
          <CostHistoryLines
            series={(bundle?.costHistory ?? []).filter(s => visible.some(v => v.id === s.id))}
            granularity={bundle?.granularity ?? "week"}
            onClient={goClient}
          />
          <CompareKpiTable
            rows={sortedVisible}
            sortKey={sortKey}
            sortDir={sortDir}
            onSort={setSort}
            onRow={goClient}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {chartKeys.map(key => (
              <RankedBarCard
                key={key}
                kpi={key}
                bars={barsForChart(visible, key)}
                caption={COST_KEYS.has(key) ? costCaption : null}
                onBar={goClient}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const COST_KEYS = new Set<CompareKpiKey>(["spend", "cpl", "cpql", "cpconv"]);

function EmptyWall() {
  return (
    <div className="rounded-xl px-6 py-16 text-center" style={CARD}>
      <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>
        Add a client or pick an offer
      </p>
      <p className="text-xs mt-1" style={{ color: "#64748b" }}>
        The map, table, and bars stay empty until someone is on the wall.
      </p>
    </div>
  );
}

function CompareKpiTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  onRow,
}: {
  rows: ClientCompareRow[];
  sortKey: CompareTableColumnKey;
  sortDir: CompareSortDir;
  onSort: (key: CompareTableColumnKey) => void;
  onRow: (id: string) => void;
}) {
  return (
    <section className="rounded-xl overflow-hidden" style={CARD}>
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
          KPI table
        </h2>
        <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
          Same window as the map. Click a column to rank. Click a row for the workspace.
        </p>
      </div>
      <div className="overflow-auto max-h-[min(70vh,560px)]">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              {COMPARE_TABLE_COLUMNS.map(key => {
                const meta = TABLE_META[key];
                const active = sortKey === key;
                const align = key === "name" ? "left" : "right";
                return (
                  <th
                    key={key}
                    className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest whitespace-nowrap"
                    style={{
                      color: active ? "#e2e8f0" : "#475569",
                      textAlign: align,
                      position: "sticky",
                      top: 0,
                      left: key === "name" ? 0 : undefined,
                      zIndex: key === "name" ? 4 : 3,
                      background: "#0a1628",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                      boxShadow: key === "name" ? "4px 0 8px rgba(0,0,0,0.25)" : undefined,
                    }}
                  >
                    <div
                      className="inline-flex items-center gap-1"
                      style={{ justifyContent: key === "name" ? "flex-start" : "flex-end", width: "100%" }}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(key)}
                        className="inline-flex items-center gap-1"
                        style={{ color: "inherit" }}
                      >
                        {meta.title}
                        <span className="inline-block w-2 text-[9px]" style={{ color: active ? "#38bdf8" : "#334155" }}>
                          {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
                        </span>
                      </button>
                      {meta.hint && meta.formula ? (
                        <MetricInfoTip
                          hint={{ definition: meta.hint, source: "Events + Meta spend", formula: meta.formula }}
                        />
                      ) : null}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr
                key={row.id}
                onClick={() => onRow(row.id)}
                className="cursor-pointer group"
              >
                {COMPARE_TABLE_COLUMNS.map(key => {
                  const meta = TABLE_META[key];
                  const raw = tableValueFor(row, key);
                  const grade = gradeForColumn(row, key);
                  const isName = key === "name";
                  const display =
                    isName
                      ? row.name
                      : typeof raw === "number"
                        ? formatTableCell(raw, meta.format)
                        : "—";
                  return (
                    <td
                      key={key}
                      className="px-3 py-2 whitespace-nowrap tabular-nums bg-[#0a1628] group-hover:bg-[#0f2040]"
                      style={{
                        textAlign: isName ? "left" : "right",
                        color: grade ? TIER_FILL[grade] : isName ? "#e2e8f0" : "#cbd5e1",
                        position: isName ? "sticky" : undefined,
                        left: isName ? 0 : undefined,
                        zIndex: isName ? 1 : undefined,
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                        boxShadow: isName ? "4px 0 8px rgba(0,0,0,0.25)" : undefined,
                        fontWeight: isName ? 500 : 400,
                      }}
                    >
                      {isName ? (
                        <span className="flex items-center gap-2">
                          <span>{display}</span>
                          <span className="text-[10px] font-normal" style={{ color: "#64748b" }}>
                            {getReportingTypeLabel(row.reporting_type)}
                          </span>
                        </span>
                      ) : (
                        display
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Controls({
  preset,
  start,
  end,
  offer,
  today,
  pending,
  pickerQuery,
  pickerOpen,
  pickerRef,
  pickerMatches,
  visible,
  withSpend,
  onPreset,
  onCustom,
  onOffer,
  onQuery,
  onOpenPicker,
  onAdd,
  onRemove,
}: {
  preset: CompareDatePreset;
  start: string;
  end: string;
  offer: CompareOfferFilter;
  today: string;
  pending: boolean;
  pickerQuery: string;
  pickerOpen: boolean;
  pickerRef: RefObject<HTMLDivElement | null>;
  pickerMatches: DirectoryClient[];
  visible: ClientCompareRow[];
  withSpend: number;
  onPreset: (p: CompareDatePreset) => void;
  onCustom: (start: string, end: string) => void;
  onOffer: (o: CompareOfferFilter) => void;
  onQuery: (q: string) => void;
  onOpenPicker: (open: boolean) => void;
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const presets: CompareDatePreset[] = ["last_7", "last_30", "last_60", "last_90", "custom"];
  const offers: { id: CompareOfferFilter; label: string }[] = [
    { id: "all", label: "All" },
    { id: "RM", label: "Reverse" },
    { id: "DSCR", label: "DSCR" },
    { id: "CALL_CENTER", label: "Call Center" },
  ];

  return (
    <section className="rounded-xl px-4 py-3 space-y-3" style={CARD}>
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => onPreset(p)}
            className="rounded-md px-2.5 py-1 text-xs font-semibold"
            style={{
              color: preset === p ? "#e2e8f0" : "#64748b",
              background: preset === p ? "rgba(56,189,248,0.16)" : "transparent",
              border: `1px solid ${preset === p ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            {COMPARE_PRESET_LABELS[p]}
          </button>
        ))}
        {preset === "custom" && (
          <span className="flex items-center gap-1 text-xs" style={{ color: "#94a3b8" }}>
            <input
              type="date"
              value={start}
              max={today}
              onChange={e => onCustom(e.target.value, end)}
              className="rounded-md px-1.5 py-1 bg-transparent"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
            />
            <span>–</span>
            <input
              type="date"
              value={end}
              max={today}
              onChange={e => onCustom(start, e.target.value)}
              className="rounded-md px-1.5 py-1 bg-transparent"
              style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
            />
          </span>
        )}
        <span className="text-[11px] tabular-nums ml-1" style={{ color: "#475569" }}>
          {start} – {end}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {offers.map(o => (
          <button
            key={o.id}
            type="button"
            onClick={() => onOffer(o.id)}
            className="rounded-md px-2.5 py-1 text-xs font-semibold"
            style={{
              color: offer === o.id ? "#e2e8f0" : "#64748b",
              background: offer === o.id ? "rgba(251,191,36,0.12)" : "transparent",
              border: `1px solid ${offer === o.id ? "rgba(251,191,36,0.35)" : "rgba(255,255,255,0.08)"}`,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" ref={pickerRef}>
        {visible.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => onRemove(r.id)}
            className="rounded-full px-2.5 py-0.5 text-[11px] font-medium flex items-center gap-1.5"
            style={{
              color: "#cbd5e1",
              background: "rgba(148,163,184,0.1)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
            title="Remove"
          >
            {r.name}
            <span style={{ color: "#64748b" }}>×</span>
          </button>
        ))}
        <div className="relative">
          <input
            value={pickerQuery}
            onChange={e => {
              onQuery(e.target.value);
              onOpenPicker(true);
            }}
            onFocus={() => onOpenPicker(true)}
            placeholder="Add client…"
            className="rounded-md px-2.5 py-1 text-xs bg-transparent w-44"
            style={{ border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
          />
          {pickerOpen && pickerMatches.length > 0 && (
            <ul
              className="absolute z-20 mt-1 w-64 max-h-64 overflow-auto rounded-md py-1"
              style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              {pickerMatches.map(c => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-1.5 text-xs"
                    style={{ color: "#e2e8f0" }}
                    onClick={() => onAdd(c.id)}
                  >
                    {c.name}
                    {c.reporting_type ? (
                      <span className="ml-2" style={{ color: "#64748b" }}>
                        {getReportingTypeLabel(c.reporting_type as ReportingType)}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="text-[11px] tabular-nums" style={{ color: "#64748b" }}>
          {visible.length} clients · {withSpend} with spend
        </span>
      </div>

      {pending && (
        <p className="text-[11px]" style={{ color: "#fbbf24" }}>
          Short window: Show Rate and CPConv can look worse because appointments
          in this range may not have happened yet.
        </p>
      )}
    </section>
  );
}

function formatHistoryDate(date: string, granularity: "day" | "week"): string {
  const d = new Date(`${date}T00:00:00.000Z`);
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) +
    (granularity === "week" ? " wk" : "")
  );
}

const COST_HISTORY_CHARTS: { key: CompareCostMetric; title: string; formula: string }[] = [
  { key: "cpl", title: "CPL over time", formula: "Ad Spend ÷ Leads" },
  { key: "cpql", title: "CPQL over time", formula: "Ad Spend ÷ Qualified Leads" },
  { key: "cpconv", title: "CPConv over time", formula: "Ad Spend ÷ Unique Conversations" },
];

function CostHistoryLines({
  series,
  granularity,
  onClient,
}: {
  series: CompareClientCostSeries[];
  granularity: "day" | "week";
  onClient: (id: string) => void;
}) {
  if (series.length === 0) return null;

  return (
    <section className="rounded-xl p-4 space-y-5" style={CARD}>
      <div>
        <h2 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
          Cost history
        </h2>
        <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
          One line per account. Gaps are buckets with no denominator (no leads,
          qualified, or conversations). Call Center accounts are excluded.
          {granularity === "week" ? " Weekly buckets." : " Daily buckets."}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-5">
        {COST_HISTORY_CHARTS.map(chart => {
          const data = pivotCostHistory(series, chart.key).map(row => ({
            ...row,
            label: formatHistoryDate(String(row.date), granularity),
          }));
          return (
            <div key={chart.key}>
              <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: "#cbd5e1" }}>
                {chart.title}
                <span className="font-normal" style={{ color: "#64748b" }}>
                  {chart.formula}
                </span>
              </h3>
              <div style={{ height: 220 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      tickFormatter={v => formatValue(Number(v), "money")}
                      width={48}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(value, name) => {
                        const s = series.find(x => x.id === name);
                        const n = value == null ? null : Number(value);
                        return [n == null || Number.isNaN(n) ? "—" : formatValue(n, "money"), s?.name ?? String(name)];
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
                      formatter={value => series.find(s => s.id === value)?.name ?? String(value)}
                    />
                    {series.map((s, i) => (
                      <Line
                        key={s.id}
                        type="monotone"
                        dataKey={s.id}
                        name={s.id}
                        stroke={lineColorForIndex(i)}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                        onClick={() => onClient(s.id)}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EfficiencyMap({
  mode,
  onMode,
  points,
  median,
  canCost,
  onPoint,
}: {
  mode: "cost" | "rate";
  onMode: (m: "cost" | "rate") => void;
  points: CompareMapPoint[];
  median: { x: number | null; y: number | null };
  canCost: boolean;
  onPoint: (id: string) => void;
}) {
  const xLabel = mode === "cost" ? "CPConv (cheap left)" : "Hand-raise %";
  const yLabel = mode === "cost" ? "Hand-raise %" : "Show Rate %";

  return (
    <section className="rounded-xl p-4" style={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            Efficiency map
          </h2>
          <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
            Color = north-star grade · dashed = median of solid points · bubble =
            conversations
          </p>
        </div>
        <div className="flex gap-1">
          {(["cost", "rate"] as const).map(m => (
            <button
              key={m}
              type="button"
              disabled={m === "cost" && !canCost}
              onClick={() => onMode(m)}
              className="rounded-md px-2.5 py-1 text-xs font-semibold disabled:opacity-40"
              style={{
                color: mode === m ? "#e2e8f0" : "#64748b",
                background: mode === m ? "rgba(56,189,248,0.16)" : "transparent",
                border: `1px solid ${mode === m ? "rgba(56,189,248,0.35)" : "rgba(255,255,255,0.08)"}`,
              }}
            >
              {m === "cost" ? "Cost map" : "Rate map"}
            </button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <p className="text-xs py-16 text-center" style={{ color: "#64748b" }}>
          Nobody in this set has both axes for this map.
        </p>
      ) : (
        <div style={{ height: 360 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 12, right: 16, left: 8, bottom: 12 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.06)" />
              <XAxis
                type="number"
                dataKey="x"
                name={xLabel}
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={v => (mode === "cost" ? formatValue(Number(v), "money") : `${Number(v).toFixed(0)}%`)}
                label={{ value: xLabel, position: "insideBottom", offset: -4, fill: "#475569", fontSize: 11 }}
              />
              <YAxis
                type="number"
                dataKey="y"
                name={yLabel}
                tick={{ fill: "#64748b", fontSize: 11 }}
                tickFormatter={v => `${Number(v).toFixed(0)}%`}
                label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "#475569", fontSize: 11 }}
              />
              <ZAxis type="number" dataKey="z" range={[60, 320]} />
              {median.x != null && (
                <ReferenceLine x={median.x} stroke="#94a3b8" strokeDasharray="4 4" />
              )}
              {median.y != null && (
                <ReferenceLine y={median.y} stroke="#94a3b8" strokeDasharray="4 4" />
              )}
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, name) => {
                  const n = Number(value);
                  if (name === "z") return [n, "Conversations"];
                  if (mode === "cost" && name === "x") return [formatValue(n, "money"), "CPConv"];
                  return [`${n.toFixed(0)}%`, String(name)];
                }}
                labelFormatter={(_, payload) => {
                  const p = payload?.[0]?.payload as CompareMapPoint | undefined;
                  return p ? `${p.name} · ${getReportingTypeLabel(p.reporting_type)}` : "";
                }}
              />
              <Scatter
                data={points}
                onClick={data => {
                  const id = idFromChartEvent(data);
                  if (id) onPoint(id);
                }}
                cursor="pointer"
              >
                {points.map(p => (
                  <Cell
                    key={p.id}
                    fill={TIER_FILL[p.colorTier]}
                    fillOpacity={p.hollow ? 0.22 : 0.85}
                    stroke={TIER_FILL[p.colorTier]}
                    strokeDasharray={p.hollow ? "3 2" : undefined}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="flex flex-wrap gap-3 mt-2 text-[10px]" style={{ color: "#64748b" }}>
        {(Object.keys(TIER_FILL) as HealthTier[]).map(t => (
          <span key={t} className="flex items-center gap-1">
            <span className="inline-block w-2 h-2 rounded-full" style={{ background: TIER_FILL[t] }} />
            {t}
          </span>
        ))}
      </div>
    </section>
  );
}

function RankedBarCard({
  kpi,
  bars,
  caption,
  onBar,
}: {
  kpi: CompareKpiKey;
  bars: CompareBar[];
  caption: string | null;
  onBar: (id: string) => void;
}) {
  const meta = CHART_META[kpi];
  const median = medianForBars(bars);
  const height = Math.max(220, bars.length * 28);

  return (
    <section className="rounded-xl p-4" style={CARD}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "#e2e8f0" }}>
            {meta.title}
            <MetricInfoTip hint={{ definition: meta.hint, source: "Events + Meta spend", formula: meta.formula }} />
          </h3>
          {caption && (
            <p className="text-[10px] mt-0.5" style={{ color: "#64748b" }}>
              {caption}
            </p>
          )}
        </div>
        {median != null && (
          <span className="text-[11px] tabular-nums" style={{ color: "#94a3b8" }}>
            median {formatValue(median, meta.format)}
          </span>
        )}
      </div>
      {bars.length === 0 ? (
        <p className="text-xs py-8 text-center" style={{ color: "#64748b" }}>
          No values in this set.
        </p>
      ) : (
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
              <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: "#64748b", fontSize: 10 }}
                tickFormatter={v => formatValue(Number(v), meta.format)}
              />
              <YAxis
                type="category"
                dataKey="name"
                width={96}
                tick={{ fill: "#94a3b8", fontSize: 10 }}
              />
              {median != null && (
                <ReferenceLine x={median} stroke="#94a3b8" strokeDasharray="4 4" />
              )}
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(value, _n, item) => {
                  const bar = item?.payload as CompareBar | undefined;
                  const extra = bar?.row.has_custom_cpl_benchmark && kpi === "cpl"
                    ? " · custom CS CPL bar"
                    : "";
                  return [formatValue(Number(value), meta.format) + extra, meta.title];
                }}
              />
              <Bar
                dataKey="value"
                radius={[0, 4, 4, 0]}
                cursor="pointer"
                onClick={data => {
                  const id = idFromChartEvent(data);
                  if (id) onBar(id);
                }}
              >
                {bars.map(b => (
                  <Cell
                    key={b.id}
                    fill={TIER_FILL[b.grade ?? "insufficient"]}
                    fillOpacity={b.hollow ? 0.28 : 0.9}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
