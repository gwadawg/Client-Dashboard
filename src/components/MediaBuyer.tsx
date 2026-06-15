"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
};

type DrilldownClientRow = {
  client_id: string;
  client_name: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  closes: number;
  cpl: number | null;
  cost_per_show: number | null;
};

type DrilldownDaily = {
  date: string;
  spend: number;
  leads: number;
  appointments: number;
  shows: number;
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
  cpl: number | null;
  cost_per_qualified: number | null;
  cost_per_appointment: number | null;
  cost_per_show: number | null;
  cost_per_close: number | null;
  booking_rate: number | null;
  show_rate: number | null;
  client_count: number;
  has_meta: boolean;
  library: LibraryMeta | null;
  variant_names: string[];
  is_sourced: boolean;
};

type DrilldownVariant = {
  ad_name: string;
  spend: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  closes: number;
  cpl: number | null;
};

type Drilldown = {
  ad_name: string;
  library_id?: string | null;
  perClient: DrilldownClientRow[];
  daily: DrilldownDaily[];
  variants?: DrilldownVariant[];
};

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
  created_at: string;
  updated_at: string;
  aliases: LibraryAlias[];
};

export type LibraryNav = {
  libraryId?: string;
  prefillAdName?: string;
  openForm?: boolean;
} | null;

const AD_FORMAT_OPTIONS = [
  { value: "", label: "Select format…" },
  { value: "static", label: "Static" },
  { value: "ugc", label: "UGC" },
  { value: "testimonial", label: "Testimonial" },
  { value: "ext", label: "Ext" },
] as const;

const PRODUCT_OPTIONS = [
  { value: "", label: "Select product…" },
  { value: "reverse", label: "Reverse" },
  { value: "dscr", label: "DSCR" },
  { value: "broad_forward", label: "Broad Forward" },
] as const;

const AD_FORMAT_LABELS: Record<string, string> = Object.fromEntries(
  AD_FORMAT_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);
const PRODUCT_LABELS: Record<string, string> = Object.fromEntries(
  PRODUCT_OPTIONS.filter((o) => o.value).map((o) => [o.value, o.label]),
);

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  winner: { bg: "rgba(245,158,11,0.14)", text: "#fbbf24", label: "Winner" },
  active: { bg: "rgba(52,211,153,0.12)", text: "#34d399", label: "Active" },
  paused: { bg: "rgba(148,163,184,0.12)", text: "#94a3b8", label: "Paused" },
  archived: { bg: "rgba(100,116,139,0.1)", text: "#64748b", label: "Archived" },
};

const STATUS_OPTIONS = ["active", "winner", "paused", "archived"] as const;

