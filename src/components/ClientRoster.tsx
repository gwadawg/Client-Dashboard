"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import ClientFile from "@/components/ClientFile";
import KickOffCallWizard from "@/components/KickOffCallWizard";
import LaunchChecklistWizard from "@/components/LaunchChecklistWizard";
import ChurnOffboardingWizard from "@/components/ChurnOffboardingWizard";
import PendingEventsPanel from "@/components/PendingEventsPanel";
import PendingFormSubmissionsPanel from "@/components/PendingFormSubmissionsPanel";
import Link from "next/link";
import { churnFormHref, isChurnOffboardEligible } from "@/lib/internal-forms";
import { FormProgressStrip } from "@/components/ClientFormsSection";
import LifecycleStatusSelect from "@/components/LifecycleStatusSelect";
import StatusChangeModal from "@/components/StatusChangeModal";
import { requiresLifecycleFeedback } from "@/lib/client-feedback";
import { isKickoffIncomplete, isKickoffLifecycle } from "@/lib/kickoff";
import { syncIsLiveWithLifecycle } from "@/lib/lifecycle-sync";
import { clientNeedsGhlMapping } from "@/lib/client-ghl-mapping";
import { DEFAULT_REPORTING_TYPE, normalizeReportingType, usesHeKpiLayout, type ReportingType } from "@/lib/kpi-layouts";
import { REPORTING_TYPE_META, REPORTING_TYPES } from "@/lib/reporting-types";
import ReportingTypeBadge, { ReportingTypeSelectOptions } from "@/components/ReportingTypeBadge";
import {
  DEFAULT_KPI_BANDS,
  HE_KPI_KEYS,
  KPI_META,
  RM_KPI_KEYS,
  type ClientKpiBenchmarks,
  type KpiKey,
} from "@/lib/client-health";

type DataSummary = {
  events: number;
  client_billings: number;
  client_calls: number;
  client_notes: number;
  total_rows: number;
};

type Client = {
  id: string;
  name: string;
  is_live?: boolean;
  reporting_type?: ReportingType;
  lifecycle_status?: string | null;
  mrr?: number | null;
  daily_adspend?: number | null;
  billing_type?: string | null;
  billing_day?: number | null;
  launch_date?: string | null;
  date_signed?: string | null;
  churned_at?: string | null;
  contract_term_months?: number | null;
  contract_end_date?: string | null;
  performance_terms?: string | null;
  billing_email?: string | null;
  email?: string | null;
  primary_contact?: string | null;
  primary_contact_name?: string | null;
  states_licensed?: string[] | null;
  timezone?: string | null;
  kpi_benchmarks?: ClientKpiBenchmarks | null;
  kpi_benchmarks_updated_at?: string | null;
  kpi_benchmarks_updated_by?: string | null;
  kpi_benchmarks_note?: string | null;
  clickup_task_id?: string | null;
  ghl_location_id?: string | null;
  total_paid?: number;
  form_progress?: Partial<Record<"new_client" | "onboarding" | "kickoff" | "launch", boolean>>;
};

/** Benchmark overrides untouched for this long are flagged for review. */
const BENCHMARK_STALE_DAYS = 90;

/** A client's bands need review if overridden but never stamped, or stamped > 90d ago. */
function benchmarksStale(c: Client): boolean {
  const has = !!c.kpi_benchmarks && Object.keys(c.kpi_benchmarks).length > 0;
  if (!has) return false;
  if (!c.kpi_benchmarks_updated_at) return true; // overridden but untracked
  const ageDays = (Date.now() - new Date(c.kpi_benchmarks_updated_at).getTime()) / 86_400_000;
  return ageDays > BENCHMARK_STALE_DAYS;
}

/** Compact "3d ago" / "2mo ago" relative label. */
function relativeAge(iso: string | null | undefined): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function kpiOrderForClient(client: Client): KpiKey[] {
  return usesHeKpiLayout(client.reporting_type) ? HE_KPI_KEYS : RM_KPI_KEYS;
}

const BAND_KEYS: (keyof NonNullable<ClientKpiBenchmarks[KpiKey]>)[] = ["critical", "below", "at"];
const BAND_LABEL: Record<string, string> = { critical: "911 / critical", below: "Below KPI", at: "At KPI" };

const ROSTER_SECTIONS = [
  { key: "onboarding", label: "Onboarding", statuses: ["new_account", "onboarding"] },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "paused", label: "Paused / Off-boarding", statuses: ["paused", "off_boarding"] },
  { key: "churned", label: "Churned", statuses: ["churned"] },
] as const;

type SectionKey = (typeof ROSTER_SECTIONS)[number]["key"];

/** Lifecycle accent per section — gives each zone a recognizable color anchor. */
const SECTION_ACCENT: Record<SectionKey, string> = {
  onboarding: "#38bdf8",
  active: "#22c55e",
  paused: "#f59e0b",
  churned: "#64748b",
};

/** Optional middle columns, swapped per role-based view preset. */
type ColumnKey = "stage" | "tenure" | "adspend" | "launch";

type RosterView = "full" | "cs" | "media";

const ROSTER_VIEWS: { key: RosterView; label: string }[] = [
  { key: "full", label: "Full" },
  { key: "cs", label: "Client Success" },
  { key: "media", label: "Media Buying" },
];

const VIEW_COLUMNS: Record<RosterView, ColumnKey[]> = {
  full: ["stage", "tenure", "adspend"],
  cs: ["stage", "tenure"],
  media: ["launch", "adspend", "tenure"],
};

