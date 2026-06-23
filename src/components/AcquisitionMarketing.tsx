"use client";

import { useCallback, useEffect, useMemo, useState, Fragment } from "react";
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
};

type Angle = { id: string; label: string; sort_order: number; is_active: boolean };

type LibraryMeta = {
  id: string;
  ad_format: string | null;
  drive_url: string | null;
  angle_id: string | null;
  angle_label: string | null;
  creative_created_at: string | null;
};

type AdRow = {
  row_key: string;
  ad_name: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  qualified: number;
  appointments: number;
  shows: number;
  closes: number;
  cpl: number | null;
  cost_per_appointment: number | null;
  cost_per_close: number | null;
  has_meta: boolean;
  library: LibraryMeta | null;
  variant_names: string[];
  is_sourced: boolean;
};

type Drilldown = {
  ad_name: string;
  daily: { date: string; spend: number; leads: number; appointments: number; shows: number }[];
  variants?: {
    ad_name: string;
    spend: number;
    leads: number;
    appointments: number;
    shows: number;
    closes: number;
    cpl: number | null;
  }[];
};

type LibraryAlias = { id: string; alias_name: string; created_at: string };

type LibEntry = {
  id: string;
  ad_name: string;
  ad_format: string | null;
  drive_url: string | null;
  angle_id: string | null;
  angle_label: string | null;
  creative_created_at: string | null;
  created_at: string;
  updated_at: string;
  aliases: LibraryAlias[];
};

type LibraryNav = { libraryId?: string; prefillAdName?: string; openForm?: boolean } | null;

const FORMAT_OPTIONS = [
  { value: "", label: "Select format…" },
  { value: "static", label: "Static" },
  { value: "ugc", label: "UGC" },
] as const;

const FORMAT_LABELS: Record<string, string> = { static: "Static", ugc: "UGC" };