function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function num(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString();
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
  | "leads"
  | "qualified"
  | "appointments"
  | "shows"
  | "closes"
  | "cpl"
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [drill, setDrill] = useState<Record<string, Drilldown | "loading">>({});
  const [unsourcedOpen, setUnsourcedOpen] = useState(true);
  const [linkTarget, setLinkTarget] = useState<string | null>(null);
  const [libraryOptions, setLibraryOptions] = useState<LibEntry[]>([]);
  const [linkLibraryId, setLinkLibraryId] = useState("");
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

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
          })),
        );
        setDrill({});
        setExpanded(null);
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

  const sorted = useMemo(() => {
    const copy = [...ads];
    copy.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Nulls always sort last regardless of direction.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return asc ? av - bv : bv - av;
    });
    return copy;
  }, [ads, sortKey, asc]);

  const unsourcedAds = useMemo(
    () => ads.filter((a) => !a.is_sourced && (a.spend > 0 || a.has_meta)),
    [ads],
  );

  const openLinkModal = useCallback((adName: string) => {
    setLinkTarget(adName);
    setLinkLibraryId("");
    setLinkError(null);
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

  const toggleExpand = useCallback(
    (ad: AdRow) => {
      const key = ad.row_key;
      if (expanded === key) {
        setExpanded(null);
        return;
      }
      setExpanded(key);
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
              [key]: { ad_name: ad.ad_name, perClient: [], daily: [], variants: [] },
            })),
          );
      }
    },
    [expanded, drill, startDate, endDate, clientId],
  );

  if (loading) return <p style={{ color: "#475569" }} className="text-sm py-10 text-center">Loading ad performance…</p>;
  if (error) return <p style={{ color: "#f87171" }} className="text-sm py-10 text-center">{error}</p>;
  if (ads.length === 0)
    return (
      <p style={{ color: "#475569" }} className="text-sm py-10 text-center">
        No ad data for this range. Make sure Meta ad insights are ingested and leads carry an ad name / utm_content.
      </p>
    );

  const totals = ads.reduce(
    (t, a) => {
      t.spend += a.spend;
      t.leads += a.leads;
      t.appointments += a.appointments;
      t.shows += a.shows;
      t.closes += a.closes;
      return t;
    },
    { spend: 0, leads: 0, appointments: 0, shows: 0, closes: 0 },
  );

  return (
    <div className="space-y-4">
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
                    <tr key={ad.row_key} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="px-3 py-2 text-left" style={{ color: "#e2e8f0" }}>{ad.ad_name}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{money(ad.spend)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(ad.leads)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
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

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total Spend", value: money(Math.round(totals.spend)) },
          { label: "Leads", value: num(totals.leads) },
          { label: "Appointments", value: num(totals.appointments) },
          { label: "Shows", value: num(totals.shows) },
          { label: "Closes", value: num(totals.closes) },
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
                <SortHeader label="Leads" k="leads" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Qual" k="qualified" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Appts" k="appointments" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Shows" k="shows" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="Closes" k="closes" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="CPL" k="cpl" sortKey={sortKey} asc={asc} onSort={onSort} />
                <SortHeader label="CP Show" k="cost_per_show" sortKey={sortKey} asc={asc} onSort={onSort} />
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider" style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  Clients
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((ad) => {
                const isOpen = expanded === ad.row_key;
                const d = drill[ad.row_key];
                return (
                  <FragmentRow
                    key={ad.row_key}
                    ad={ad}
                    isOpen={isOpen}
                    drilldown={d}
                    onToggle={() => toggleExpand(ad)}
                    onAddToLibrary={onAddToLibrary}
                    onViewInLibrary={onViewInLibrary}
                    onLinkToExisting={openLinkModal}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

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
            <select
              value={linkLibraryId}
              onChange={(e) => setLinkLibraryId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
            >
              <option value="">Select library entry…</option>
              {libraryOptions.map((e) => (
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
  isOpen,
  drilldown,
  onToggle,
  onAddToLibrary,
  onViewInLibrary,
  onLinkToExisting,
}: {
  ad: AdRow;
  isOpen: boolean;
  drilldown: Drilldown | "loading" | undefined;
  onToggle: () => void;
  onAddToLibrary: (adName: string) => void;
  onViewInLibrary: (libraryId: string) => void;
  onLinkToExisting: (adName: string) => void;
}) {
  return (
    <>
      <tr
        className="cursor-pointer transition-colors"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", background: isOpen ? "rgba(245,158,11,0.04)" : "transparent" }}
        onClick={onToggle}
      >
        <td className="px-3 py-3 text-left" style={{ color: "#e2e8f0" }}>
          <div className="flex items-center gap-2">
            <svg
              className="w-3.5 h-3.5 flex-shrink-0 transition-transform"
              style={{ color: "#475569", transform: isOpen ? "rotate(90deg)" : "none" }}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            <span className="font-medium">{ad.ad_name}</span>
            {ad.library ? <StatusBadge status={ad.library.status} /> : (
              <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase" style={{ background: "rgba(100,116,139,0.15)", color: "#64748b" }}>
                Not in library
              </span>
            )}
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
          {isOpen && ad.variant_names.length > 1 ? (
            <p className="text-[10px] mt-1 ml-5" style={{ color: "#64748b" }}>
              Variants: {ad.variant_names.join(" · ")}
            </p>
          ) : null}
        </td>
        <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.spend)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.leads)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.qualified)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.appointments)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.shows)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#34d399" }}>{num(ad.closes)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.cpl)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.cost_per_show)}</td>
        <td className="px-3 py-3 text-right" style={{ color: "#475569" }}>{ad.client_count}</td>
      </tr>
      {isOpen ? (
        <tr style={{ background: "#060e1c" }}>
          <td colSpan={10} className="px-4 py-4">
            {drilldown === "loading" || !drilldown ? (
              <p className="text-sm" style={{ color: "#475569" }}>Loading breakdown…</p>
            ) : (
              <DrilldownPanel ad={ad} drilldown={drilldown} onViewInLibrary={onViewInLibrary} />
            )}
          </td>
        </tr>
      ) : null}
    </>
  );
}

function DrilldownPanel({
  ad,
  drilldown,
  onViewInLibrary,
}: {
  ad: AdRow;
  drilldown: Drilldown;
  onViewInLibrary: (libraryId: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
          Daily trend
        </p>
        {drilldown.daily.length === 0 ? (
          <p className="text-sm" style={{ color: "#475569" }}>No daily data.</p>
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={drilldown.daily} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fill: "#475569", fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                <YAxis tick={{ fill: "#475569", fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: "#94a3b8" }}
                />
                <Line type="monotone" dataKey="spend" stroke="#f59e0b" dot={false} strokeWidth={2} name="Spend" />
                <Line type="monotone" dataKey="leads" stroke="#60a5fa" dot={false} strokeWidth={2} name="Leads" />
                <Line type="monotone" dataKey="shows" stroke="#34d399" dot={false} strokeWidth={2} name="Shows" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {(ad.library?.summary || ad.library?.visual_notes || ad.library?.ad_format || ad.library?.product) ? (
          <div className="mt-3 rounded-lg p-3" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
            {(ad.library?.ad_format || ad.library?.product) ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {ad.library?.ad_format ? (
                  <ClassBadge label={AD_FORMAT_LABELS[ad.library.ad_format] ?? ad.library.ad_format} color="#60a5fa" />
                ) : null}
                {ad.library?.product ? (
                  <ClassBadge label={PRODUCT_LABELS[ad.library.product] ?? ad.library.product} color="#a78bfa" />
                ) : null}
              </div>
            ) : null}
            {ad.library?.summary ? (
              <p className="text-sm whitespace-pre-wrap" style={{ color: "#cbd5e1" }}>{ad.library.summary}</p>
            ) : null}
            {ad.library?.visual_notes ? (
              <p className="text-xs mt-2 whitespace-pre-wrap" style={{ color: "#64748b" }}>Notes: {ad.library.visual_notes}</p>
            ) : null}
            {ad.library ? (
              <button
                type="button"
                onClick={() => onViewInLibrary(ad.library!.id)}
                className="text-xs mt-2 underline"
                style={{ color: "#f59e0b" }}
              >
                View in library
              </button>
            ) : null}
          </div>
        ) : null}
        {drilldown.variants && drilldown.variants.length > 1 ? (
          <div className="mt-3">
            <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
              By variant
            </p>
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "#050c18" }}>
                    {["Ad name", "Spend", "Leads", "Appts", "Shows", "CPL"].map((h, i) => (
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
                  {drilldown.variants.map((v) => (
                    <tr key={v.ad_name} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      <td className="px-3 py-2 text-left" style={{ color: "#cbd5e1" }}>{v.ad_name}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{money(v.spend)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(v.leads)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(v.appointments)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(v.shows)}</td>
                      <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{money(v.cpl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: "#475569" }}>
          By client
        </p>
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "#050c18" }}>
                {["Client", "Spend", "Leads", "Appts", "Shows", "CPL", "CP Show"].map((h, i) => (
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
              {drilldown.perClient.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-3 text-center" style={{ color: "#475569" }}>No client data.</td>
                </tr>
              ) : (
                drilldown.perClient.map((c) => (
                  <tr key={c.client_id} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    <td className="px-3 py-2 text-left" style={{ color: "#cbd5e1" }}>{c.client_name}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{money(c.spend)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(c.leads)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(c.appointments)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "#94a3b8" }}>{num(c.shows)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{money(c.cpl)}</td>
                    <td className="px-3 py-2 text-right" style={{ color: "#e2e8f0" }}>{money(c.cost_per_show)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Ad Library ────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  id: "",
  ad_name: "",
  status: "active",
  ad_format: "",
  product: "",
  drive_url: "",
  thumbnail_url: "",
  summary: "",
  visual_notes: "",
};

function AdLibrary({
  libraryNav,
  onNavClear,
}: {
  libraryNav: LibraryNav;
  onNavClear: () => void;
}) {
  const [entries, setEntries] = useState<LibEntry[]>([]);
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
      drive_url: e.drive_url ?? "",
      thumbnail_url: e.thumbnail_url ?? "",
      summary: e.summary ?? "",
      visual_notes: e.visual_notes ?? "",
    });
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/ad-library")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      })
      .then((data: LibEntry[]) => setEntries(data.map((e) => ({ ...e, aliases: e.aliases ?? [] }))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  if (loading) return <p style={{ color: "#475569" }} className="text-sm py-10 text-center">Loading library…</p>;
  if (error) return <p style={{ color: "#f87171" }} className="text-sm py-10 text-center">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
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
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((e) => {
            const thumb = driveThumb(e);
            const allNames = [e.ad_name, ...(e.aliases ?? []).map((a) => a.alias_name)];
            const isHighlighted = highlightId === e.id;
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
                <div className="relative aspect-video flex items-center justify-center" style={{ background: "#050c18" }}>
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={e.ad_name} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <svg className="w-10 h-10" fill="none" stroke="#1e293b" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                  <div className="absolute top-2 left-2">
                    <StatusBadge status={e.status} />
                  </div>
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  <p className="font-semibold text-sm" style={{ color: "#e2e8f0" }}>{e.ad_name}</p>
                  {allNames.length > 1 ? (
                    <div className="mt-2">
                      <button
                        type="button"
                        className="text-[11px] underline"
                        style={{ color: "#94a3b8" }}
                        onClick={() => setExpandedVariants(expandedVariants === e.id ? null : e.id)}
                      >
                        {allNames.length} linked ad names {expandedVariants === e.id ? "▲" : "▼"}
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
                  {(e.ad_format || e.product) ? (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {e.ad_format ? (
                        <ClassBadge label={AD_FORMAT_LABELS[e.ad_format] ?? e.ad_format} color="#60a5fa" />
                      ) : null}
                      {e.product ? (
                        <ClassBadge label={PRODUCT_LABELS[e.product] ?? e.product} color="#a78bfa" />
                      ) : null}
                    </div>
                  ) : null}
                  {e.summary ? (
                    <p className="text-xs mt-2 line-clamp-3 whitespace-pre-wrap" style={{ color: "#94a3b8" }}>{e.summary}</p>
                  ) : null}
                  {e.visual_notes ? (
                    <p className="text-[11px] mt-2 line-clamp-2 whitespace-pre-wrap" style={{ color: "#64748b" }}>Notes: {e.visual_notes}</p>
                  ) : null}
                  <div className="flex items-center gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    {e.drive_url ? (
                      <a href={e.drive_url} target="_blank" rel="noreferrer" className="text-xs underline" style={{ color: "#60a5fa" }}>
                        Open creative
                      </a>
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
              </div>
            );
          })}
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setForm(null)}>
          <div
            className="rounded-xl w-full max-w-lg p-5 space-y-3 max-h-[90vh] overflow-y-auto"
            style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
              {form.id ? "Edit Ad" : "Add Ad"}
            </h3>
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
              <Field label="Ad format">
                <select
                  value={form.ad_format}
                  onChange={(e) => setForm({ ...form, ad_format: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                >
                  {AD_FORMAT_OPTIONS.map((o) => (
                    <option key={o.value || "empty"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
              <Field label="Thumbnail URL (optional)">
                <input
                  value={form.thumbnail_url}
                  onChange={(e) => setForm({ ...form, thumbnail_url: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg text-sm"
                  style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                  placeholder="https://…"
                />
              </Field>
            </div>
            <Field label="Google Drive link">
              <input
                value={form.drive_url}
                onChange={(e) => setForm({ ...form, drive_url: e.target.value })}
                className="w-full px-3 py-2 rounded-lg text-sm"
                style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}
                placeholder="https://drive.google.com/file/d/…"
              />
            </Field>
            <Field label="Script / copy + visual aspects">
              <textarea
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm"
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
        <AdLibrary libraryNav={libraryNav} onNavClear={() => setLibraryNav(null)} />
      )}
    </div>
  );
}