function moneyShort(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

const COLUMN_DEFS: Record<ColumnKey, { header: string; revenueOnly?: boolean; render: (c: Client) => ReactNode }> = {
  stage: {
    header: "Stage",
    render: c => <FormProgressStrip progress={c.form_progress} />,
  },
  tenure: {
    header: "Tenure",
    render: c => {
      const t = tenureLabel(c);
      return <span className="text-xs whitespace-nowrap" style={{ color: t.muted ? "#64748b" : "#cbd5e1" }} title={t.title}>{t.text}</span>;
    },
  },
  adspend: {
    header: "Ad spend",
    revenueOnly: true,
    render: c => <span className="text-xs whitespace-nowrap" style={{ color: c.daily_adspend != null ? "#cbd5e1" : "#334155" }}>{c.daily_adspend != null ? `${moneyShort(c.daily_adspend)}/day` : "—"}</span>,
  },
  launch: {
    header: "Launch",
    render: c => <span className="text-xs whitespace-nowrap" style={{ color: c.launch_date ? "#cbd5e1" : "#334155" }}>{c.launch_date ? formatDate(c.launch_date) : "—"}</span>,
  },
};

/** Columns for a view, dropping revenue-only ones when the user can't see revenue. */
function resolveColumns(view: RosterView, showRevenue: boolean): ColumnKey[] {
  return VIEW_COLUMNS[view].filter(k => showRevenue || !COLUMN_DEFS[k].revenueOnly);
}

/** Whole calendar months elapsed since an ISO date (date-only safe). */
function monthsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * Tenure cell content: how long a client has been with us, framed by where
 * they are. Live clients show the month-of-engagement they're in; others show
 * how long they've sat in their current phase.
 */
function tenureLabel(c: Client): { text: string; title: string; muted: boolean } {
  const status = c.lifecycle_status ?? "active";
  if (status === "churned") {
    return { text: `Churned ${relativeAge(c.churned_at)}`, title: `Churned ${formatDate(c.churned_at)}`, muted: true };
  }
  const live = status === "active";
  const monthsLive = monthsSince(c.launch_date);
  if (live && monthsLive != null) {
    return {
      text: `Mo ${monthsLive + 1} live`,
      title: `Live since ${formatDate(c.launch_date)} · ${monthsLive} full month${monthsLive === 1 ? "" : "s"}`,
      muted: false,
    };
  }
  if (c.date_signed) {
    return { text: `Signed ${relativeAge(c.date_signed)}`, title: `Signed ${formatDate(c.date_signed)}`, muted: true };
  }
  return { text: "—", title: "No launch or signed date on file", muted: true };
}

function RosterColumnHead({ columns }: { columns: ColumnKey[] }) {
  const headers = ["Client", "Status", ...columns.map(k => COLUMN_DEFS[k].header), ""];
  return (
    <thead>
      <tr style={{ background: "#0a1628" }}>
        {headers.map((h, i) => (
          <th
            key={i}
            className={`sticky top-0 z-10 px-3 py-2.5 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${i === headers.length - 1 ? "text-right" : "text-left"}`}
            style={{
              color: "#475569",
              background: "#0a1628",
              boxShadow: "0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );
}

function RosterSectionRow({
  label,
  count,
  accent,
  colSpan,
}: {
  label: string;
  count: number;
  accent: string;
  colSpan: number;
}) {
  return (
    <tr style={{ background: "#080f1e" }}>
      <td
        colSpan={colSpan}
        className="px-3 py-2 border-t border-white/[0.08]"
        style={{ background: "#080f1e" }}
      >
        <span className="flex items-center gap-2">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: accent }} />
          <span className="text-sm font-semibold" style={{ color: "#cbd5e1" }}>{label}</span>
          <span
            className="text-xs font-semibold px-1.5 py-0.5 rounded-md"
            style={{ color: accent, background: `${accent}1a` }}
          >
            {count}
          </span>
        </span>
      </td>
    </tr>
  );
}

function clientSectionKey(c: Client): SectionKey {
  const status = c.lifecycle_status ?? "active";
  for (const section of ROSTER_SECTIONS) {
    if ((section.statuses as readonly string[]).includes(status)) return section.key;
  }
  return "active";
}

function groupClientsBySection(clients: Client[]): Record<SectionKey, Client[]> {
  const groups = Object.fromEntries(ROSTER_SECTIONS.map(s => [s.key, [] as Client[]])) as Record<SectionKey, Client[]>;
  for (const c of clients) {
    groups[clientSectionKey(c)].push(c);
  }
  for (const section of ROSTER_SECTIONS) {
    groups[section.key].sort((a, b) =>
      (a.name ?? "").localeCompare(b.name ?? "", undefined, { sensitivity: "base" }),
    );
  }
  return groups;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const datePart = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
    const [y, m, d] = datePart.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fieldStyle() {
  return { background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" } as const;
}

/** Searchable haystack for a client row. */
function clientMatchesQuery(c: Client, q: string): boolean {
  if (!q) return true;
  const hay = [
    c.name,
    c.primary_contact_name,
    c.primary_contact,
    c.clickup_task_id,
    ...(c.states_licensed ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>{label}</span>
      {children}
    </label>
  );
}

export default function ClientRoster({ canViewRevenue: initialCanViewRevenue = false }: { canViewRevenue?: boolean }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteSummary, setDeleteSummary] = useState<{ id: string; name: string; summary: DataSummary } | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [benchmarksFor, setBenchmarksFor] = useState<string | null>(null);
  const [fileFor, setFileFor] = useState<{ id: string; name: string; scrollToNotes?: boolean; scrollToCalls?: boolean; openCheckinForm?: boolean } | null>(null);
  const [kickoffFor, setKickoffFor] = useState<{ id: string; name: string } | null>(null);
  const [launchFor, setLaunchFor] = useState<{ id: string; name: string } | null>(null);
  const [offboardFor, setOffboardFor] = useState<{ id: string; name: string } | null>(null);
  const [showRevenue, setShowRevenue] = useState(initialCanViewRevenue);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<SectionKey | "all">("all");
  const [offerFilter, setOfferFilter] = useState<ReportingType | "all">("all");
  const [actionsFor, setActionsFor] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [statusChange, setStatusChange] = useState<{ clientId: string; clientName: string; targetStatus: string } | null>(null);
  const [rosterView, setRosterView] = useState<RosterView>(() => {
    if (typeof window === "undefined") return "full";
    const saved = window.localStorage.getItem("rosterView");
    return saved === "cs" || saved === "media" ? saved : "full";
  });

  useEffect(() => {
    fetch("/api/clients?detail=1")
      .then(r => r.json())
      .then(d => {
        setClients(d.clients ?? []);
        if (typeof d.can_view_revenue === "boolean") setShowRevenue(d.can_view_revenue);
        else if (typeof d.can_view_total_paid === "boolean") setShowRevenue(d.can_view_total_paid);
        setLoading(false);
      });
  }, []);

  function changeRosterView(v: RosterView) {
    setRosterView(v);
    window.localStorage.setItem("rosterView", v);
  }

  const columns = resolveColumns(rosterView, showRevenue);
  const colSpan = columns.length + 3;

  async function reload() {
    const d = await (await fetch("/api/clients?detail=1")).json();
    setClients(d.clients ?? []);
    if (typeof d.can_view_revenue === "boolean") setShowRevenue(d.can_view_revenue);
    else if (typeof d.can_view_total_paid === "boolean") setShowRevenue(d.can_view_total_paid);
  }

  async function patchClient(id: string, body: Record<string, unknown>) {
    setBusy(id);
    const res = await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Failed to update client");
    }
    await reload();
    setBusy(null);
  }

  function requestStatusChange(client: Client, target: string) {
    if (target === (client.lifecycle_status ?? "active")) return;
    if (target === "churned") {
      setOffboardFor({ id: client.id, name: client.name });
      return;
    }
    if (requiresLifecycleFeedback(target)) {
      setStatusChange({ clientId: client.id, clientName: client.name, targetStatus: target });
      return;
    }
    // Direct transition — is_live is derived server-side from lifecycle.
    patchClient(client.id, { lifecycle_status: target });
  }

  async function confirmStatusChange(reason: string | null, note: string) {
    if (!statusChange) return;
    const { clientId, targetStatus } = statusChange;
    await patchClient(clientId, {
      lifecycle_status: targetStatus,
      status_change_reason: reason,
      status_change_note: note || undefined,
    });
    setStatusChange(null);
  }

  async function createClient(body: Record<string, unknown>) {
    setBusy("create");
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d.error ?? "Failed to create client");
      setBusy(null);
      return;
    }
    if (d.client) {
      await reload();
      setShowAdd(false);
    }
    setBusy(null);
  }

  async function askDelete(client: Client) {
    setConfirmDelete(client.id);
    setDeleteSummary(null);
    setMergeTargetId("");
    const res = await fetch(`/api/clients/${client.id}/data-summary`);
    const d = await res.json().catch(() => ({}));
    if (d.summary) {
      setDeleteSummary({ id: client.id, name: client.name, summary: d.summary });
    }
  }

  function cancelDelete() {
    setConfirmDelete(null);
    setDeleteSummary(null);
    setMergeTargetId("");
  }

  async function handleMerge(sourceId: string) {
    if (!mergeTargetId) {
      alert("Choose the client file to keep before merging.");
      return;
    }
    setBusy(sourceId);
    const res = await fetch("/api/clients/merge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source_id: sourceId, target_id: mergeTargetId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d.error ?? "Merge failed");
      setBusy(null);
      return;
    }
    cancelDelete();
    await reload();
    setBusy(null);
  }

  async function handleDelete(id: string) {
    setBusy(id);
    const res = await fetch("/api/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error ?? "Failed to remove client");
      setBusy(null);
      return;
    }
    setClients(prev => prev.filter(x => x.id !== id));
    cancelDelete();
    setBusy(null);
  }

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  const q = query.trim().toLowerCase();
  const matched = clients.filter(c => {
    if (offerFilter !== "all" && normalizeReportingType(c.reporting_type) !== offerFilter) return false;
    if (!q) return true;
    return clientMatchesQuery(c, q);
  });
  const grouped = groupClientsBySection(matched);
  const counts = groupClientsBySection(clients);
  const isFiltering = q.length > 0 || statusFilter !== "all" || offerFilter !== "all";
  const visibleSections = ROSTER_SECTIONS.filter(s => statusFilter === "all" || s.key === statusFilter);
  const matchTotal = visibleSections.reduce((n, s) => n + grouped[s.key].length, 0);

  return (
    <div className="flex flex-col gap-6 min-h-0 flex-1 h-full">
      <div className="shrink-0 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Roster</h2>
          <div className="relative">
            <button
              onClick={() => setShowInfo(s => !s)}
              className="w-5 h-5 rounded-full text-xs font-semibold flex items-center justify-center"
              style={{ color: showInfo ? "#e2e8f0" : "#64748b", background: showInfo ? "rgba(255,255,255,0.08)" : "transparent", border: "1px solid rgba(255,255,255,0.12)" }}
              title="How the roster works"
              aria-label="How the roster works"
            >
              i
            </button>
            {showInfo && (
              <div
                className="absolute left-0 top-7 z-30 w-80 rounded-xl p-4 text-xs leading-relaxed shadow-xl"
                style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.12)", color: "#94a3b8" }}
              >
                <p>Clients are grouped by lifecycle status. The <strong style={{ color: "#cbd5e1" }}>sub-account name</strong> must match the GHL location name — that is how leads map in. The <strong style={{ color: "#cbd5e1" }}>client name</strong> is the person or business contact.</p>
                <p className="mt-2">Live clients (New account, Onboarding, Active) feed the dashboard&rsquo;s &ldquo;Live Clients&rdquo; filter. Paused, Off-boarding, and Churned are treated as offline.</p>
                <p className="mt-2">Open a client&rsquo;s file to edit details, log calls/notes, or run kick-off, launch, and offboarding. If you see duplicates, merge into the file you want to keep — do not delete a row that has reporting data.</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={churnFormHref()}
            className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
            style={{ color: "#f87171", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            Churn offboarding
          </Link>
          <button
            onClick={() => setShowAdd(true)}
            className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
            style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}
          >
            + Add client
          </button>
        </div>
      </div>

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8"
          style={{ background: "rgba(2,6,15,0.6)" }}
          onClick={() => setShowAdd(false)}
        >
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}>
            <AddClientForm busy={busy} showRevenue={showRevenue} onCreate={createClient} onCancel={() => setShowAdd(false)} />
          </div>
        </div>
      )}

      <div className="shrink-0 empty:hidden"><PendingFormSubmissionsPanel onResolved={reload} /></div>

      <div className="shrink-0 empty:hidden"><PendingEventsPanel onReplayed={reload} /></div>

      {clients.length === 0 ? (
        <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#334155" }}>
          No clients yet. Add one above.
        </div>
      ) : (
        <div
          className="flex flex-1 min-h-0 flex-col rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div
            className="shrink-0 flex items-center gap-3 flex-wrap px-3 py-2.5"
            style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="relative flex-1 min-w-[14rem]">
              <svg
                className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: "#475569" }}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14z" />
              </svg>
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search by sub-account, contact, state, or ClickUp ID…"
                className="w-full pl-9 pr-8 py-2 rounded-lg text-sm outline-none"
                style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-sm leading-none"
                  style={{ color: "#64748b" }}
                  title="Clear search"
                  aria-label="Clear search"
                >
                  ✕
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {([{ key: "all", label: "All" }, ...ROSTER_SECTIONS] as const).map(opt => {
                const isAll = opt.key === "all";
                const count = isAll ? clients.length : counts[opt.key as SectionKey].length;
                const active = statusFilter === opt.key;
                const accent = isAll ? "#94a3b8" : SECTION_ACCENT[opt.key as SectionKey];
                return (
                  <button
                    key={opt.key}
                    onClick={() => setStatusFilter(opt.key as SectionKey | "all")}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5"
                    style={{
                      color: active ? "#e2e8f0" : "#64748b",
                      background: active ? "rgba(255,255,255,0.07)" : "transparent",
                      border: `1px solid ${active ? "rgba(255,255,255,0.14)" : "transparent"}`,
                    }}
                  >
                    {!isAll && <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: accent }} />}
                    {opt.label}
                    <span style={{ color: active ? accent : "#475569" }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-1 flex-wrap" title="Filter by client offer type">
              <button
                onClick={() => setOfferFilter("all")}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors"
                style={{
                  color: offerFilter === "all" ? "#e2e8f0" : "#64748b",
                  background: offerFilter === "all" ? "rgba(255,255,255,0.07)" : "transparent",
                  border: `1px solid ${offerFilter === "all" ? "rgba(255,255,255,0.14)" : "transparent"}`,
                }}
              >
                All offers
              </button>
              {REPORTING_TYPES.map(type => {
                const active = offerFilter === type;
                const meta = REPORTING_TYPE_META[type];
                const count = clients.filter(c => normalizeReportingType(c.reporting_type) === type).length;
                return (
                  <button
                    key={type}
                    onClick={() => setOfferFilter(type)}
                    className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5"
                    style={{
                      color: active ? meta.color : "#64748b",
                      background: active ? meta.background : "transparent",
                      border: `1px solid ${active ? `${meta.color}55` : "transparent"}`,
                    }}
                    title={meta.description}
                  >
                    {meta.shortLabel}
                    <span style={{ color: active ? meta.color : "#475569" }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.1)" }} title="Choose which columns are most relevant to your role">
              {ROSTER_VIEWS.map(v => {
                const active = rosterView === v.key;
                return (
                  <button
                    key={v.key}
                    onClick={() => changeRosterView(v.key)}
                    className="text-xs font-medium px-2.5 py-1 rounded-md whitespace-nowrap transition-colors"
                    style={{
                      color: active ? "#e2e8f0" : "#64748b",
                      background: active ? "rgba(56,189,248,0.14)" : "transparent",
                    }}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isFiltering && (
            <p className="shrink-0 text-xs px-3 py-1.5" style={{ color: "#475569", background: "#080f1e" }}>
              {matchTotal === 0
                ? "No clients match your filters."
                : `Showing ${matchTotal} ${matchTotal === 1 ? "client" : "clients"}${q ? ` matching “${query.trim()}”` : ""}.`}
            </p>
          )}

          <div className="flex-1 min-h-0 overflow-auto" style={{ background: "#080f1e" }}>
            <table className="text-sm w-full min-w-[720px] border-separate border-spacing-0">
              <RosterColumnHead columns={columns} />
              <tbody>
                {visibleSections.map(section => {
                  const sectionClients = grouped[section.key];
                  if (isFiltering && sectionClients.length === 0) return null;
                  const accent = SECTION_ACCENT[section.key];
                  return (
                    <Fragment key={section.key}>
                      <RosterSectionRow
                        label={section.label}
                        count={sectionClients.length}
                        accent={accent}
                        colSpan={colSpan}
                      />
                      {sectionClients.length === 0 ? (
                        <tr className="bg-[#080f1e]">
                          <td colSpan={colSpan} className="px-4 py-6 text-center text-sm" style={{ color: "#334155" }}>
                            No clients in this group
                          </td>
                        </tr>
                      ) : (
                        sectionClients.map((c, i) => (
                          <ClientRow
                            key={c.id}
                            client={c}
                            allClients={clients}
                            columns={columns}
                            colSpan={colSpan}
                            striped={i % 2 === 0}
                            busy={busy === c.id}
                            confirmingDelete={confirmDelete === c.id}
                            deleteSummary={confirmDelete === c.id ? deleteSummary : null}
                            mergeTargetId={mergeTargetId}
                            onMergeTargetChange={setMergeTargetId}
                            benchmarksOpen={benchmarksFor === c.id}
                            actionsOpen={actionsFor === c.id}
                            onToggleActions={() => setActionsFor(prev => (prev === c.id ? null : c.id))}
                            onRequestStatusChange={target => requestStatusChange(c, target)}
                            onPatch={patchClient}
                            onOpenFile={() => setFileFor({ id: c.id, name: c.name })}
                            onOpenKickoff={() => setKickoffFor({ id: c.id, name: c.name })}
                            onOpenLaunch={() => setLaunchFor({ id: c.id, name: c.name })}
                            onOpenOffboard={() => setOffboardFor({ id: c.id, name: c.name })}
                            onOpenNotes={() => setFileFor({ id: c.id, name: c.name, scrollToNotes: true })}
                            onOpenCalls={() => setFileFor({ id: c.id, name: c.name, scrollToCalls: true })}
                            onLogCheckin={() => setFileFor({ id: c.id, name: c.name, scrollToCalls: true, openCheckinForm: true })}
                            onToggleBenchmarks={() => setBenchmarksFor(prev => (prev === c.id ? null : c.id))}
                            onAskDelete={() => askDelete(c)}
                            onCancelDelete={cancelDelete}
                            onMerge={() => handleMerge(c.id)}
                            onDelete={() => handleDelete(c.id)}
                          />
                        ))
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <StatusChangeModal
        open={!!statusChange}
        clientName={statusChange?.clientName ?? ""}
        targetStatus={statusChange?.targetStatus ?? "paused"}
        saving={!!statusChange && busy === statusChange.clientId}
        onConfirm={confirmStatusChange}
        onCancel={() => setStatusChange(null)}
      />

      {kickoffFor && (
        <KickOffCallWizard
          clientId={kickoffFor.id}
          fallbackName={kickoffFor.name}
          onClose={() => setKickoffFor(null)}
          onCompleted={reload}
        />
      )}

      {launchFor && (
        <LaunchChecklistWizard
          clientId={launchFor.id}
          fallbackName={launchFor.name}
          onClose={() => setLaunchFor(null)}
          onCompleted={reload}
        />
      )}

      {offboardFor && (
        <ChurnOffboardingWizard
          clientId={offboardFor.id}
          fallbackName={offboardFor.name}
          onClose={() => setOffboardFor(null)}
          onCompleted={reload}
        />
      )}

      {fileFor && (
        <ClientFile
          key={`${fileFor.id}-${fileFor.openCheckinForm ? "checkin" : fileFor.scrollToCalls ? "calls" : fileFor.scrollToNotes ? "notes" : "file"}`}
          clientId={fileFor.id}
          fallbackName={fileFor.name}
          scrollToNotes={fileFor.scrollToNotes}
          scrollToCalls={fileFor.scrollToCalls}
          openCheckinForm={fileFor.openCheckinForm}
          onClose={() => setFileFor(null)}
          onUpdated={reload}
        />
      )}
    </div>
  );
}

function ClientRow({
  client, allClients, striped, busy, confirmingDelete, deleteSummary, mergeTargetId, onMergeTargetChange,   columns, colSpan, benchmarksOpen, actionsOpen, onToggleActions, onRequestStatusChange, onPatch, onOpenFile, onOpenKickoff, onOpenLaunch, onOpenOffboard, onOpenNotes, onOpenCalls, onLogCheckin, onToggleBenchmarks, onAskDelete, onCancelDelete, onMerge, onDelete,
}: {
  client: Client;
  allClients: Client[];
  columns: ColumnKey[];
  colSpan: number;
  striped: boolean;
  busy: boolean;
  confirmingDelete: boolean;
  deleteSummary: { id: string; name: string; summary: DataSummary } | null;
  mergeTargetId: string;
  onMergeTargetChange: (id: string) => void;
  benchmarksOpen: boolean;
  actionsOpen: boolean;
  onToggleActions: () => void;
  onRequestStatusChange: (target: string) => void;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onOpenFile: () => void;
  onOpenKickoff: () => void;
  onOpenLaunch: () => void;
  onOpenOffboard: () => void;
  onOpenNotes: () => void;
  onOpenCalls: () => void;
  onLogCheckin: () => void;
  onToggleBenchmarks: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onMerge: () => void;
  onDelete: () => void;
}) {
  const c = client;
  const rowBg = striped ? "bg-[#0b1424]" : "bg-[#080f1e]";
  const cell = "px-3 py-2.5 align-middle";
  const clientName = c.primary_contact_name ?? c.primary_contact ?? "";
  const hasOverrides = !!c.kpi_benchmarks && Object.keys(c.kpi_benchmarks).length > 0;
  const stale = benchmarksStale(c);
  const kickoffPending = isKickoffIncomplete(c, null);
  const needsGhlMapping = clientNeedsGhlMapping(c);
  const showKickoffAction = isKickoffLifecycle(c.lifecycle_status) || kickoffPending;
  const showLaunchAction = c.lifecycle_status === "onboarding" || c.lifecycle_status === "new_account";
  const showOffboardAction = isChurnOffboardEligible(c.lifecycle_status);

  const status = c.lifecycle_status ?? "active";
  const derivedLive = syncIsLiveWithLifecycle(status, undefined);
  const drift = derivedLive !== undefined && c.is_live !== undefined && derivedLive !== c.is_live;

  return (
    <>
    <tr className={`${rowBg} border-t border-white/[0.05] transition-colors hover:bg-[#0f1c30]`}>
      <td className={cell}>
        <div className="flex flex-col gap-0.5 min-w-0">
            <span className="flex items-center gap-2 min-w-0">
            <ReportingTypeBadge value={c.reporting_type} />
            <span className="text-sm font-medium truncate max-w-[16rem]" style={{ color: clientName ? "#e2e8f0" : "#475569" }} title={clientName || "No client name set"}>
              {clientName || "Unnamed client"}
            </span>
            {needsGhlMapping && (
              <span
                className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                style={{ color: "#f59e0b", background: "rgba(245,158,11,0.12)" }}
                title="Sub-account name still matches the person name — open Kick-off and set the exact GHL location name"
              >
                Map GHL
              </span>
            )}
          </span>
          <span className="text-xs truncate max-w-[18rem]" style={{ color: "#64748b" }} title={`GHL sub-account: ${c.name ?? "—"}`}>
            {c.name || "—"}
          </span>
        </div>
      </td>
      <td className={cell}>
        <span className="flex items-center gap-1.5">
          <LifecycleStatusSelect value={status} disabled={busy} onRequestChange={onRequestStatusChange} />
          {kickoffPending && (
            <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#f59e0b" }} title="Kick-off call incomplete" />
          )}
          {drift && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
              style={{ color: c.is_live ? "#22c55e" : "#ef4444", background: c.is_live ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)" }}
              title={`Dashboard status manually overridden to ${c.is_live ? "Live" : "Offline"}, which differs from this lifecycle stage`}
            >
              {c.is_live ? "Live*" : "Offline*"}
            </span>
          )}
        </span>
      </td>
      {columns.map(key => (
        <td key={key} className={cell}>
          {COLUMN_DEFS[key].render(c)}
        </td>
      ))}
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {confirmingDelete ? (
          <div className="flex flex-col items-end gap-2 max-w-md ml-auto">
            {deleteSummary && deleteSummary.summary.total_rows > 0 && (
              <p className="text-xs text-right leading-relaxed" style={{ color: deleteSummary.summary.events > 0 ? "#f87171" : "#f59e0b" }}>
                {deleteSummary.summary.events > 0
                  ? `This row has ${deleteSummary.summary.events.toLocaleString()} lead/dial events. Removing it permanently deletes all reporting data.`
                  : `This row has ${deleteSummary.summary.total_rows.toLocaleString()} related records (billing, calls, notes).`}
                {" "}To combine duplicates, merge into the file you want to keep instead.
              </p>
            )}
            {deleteSummary && deleteSummary.summary.total_rows > 0 && (
              <label className="flex flex-col items-end gap-1 w-full">
                <span className="text-xs" style={{ color: "#64748b" }}>Merge into client file to keep</span>
                <select
                  value={mergeTargetId}
                  onChange={e => onMergeTargetChange(e.target.value)}
                  className="px-2 py-1 rounded-lg text-xs outline-none w-full max-w-xs"
                  style={fieldStyle()}
                >
                  <option value="">Select client…</option>
                  {allClients
                    .filter(x => x.id !== client.id)
                    .map(x => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                </select>
              </label>
            )}
            <span className="flex items-center justify-end gap-2 flex-wrap">
              {deleteSummary && deleteSummary.summary.total_rows > 0 && (
                <button
                  onClick={onMerge}
                  disabled={busy || !mergeTargetId}
                  className="text-xs font-semibold px-2 py-1 rounded"
                  style={{ color: "#22c55e", background: "rgba(34,197,94,0.12)" }}
                >
                  Merge
                </button>
              )}
              <button onClick={onDelete} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded" style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)" }}>Delete anyway</button>
              <button onClick={onCancelDelete} className="text-xs" style={{ color: "#475569" }}>Cancel</button>
            </span>
          </div>
        ) : (
          <span className="flex items-center justify-end gap-2">
            <button
              onClick={onOpenFile}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap transition-colors"
              style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }}
              title="Open this client's file"
            >
              Open
            </button>
            <button
              onClick={onToggleActions}
              className="text-sm font-semibold px-2 py-1 rounded-lg leading-none transition-colors"
              style={{
                color: actionsOpen ? "#e2e8f0" : "#64748b",
                background: actionsOpen ? "rgba(255,255,255,0.08)" : "transparent",
                border: `1px solid ${actionsOpen ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.08)"}`,
              }}
              title="More actions"
              aria-label="More actions"
              aria-expanded={actionsOpen}
            >
              ⋯
            </button>
          </span>
        )}
      </td>
    </tr>
    {actionsOpen && !confirmingDelete && (
      <tr style={{ background: "#050c18" }}>
        <td colSpan={colSpan} className="px-4 py-3 border-t border-white/[0.04]">
          <div className="flex items-center gap-x-4 gap-y-2 flex-wrap">
            {showKickoffAction && (
              <ActionButton onClick={onOpenKickoff} color={kickoffPending ? "#f59e0b" : "#22c55e"} title={kickoffPending ? "Kick-off call incomplete" : "Open kick-off call wizard"}>
                Kick-off{kickoffPending ? " ⚠" : ""}
              </ActionButton>
            )}
            {showLaunchAction && (
              <ActionButton onClick={onOpenLaunch} color="#34d399" title="Launch checklist — mark client live">Launch</ActionButton>
            )}
            {showOffboardAction && (
              <ActionButton onClick={onOpenOffboard} color="#f87171" title="Open churn offboarding form">Offboard</ActionButton>
            )}
            <span className="inline-block w-px h-4" style={{ background: "rgba(255,255,255,0.1)" }} aria-hidden />
            <ActionButton onClick={onLogCheckin} color="#38bdf8" title="Log a client check-in call">Check-in</ActionButton>
            <ActionButton onClick={onOpenCalls} color="#f59e0b" title="Add or view account calls">Calls</ActionButton>
            <ActionButton onClick={onOpenNotes} color="#a78bfa" title="Add or view client notes">Notes</ActionButton>
            <ActionButton
              onClick={onToggleBenchmarks}
              color={benchmarksOpen ? "#38bdf8" : stale ? "#f59e0b" : hasOverrides ? "#38bdf8" : "#94a3b8"}
              title={stale ? `Benchmarks last reviewed ${relativeAge(c.kpi_benchmarks_updated_at)} — review` : "Per-client KPI benchmark overrides"}
            >
              {benchmarksOpen ? "Close bands" : stale ? "KPI bands ⚠" : hasOverrides ? "KPI bands ●" : "KPI bands"}
            </ActionButton>
            {c.clickup_task_id && (
              <a
                href={`https://app.clickup.com/t/${c.clickup_task_id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold transition-colors hover:underline"
                style={{ color: "#38bdf8" }}
                title="Open ClickUp Client Hub task"
              >
                ClickUp ↗
              </a>
            )}
            <span className="ml-auto">
              <button onClick={onAskDelete} className="text-xs font-medium text-slate-500 hover:text-red-400 transition-colors">Remove client</button>
            </span>
          </div>
        </td>
      </tr>
    )}
    {benchmarksOpen && (
      <tr style={{ background: "#050c18" }}>
        <td colSpan={colSpan} className="px-4 py-4">
          <BenchmarkEditor
            client={c}
            busy={busy}
            onSave={(benchmarks, note) => onPatch(c.id, { kpi_benchmarks: benchmarks, kpi_benchmarks_note: note })}
          />
        </td>
      </tr>
    )}
    </>
  );
}

/** Compact text action used inside a row's expandable actions tray. */
function ActionButton({ onClick, color, title, children }: { onClick: () => void; color: string; title?: string; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-xs font-semibold transition-opacity hover:opacity-80"
      style={{ color }}
    >
      {children}
    </button>
  );
}

function BenchmarkEditor({
  client, busy, onSave,
}: {
  client: Client;
  busy: boolean;
  onSave: (benchmarks: ClientKpiBenchmarks | null, note: string | null) => void;
}) {
  const [draft, setDraft] = useState<ClientKpiBenchmarks>(() => structuredCopy(client.kpi_benchmarks));
  const [note, setNote] = useState<string>(client.kpi_benchmarks_note ?? "");
  const hasOverrides = !!client.kpi_benchmarks && Object.keys(client.kpi_benchmarks).length > 0;
  const stale = benchmarksStale(client);

  const setBand = (kpi: KpiKey, band: "critical" | "below" | "at", raw: string) => {
    setDraft(prev => {
      const next: ClientKpiBenchmarks = { ...prev, [kpi]: { ...(prev[kpi] ?? {}) } };
      const num = Number(raw);
      if (raw.trim() === "" || Number.isNaN(num)) {
        delete next[kpi]![band];
      } else {
        next[kpi]![band] = num;
      }
      if (next[kpi] && Object.keys(next[kpi]!).length === 0) delete next[kpi];
      return next;
    });
  };

  const overrideCount = Object.values(draft).reduce((n, b) => n + Object.keys(b ?? {}).length, 0);

  const kpiOrder = kpiOrderForClient(client);
  const isHe = usesHeKpiLayout(client.reporting_type);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            KPI benchmarks for {client.name}
          </p>
          <p className="text-xs mt-0.5 max-w-2xl" style={{ color: "#475569" }}>
            Leave a field blank to use the global default (shown as the placeholder). Overrides let you judge each
            client against its own bar — measurement stays identical, only the thresholds move.
            {isHe ? " HE clients grade booking (÷ total leads), show rate, and pickup only." : ""}
          </p>
          {hasOverrides && (
            <p className="text-xs mt-1" style={{ color: stale ? "#f59e0b" : "#64748b" }}>
              {stale ? "⚠ Needs review · " : ""}
              Last set {relativeAge(client.kpi_benchmarks_updated_at)}
              {client.kpi_benchmarks_note ? ` · “${client.kpi_benchmarks_note}”` : " · no reason recorded"}
              {stale ? ` (overrides untouched > ${BENCHMARK_STALE_DAYS}d — confirm they still hold)` : ""}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setDraft({}); setNote(""); onSave(null, null); }}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-lg"
            style={{ color: "#94a3b8", background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)" }}
          >
            Reset to defaults
          </button>
          <button
            onClick={() => onSave(overrideCount > 0 ? draft : null, overrideCount > 0 ? (note.trim() || null) : null)}
            disabled={busy}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", opacity: busy ? 0.5 : 1 }}
          >
            {busy ? "Saving…" : `Save${overrideCount ? ` (${overrideCount})` : ""}`}
          </button>
        </div>
      </div>

      <Field label="Reason for these overrides (recorded with your name + date)">
        <input
          value={note}
          onChange={e => setNote(e.target.value)}
          disabled={busy}
          placeholder="e.g. High-cost CA market — CPQL/CPConv bars raised vs global"
          className="px-2 py-1.5 rounded-lg text-xs outline-none w-full max-w-2xl"
          style={fieldStyle()}
        />
      </Field>

      <div className="overflow-x-auto">
        <table className="text-xs" style={{ minWidth: 640 }}>
          <thead>
            <tr style={{ color: "#334155" }}>
              <th className="text-left px-2 py-1 font-semibold uppercase tracking-wider">KPI</th>
              <th className="text-left px-2 py-1 font-semibold uppercase tracking-wider">Direction</th>
              {BAND_KEYS.map(b => (
                <th key={b} className="text-left px-2 py-1 font-semibold uppercase tracking-wider">{BAND_LABEL[b]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {kpiOrder.map(kpi => {
              const spec = DEFAULT_KPI_BANDS[kpi];
              return (
                <tr key={kpi} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                  <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: "#e2e8f0" }}>{KPI_META[kpi].label}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap" style={{ color: "#64748b" }}>
                    {spec.higherIsBetter ? "higher better" : "lower better"} · {spec.unit === "money" ? "$" : "%"}
                  </td>
                  {BAND_KEYS.map(band => (
                    <td key={band} className="px-2 py-1.5">
                      <input
                        type="number"
                        value={draft[kpi]?.[band] ?? ""}
                        placeholder={String(spec.bands[band] ?? "—")}
                        disabled={busy}
                        onChange={e => setBand(kpi, band, e.target.value)}
                        className="px-2 py-1 rounded-lg text-xs outline-none w-20"
                        style={fieldStyle()}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Shallow-clone the per-client overrides so the editor draft is isolated. */
function structuredCopy(b: ClientKpiBenchmarks | null | undefined): ClientKpiBenchmarks {
  const out: ClientKpiBenchmarks = {};
  if (!b) return out;
  for (const k of Object.keys(b) as KpiKey[]) {
    if (b[k]) out[k] = { ...b[k] };
  }
  return out;
}

function AddClientForm({
  busy, showRevenue, onCreate, onCancel,
}: {
  busy: string | null;
  showRevenue: boolean;
  onCreate: (body: Record<string, unknown>) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [reportingType, setReportingType] = useState<ReportingType>(DEFAULT_REPORTING_TYPE);
  const [lifecycle, setLifecycle] = useState("onboarding");
  const [billingType, setBillingType] = useState("");
  const [mrr, setMrr] = useState("");
  const [billingDay, setBillingDay] = useState("");
  const [launchDate, setLaunchDate] = useState("");
  const [dateSigned, setDateSigned] = useState("");
  const [contractTerm, setContractTerm] = useState("");
  const [contractEnd, setContractEnd] = useState("");
  const [performanceTerms, setPerformanceTerms] = useState("");

  const isBusy = busy === "create";
  const blocked = !!duplicateWarning;
  const disabled = isBusy || !name.trim() || blocked;

  useEffect(() => {
    if (!name.trim() && !clientName.trim() && !email.trim()) {
      setDuplicateWarning(null);
      return;
    }
    const timer = setTimeout(async () => {
      const params = new URLSearchParams();
      if (name.trim()) params.set("name", name.trim());
      if (clientName.trim()) params.set("primary_contact_name", clientName.trim());
      if (email.trim()) params.set("email", email.trim());
      const res = await fetch(`/api/clients/check-duplicate?${params}`);
      const d = await res.json().catch(() => ({}));
      setDuplicateWarning(d.blocked ? (d.message as string) : null);
    }, 350);
    return () => clearTimeout(timer);
  }, [name, clientName, email]);

  function submit() {
    onCreate({
      name: name.trim(),
      primary_contact_name: clientName,
      email,
      reporting_type: reportingType,
      lifecycle_status: lifecycle,
      is_live: lifecycle === "active" || lifecycle === "onboarding" || lifecycle === "new_account",
      billing_type: billingType,
      ...(showRevenue ? { mrr } : {}),
      billing_day: billingDay,
      launch_date: launchDate,
      date_signed: dateSigned,
      contract_term_months: contractTerm,
      contract_end_date: contractEnd,
      performance_terms: performanceTerms,
    });
  }

  return (
    <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a1628", border: "1px solid rgba(34,197,94,0.2)" }}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Add a new client</h3>
          <p className="text-xs mt-1 max-w-2xl" style={{ color: "#64748b" }}>
            Only use this if the client is not already in the roster from the New Client Form. If they signed up through the form, open their existing file and set the GHL sub-account name during kick-off.
          </p>
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0"
            style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            Close ✕
          </button>
        )}
      </div>
      {duplicateWarning && (
        <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}>
          {duplicateWarning}
        </p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Sub-account name (GHL)">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Ken Adler's Office" className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} />
        </Field>
        <Field label="Client name">
          <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. James Boisdenghein" className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} />
        </Field>
        <Field label="Email">
          <input value={email} onChange={e => setEmail(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} />
        </Field>
        <Field label="Reporting type">
          <select value={reportingType} onChange={e => setReportingType(normalizeReportingType(e.target.value))} className="px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer" style={fieldStyle()}>
            <ReportingTypeSelectOptions />
          </select>
        </Field>
        <Field label="Lifecycle">
          <select value={lifecycle} onChange={e => setLifecycle(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer" style={fieldStyle()}>
            <option value="onboarding">Onboarding</option>
            <option value="active">Active</option>
            <option value="new_account">New account</option>
          </select>
        </Field>
        <Field label="Billing type">
          <select value={billingType} onChange={e => setBillingType(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer" style={fieldStyle()}>
            <option value="">Monthly (default)</option>
            <option value="monthly">Monthly</option>
            <option value="pif">PIF</option>
            <option value="pif_monthly">PIF + Monthly</option>
          </select>
        </Field>
        {showRevenue && (
          <Field label="Monthly $ (base)"><input type="number" value={mrr} onChange={e => setMrr(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        )}
        <Field label="Billing day (1-31)"><input type="number" min={1} max={31} value={billingDay} onChange={e => setBillingDay(e.target.value)} placeholder="defaults to launch day" className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        <Field label="Launch date (billing anchor)"><input type="date" value={launchDate} onChange={e => setLaunchDate(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        <Field label="Date signed"><input type="date" value={dateSigned} onChange={e => setDateSigned(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        <Field label="Contract term (months)"><input type="number" value={contractTerm} onChange={e => setContractTerm(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        <Field label="Contract end"><input type="date" value={contractEnd} onChange={e => setContractEnd(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        <div className="col-span-2 md:col-span-4">
          <Field label="Performance terms (how perf pricing is calculated)"><input value={performanceTerms} onChange={e => setPerformanceTerms(e.target.value)} placeholder="e.g. $X per booked appointment over 20/mo" className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} /></Field>
        </div>
      </div>
      <button onClick={submit} disabled={disabled} className="text-xs font-semibold px-4 py-2 rounded-lg" style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)", opacity: disabled ? 0.5 : 1 }}>
        {isBusy ? "Creating…" : "Create client"}
      </button>
    </div>
  );
}