function money(v: number | null | undefined): string {
  if (v == null) return "—";
  return `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function num(v: number | null | undefined): string {
  if (v == null) return "—";
  return v.toLocaleString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] uppercase tracking-wider" style={{ color: "#475569" }}>{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls =
  "w-full rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-amber-500/40";
const inputStyle = { background: "#050c18", border: "1px solid rgba(255,255,255,0.08)", color: "#e2e8f0" };

// ── Performance ───────────────────────────────────────────────────────────────
function AdPerformance({
  startDate,
  endDate,
  onAddToLibrary,
  onViewInLibrary,
}: Props & {
  onAddToLibrary: (adName: string) => void;
  onViewInLibrary: (libraryId: string) => void;
}) {
  const [ads, setAds] = useState<AdRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
    return fetch(`/api/acquisition/media-buyer?${params}`)
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
  }, [startDate, endDate]);

  useEffect(() => {
    loadAds();
  }, [loadAds]);

  const unsourcedAds = useMemo(
    () => ads.filter((a) => !a.is_sourced && (a.spend > 0 || a.has_meta)),
    [ads],
  );

  const openLinkModal = useCallback((adName: string) => {
    setLinkTarget(adName);
    setLinkLibraryId("");
    setLinkError(null);
    fetch("/api/acquisition/ad-library")
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
    const res = await fetch(`/api/acquisition/ad-library/${linkLibraryId}/aliases`, {
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
        if (ad.library?.id) params.set("library_id", ad.library.id);
        else params.set("ad", ad.variant_names[0] ?? ad.ad_name);
        fetch(`/api/acquisition/media-buyer?${params}`)
          .then((r) => r.json())
          .then((data: Drilldown) => setDrill((d) => ({ ...d, [key]: data })))
          .catch(() =>
            setDrill((d) => ({ ...d, [key]: { ad_name: ad.ad_name, daily: [], variants: [] } })),
          );
      }
    },
    [expanded, drill, startDate, endDate],
  );

  if (loading) return <p className="text-sm py-10 text-center" style={{ color: "#475569" }}>Loading ad performance…</p>;
  if (error) return <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>{error}</p>;
  if (ads.length === 0) {
    return (
      <p className="text-sm py-10 text-center" style={{ color: "#475569" }}>
        No ad data for this range. Sync Meta insights and ensure leads carry an ad name.
      </p>
    );
  }

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
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "#050c18" }}>
                  {["Ad name", "Spend", "Leads", "Actions"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[10px] font-semibold uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}
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
                      <button type="button" className="text-[11px] underline mr-3" style={{ color: "#f59e0b" }} onClick={() => onAddToLibrary(ad.ad_name)}>
                        Add to library
                      </button>
                      <button type="button" className="text-[11px] underline" style={{ color: "#60a5fa" }} onClick={() => openLinkModal(ad.ad_name)}>
                        Link to existing
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                {["Ad", "Spend", "Leads", "Appts", "Shows", "Closes", "CPL", ""].map((h) => (
                  <th
                    key={h}
                    className={`px-3 py-3 text-xs font-semibold uppercase tracking-wider ${h === "Ad" ? "text-left" : "text-right"}`}
                    style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ads.map((ad) => {
                const isOpen = expanded === ad.row_key;
                const dd = drill[ad.row_key];
                return (
                  <Fragment key={ad.row_key}>
                    <tr
                      key={ad.row_key}
                      className="cursor-pointer hover:bg-white/[0.02]"
                      style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
                      onClick={() => toggleExpand(ad)}
                    >
                      <td className="px-3 py-3 text-left">
                        <div className="font-medium" style={{ color: "#e2e8f0" }}>{ad.ad_name}</div>
                        {ad.library ? (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {ad.library.ad_format ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
                                {FORMAT_LABELS[ad.library.ad_format] ?? ad.library.ad_format}
                              </span>
                            ) : null}
                            {ad.library.angle_label ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                                {ad.library.angle_label}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[10px]" style={{ color: "#64748b" }}>Not in library</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.spend)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.leads)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.appointments)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.shows)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: "#94a3b8" }}>{num(ad.closes)}</td>
                      <td className="px-3 py-3 text-right" style={{ color: "#e2e8f0" }}>{money(ad.cpl)}</td>
                      <td className="px-3 py-3 text-right">
                        {ad.library?.drive_url ? (
                          <a
                            href={ad.library.drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] underline"
                            style={{ color: "#60a5fa" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            Drive
                          </a>
                        ) : null}
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr key={`${ad.row_key}-drill`}>
                        <td colSpan={8} className="px-4 py-4" style={{ background: "#050c18" }}>
                          {dd === "loading" ? (
                            <p className="text-xs" style={{ color: "#475569" }}>Loading drilldown…</p>
                          ) : dd ? (
                            <div className="space-y-4">
                              {dd.daily.length > 0 ? (
                                <div className="h-48">
                                  <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={dd.daily}>
                                      <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                                      <XAxis dataKey="date" tick={{ fill: "#64748b", fontSize: 10 }} />
                                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                                      <Tooltip contentStyle={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.1)" }} />
                                      <Line type="monotone" dataKey="spend" stroke="#f59e0b" dot={false} name="Spend" />
                                      <Line type="monotone" dataKey="leads" stroke="#60a5fa" dot={false} name="Leads" />
                                    </LineChart>
                                  </ResponsiveContainer>
                                </div>
                              ) : null}
                              {dd.variants && dd.variants.length > 1 ? (
                                <div className="overflow-x-auto">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr>
                                        {["Variant", "Spend", "Leads", "Appts", "Shows", "Closes", "CPL"].map((h) => (
                                          <th key={h} className="px-2 py-1 text-left uppercase tracking-wider" style={{ color: "#475569" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {dd.variants.map((v) => (
                                        <tr key={v.ad_name} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                                          <td className="px-2 py-1" style={{ color: "#e2e8f0" }}>{v.ad_name}</td>
                                          <td className="px-2 py-1" style={{ color: "#e2e8f0" }}>{money(v.spend)}</td>
                                          <td className="px-2 py-1" style={{ color: "#94a3b8" }}>{num(v.leads)}</td>
                                          <td className="px-2 py-1" style={{ color: "#94a3b8" }}>{num(v.appointments)}</td>
                                          <td className="px-2 py-1" style={{ color: "#94a3b8" }}>{num(v.shows)}</td>
                                          <td className="px-2 py-1" style={{ color: "#94a3b8" }}>{num(v.closes)}</td>
                                          <td className="px-2 py-1" style={{ color: "#e2e8f0" }}>{money(v.cpl)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : null}
                              {ad.library ? (
                                <button
                                  type="button"
                                  className="text-xs underline"
                                  style={{ color: "#f59e0b" }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onViewInLibrary(ad.library!.id);
                                  }}
                                >
                                  View in library
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {linkTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl p-5 space-y-4" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.08)" }}>
            <p className="text-sm" style={{ color: "#94a3b8" }}>
              Link <span style={{ color: "#e2e8f0" }}>{linkTarget}</span> to a library entry.
            </p>
            <select
              value={linkLibraryId}
              onChange={(e) => setLinkLibraryId(e.target.value)}
              className={inputCls}
              style={inputStyle}
            >
              <option value="">Select library entry…</option>
              {libraryOptions.map((e) => (
                <option key={e.id} value={e.id}>{e.ad_name}</option>
              ))}
            </select>
            {linkError ? <p className="text-xs" style={{ color: "#f87171" }}>{linkError}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="px-3 py-2 text-sm rounded-lg" style={{ color: "#94a3b8" }} onClick={() => setLinkTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={!linkLibraryId || linkSaving}
                className="px-4 py-2 rounded-lg text-sm font-semibold"
                style={{ background: "#f59e0b", color: "#0a1424", opacity: linkSaving ? 0.6 : 1 }}
                onClick={submitLink}
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

// ── Library ───────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  id: "",
  ad_name: "",
  ad_format: "",
  drive_url: "",
  angle_id: "",
  creative_created_at: todayIso(),
};

function AdLibrary({ libraryNav, onNavClear }: { libraryNav: LibraryNav; onNavClear: () => void }) {
  const [entries, setEntries] = useState<LibEntry[]>([]);
  const [angles, setAngles] = useState<Angle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM | null>(null);
  const [editAliases, setEditAliases] = useState<LibraryAlias[]>([]);
  const [newAlias, setNewAlias] = useState("");
  const [aliasError, setAliasError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [anglesOpen, setAnglesOpen] = useState(false);
  const [newAngleLabel, setNewAngleLabel] = useState("");
  const [addingAngle, setAddingAngle] = useState(false);
  const [showInlineAngle, setShowInlineAngle] = useState(false);

  const loadAngles = useCallback(() => {
    return fetch("/api/acquisition/ad-angles")
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load angles");
        return r.json();
      })
      .then((data: Angle[]) => setAngles(data))
      .catch(() => setAngles([]));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch("/api/acquisition/ad-library").then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error ?? "Failed to load");
        return r.json();
      }),
      loadAngles(),
    ])
      .then(([data]) => setEntries((data as LibEntry[]).map((e) => ({ ...e, aliases: e.aliases ?? [] }))))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [loadAngles]);

  useEffect(() => {
    load();
  }, [load]);

  const openEditForm = useCallback((e: LibEntry) => {
    setFormError(null);
    setAliasError(null);
    setNewAlias("");
    setShowInlineAngle(false);
    setEditAliases(e.aliases ?? []);
    setForm({
      id: e.id,
      ad_name: e.ad_name,
      ad_format: e.ad_format ?? "",
      drive_url: e.drive_url ?? "",
      angle_id: e.angle_id ?? "",
      creative_created_at: e.creative_created_at ?? todayIso(),
    });
  }, []);

  useEffect(() => {
    if (!libraryNav) return;
    if (libraryNav.prefillAdName && libraryNav.openForm) {
      setForm({ ...EMPTY_FORM, ad_name: libraryNav.prefillAdName });
      onNavClear();
      return;
    }
    if (libraryNav.libraryId) {
      const entry = entries.find((e) => e.id === libraryNav.libraryId);
      if (entry) openEditForm(entry);
      onNavClear();
    }
  }, [libraryNav, entries, onNavClear, openEditForm]);

  async function createAngle(label: string, selectAfter = false) {
    if (!label.trim()) return;
    setAddingAngle(true);
    const res = await fetch("/api/acquisition/ad-angles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: label.trim() }),
    });
    setAddingAngle(false);
    if (!res.ok) return;
    const created = await res.json();
    await loadAngles();
    if (selectAfter && form) setForm({ ...form, angle_id: created.id });
    setNewAngleLabel("");
    setShowInlineAngle(false);
  }

  async function addAlias() {
    if (!form?.id || !newAlias.trim()) return;
    setAliasError(null);
    const res = await fetch(`/api/acquisition/ad-library/${form.id}/aliases`, {
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
    await fetch(`/api/acquisition/ad-library/aliases/${aliasId}`, { method: "DELETE" });
    setEditAliases((prev) => prev.filter((a) => a.id !== aliasId));
    load();
  }

  async function saveForm() {
    if (!form) return;
    setSaving(true);
    setFormError(null);
    const isEdit = !!form.id;
    const res = await fetch(isEdit ? `/api/acquisition/ad-library/${form.id}` : "/api/acquisition/ad-library", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ad_name: form.ad_name,
        ad_format: form.ad_format || null,
        drive_url: form.drive_url || null,
        angle_id: form.angle_id || null,
        creative_created_at: form.creative_created_at || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setFormError((await res.json()).error ?? "Save failed");
      return;
    }
    setForm(null);
    load();
  }

  async function deleteEntry(id: string) {
    if (!confirm("Remove this ad from the library?")) return;
    await fetch(`/api/acquisition/ad-library/${id}`, { method: "DELETE" });
    load();
  }

  if (loading) return <p className="text-sm py-10 text-center" style={{ color: "#475569" }}>Loading library…</p>;
  if (error) return <p className="text-sm py-10 text-center" style={{ color: "#f87171" }}>{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "#f59e0b", color: "#0a1424" }}
          onClick={() => {
            setFormError(null);
            setForm({ ...EMPTY_FORM });
          }}
        >
          + Add ad
        </button>
        <button
          type="button"
          className="text-sm underline"
          style={{ color: "#94a3b8" }}
          onClick={() => setAnglesOpen((v) => !v)}
        >
          {anglesOpen ? "Hide angle settings" : "Angle settings"}
        </button>
      </div>

      {anglesOpen ? (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#475569" }}>Angles</p>
          {angles.length === 0 ? (
            <p className="text-xs" style={{ color: "#64748b" }}>No angles yet. Add one below or when uploading an ad.</p>
          ) : (
            <ul className="space-y-1">
              {angles.map((a) => (
                <li key={a.id} className="text-sm flex items-center justify-between" style={{ color: "#cbd5e1" }}>
                  <span>{a.label}</span>
                  <button
                    type="button"
                    className="text-[11px] underline"
                    style={{ color: "#64748b" }}
                    onClick={async () => {
                      await fetch(`/api/acquisition/ad-angles/${a.id}`, { method: "DELETE" });
                      loadAngles();
                    }}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <input
              value={newAngleLabel}
              onChange={(e) => setNewAngleLabel(e.target.value)}
              placeholder="New angle name"
              className={`flex-1 ${inputCls}`}
              style={inputStyle}
            />
            <button
              type="button"
              disabled={addingAngle || !newAngleLabel.trim()}
              className="px-3 py-2 rounded-lg text-sm font-medium"
              style={{ background: "rgba(255,255,255,0.08)", color: "#e2e8f0" }}
              onClick={() => createAngle(newAngleLabel)}
            >
              Add
            </button>
          </div>
        </div>
      ) : null}

      {entries.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "#475569" }}>
          No ads in the library yet. Add one with its Meta ad name and Google Drive link.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {entries.map((e) => (
            <div
              key={e.id}
              className="rounded-xl p-4 space-y-2"
              style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm" style={{ color: "#e2e8f0" }}>{e.ad_name}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: "#64748b" }}>
                    Created {e.creative_created_at ?? "—"}
                    {e.angle_label ? ` · ${e.angle_label}` : ""}
                    {e.ad_format ? ` · ${FORMAT_LABELS[e.ad_format] ?? e.ad_format}` : ""}
                  </p>
                </div>
                <button type="button" className="text-xs underline shrink-0" style={{ color: "#f59e0b" }} onClick={() => openEditForm(e)}>
                  Edit
                </button>
              </div>
              {e.drive_url ? (
                <a href={e.drive_url} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "#60a5fa" }}>
                  Open in Drive
                </a>
              ) : null}
              {(e.aliases ?? []).length > 0 ? (
                <p className="text-[10px]" style={{ color: "#64748b" }}>
                  Aliases: {(e.aliases ?? []).map((a) => a.alias_name).join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {form ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-lg rounded-xl p-5 space-y-4 my-8" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.08)" }}>
            <h3 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
              {form.id ? "Edit library ad" : "Add library ad"}
            </h3>
            <Field label="Ad name (Meta)">
              <input
                value={form.ad_name}
                onChange={(e) => setForm({ ...form, ad_name: e.target.value })}
                className={inputCls}
                style={inputStyle}
                placeholder="Exact Facebook ad name"
              />
            </Field>
            <Field label="Creative created">
              <input
                type="date"
                value={form.creative_created_at}
                onChange={(e) => setForm({ ...form, creative_created_at: e.target.value })}
                className={inputCls}
                style={inputStyle}
              />
            </Field>
            <Field label="Google Drive link">
              <input
                value={form.drive_url}
                onChange={(e) => setForm({ ...form, drive_url: e.target.value })}
                className={inputCls}
                style={inputStyle}
                placeholder="https://drive.google.com/..."
              />
            </Field>
            <Field label="Format">
              <select
                value={form.ad_format}
                onChange={(e) => setForm({ ...form, ad_format: e.target.value })}
                className={inputCls}
                style={inputStyle}
              >
                {FORMAT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Angle">
              <div className="space-y-2">
                <select
                  value={form.angle_id}
                  onChange={(e) => setForm({ ...form, angle_id: e.target.value })}
                  className={inputCls}
                  style={inputStyle}
                >
                  <option value="">Select angle…</option>
                  {angles.map((a) => (
                    <option key={a.id} value={a.id}>{a.label}</option>
                  ))}
                </select>
                {showInlineAngle ? (
                  <div className="flex gap-2">
                    <input
                      value={newAngleLabel}
                      onChange={(e) => setNewAngleLabel(e.target.value)}
                      placeholder="New angle"
                      className={`flex-1 ${inputCls}`}
                      style={inputStyle}
                    />
                    <button
                      type="button"
                      disabled={addingAngle}
                      className="px-3 py-2 rounded-lg text-xs"
                      style={{ background: "#f59e0b", color: "#0a1424" }}
                      onClick={() => createAngle(newAngleLabel, true)}
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-xs underline"
                    style={{ color: "#60a5fa" }}
                    onClick={() => setShowInlineAngle(true)}
                  >
                    + Add new angle
                  </button>
                )}
              </div>
            </Field>

            {form.id ? (
              <div className="space-y-2 pt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[11px] uppercase tracking-wider" style={{ color: "#475569" }}>Linked Meta ad names</p>
                {editAliases.length === 0 ? (
                  <p className="text-xs" style={{ color: "#64748b" }}>No aliases yet.</p>
                ) : (
                  <ul className="space-y-1">
                    {editAliases.map((a) => (
                      <li key={a.id} className="flex items-center justify-between text-xs" style={{ color: "#cbd5e1" }}>
                        <span className="truncate">{a.alias_name}</span>
                        <button type="button" className="underline ml-2 shrink-0" style={{ color: "#f87171" }} onClick={() => removeAlias(a.id)}>
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
                    placeholder="Facebook ad name variant"
                    className={`flex-1 ${inputCls}`}
                    style={inputStyle}
                  />
                  <button type="button" className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.08)", color: "#e2e8f0" }} onClick={addAlias}>
                    Add
                  </button>
                </div>
                {aliasError ? <p className="text-xs" style={{ color: "#f87171" }}>{aliasError}</p> : null}
              </div>
            ) : null}

            {formError ? <p className="text-xs" style={{ color: "#f87171" }}>{formError}</p> : null}

            <div className="flex justify-between pt-2">
              {form.id ? (
                <button type="button" className="text-sm underline" style={{ color: "#f87171" }} onClick={() => deleteEntry(form.id)}>
                  Delete
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" className="px-3 py-2 text-sm rounded-lg" style={{ color: "#94a3b8" }} onClick={() => setForm(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || !form.ad_name.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold"
                  style={{ background: "#f59e0b", color: "#0a1424", opacity: saving ? 0.6 : 1 }}
                  onClick={saveForm}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Shell ─────────────────────────────────────────────────────────────────────
export default function AcquisitionMarketing({ startDate, endDate }: Props) {
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
          onAddToLibrary={handleAddToLibrary}
          onViewInLibrary={handleViewInLibrary}
        />
      ) : (
        <AdLibrary libraryNav={libraryNav} onNavClear={() => setLibraryNav(null)} />
      )}
    </div>
  );
}
