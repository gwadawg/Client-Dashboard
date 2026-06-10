"use client";

import { useEffect, useState, type ReactNode } from "react";
import ClientFile from "@/components/ClientFile";
import KickOffCallWizard from "@/components/KickOffCallWizard";
import StatesLicensedSelect from "@/components/StatesLicensedSelect";
import TimezoneSelect from "@/components/TimezoneSelect";
import { isKickoffIncomplete, isKickoffLifecycle } from "@/lib/kickoff";
import { DEFAULT_REPORTING_TYPE, normalizeReportingType, type ReportingType } from "@/lib/kpi-layouts";
import {
  DEFAULT_KPI_BANDS,
  KPI_META,
  type ClientKpiBenchmarks,
  type KpiKey,
} from "@/lib/client-health";

type Client = {
  id: string;
  name: string;
  is_live?: boolean;
  reporting_type?: ReportingType;
  lifecycle_status?: string | null;
  mrr?: number | null;
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

const KPI_ORDER: KpiKey[] = [
  "lead_to_qualified", "pickup_rate", "booking_rate", "show_rate", "close_rate", "cpl", "cpql", "cps",
];
const BAND_KEYS: (keyof NonNullable<ClientKpiBenchmarks[KpiKey]>)[] = ["critical", "below", "at"];
const BAND_LABEL: Record<string, string> = { critical: "911 / critical", below: "Below KPI", at: "At KPI" };

const ROSTER_SECTIONS = [
  { key: "onboarding", label: "Onboarding", statuses: ["new_account", "onboarding"] },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "paused", label: "Paused / Off-boarding", statuses: ["paused", "off_boarding"] },
  { key: "churned", label: "Churned", statuses: ["churned"] },
] as const;

type SectionKey = (typeof ROSTER_SECTIONS)[number]["key"];

const ROSTER_COLS = 9;

const ROSTER_HEADERS = [
  "Sub-account name",
  "Client name",
  "Licensed in",
  "Timezone",
  "Signed",
  "Launch",
  "Churned",
  "ClickUp",
  "",
] as const;

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
  const [showAdd, setShowAdd] = useState(false);
  const [benchmarksFor, setBenchmarksFor] = useState<string | null>(null);
  const [fileFor, setFileFor] = useState<{ id: string; name: string; scrollToNotes?: boolean; scrollToCalls?: boolean; openCheckinForm?: boolean } | null>(null);
  const [kickoffFor, setKickoffFor] = useState<{ id: string; name: string } | null>(null);
  const [showRevenue, setShowRevenue] = useState(initialCanViewRevenue);

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

  async function createClient(body: Record<string, unknown>) {
    setBusy("create");
    const res = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.client) {
      await reload();
      setShowAdd(false);
    }
    setBusy(null);
  }

  async function handleDelete(id: string) {
    setBusy(id);
    await fetch("/api/clients", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setClients(prev => prev.filter(x => x.id !== id));
    setConfirmDelete(null);
    setBusy(null);
  }

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  const grouped = groupClientsBySection(clients);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Roster</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Clients are grouped by lifecycle status. The table shows glance fields only — open a client&rsquo;s file for contact info, billing, GHL setup, and lifecycle changes.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(s => !s)}
          className="text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap"
          style={{ color: "#22c55e", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.25)" }}
        >
          {showAdd ? "Close" : "+ Add client"}
        </button>
      </div>

      {showAdd && <AddClientForm busy={busy} showRevenue={showRevenue} onCreate={createClient} />}

      {clients.length === 0 ? (
        <div className="rounded-xl px-4 py-8 text-center text-sm" style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#334155" }}>
          No clients yet. Add one above.
        </div>
      ) : (
        <div className="space-y-8">
          {ROSTER_SECTIONS.map(section => {
            const sectionClients = grouped[section.key];
            return (
              <section key={section.key}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "#94a3b8" }}>
                  {section.label} ({sectionClients.length})
                </h3>
                <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="text-sm w-full">
                    <thead>
                      <tr style={{ background: "#0a1628" }}>
                        {ROSTER_HEADERS.map((h, i) => (
                          <th
                            key={i}
                            className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                            style={{ color: "#334155" }}
                            title={h === "Sub-account name" ? "GHL sub-account name — matches the client filter on the dashboard" : undefined}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sectionClients.length === 0 ? (
                        <tr>
                          <td colSpan={ROSTER_COLS} className="px-4 py-4 text-center text-sm" style={{ color: "#334155" }}>
                            No clients
                          </td>
                        </tr>
                      ) : (
                        sectionClients.map((c, i) => (
                          <ClientRow
                            key={c.id}
                            client={c}
                            striped={i % 2 === 0}
                            busy={busy === c.id}
                            confirmingDelete={confirmDelete === c.id}
                            benchmarksOpen={benchmarksFor === c.id}
                            onPatch={patchClient}
                            onOpenFile={() => setFileFor({ id: c.id, name: c.name })}
                            onOpenKickoff={() => setKickoffFor({ id: c.id, name: c.name })}
                            onOpenNotes={() => setFileFor({ id: c.id, name: c.name, scrollToNotes: true })}
                            onOpenCalls={() => setFileFor({ id: c.id, name: c.name, scrollToCalls: true })}
                            onLogCheckin={() => setFileFor({ id: c.id, name: c.name, scrollToCalls: true, openCheckinForm: true })}
                            onToggleBenchmarks={() => setBenchmarksFor(prev => (prev === c.id ? null : c.id))}
                            onAskDelete={() => setConfirmDelete(c.id)}
                            onCancelDelete={() => setConfirmDelete(null)}
                            onDelete={() => handleDelete(c.id)}
                          />
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })}
        </div>
      )}

      <p className="text-xs" style={{ color: "#334155" }}>
        Offline clients are excluded when using the &ldquo;Live Clients&rdquo; filter on the dashboard. Open a client&rsquo;s file to oversee their full billing history. Pausing or churning a client is best done from the Client Billing tab so the schedule updates too.
      </p>

      {kickoffFor && (
        <KickOffCallWizard
          clientId={kickoffFor.id}
          fallbackName={kickoffFor.name}
          onClose={() => setKickoffFor(null)}
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
  client, striped, busy, confirmingDelete, benchmarksOpen, onPatch, onOpenFile, onOpenKickoff, onOpenNotes, onOpenCalls, onLogCheckin, onToggleBenchmarks, onAskDelete, onCancelDelete, onDelete,
}: {
  client: Client;
  striped: boolean;
  busy: boolean;
  confirmingDelete: boolean;
  benchmarksOpen: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onOpenFile: () => void;
  onOpenKickoff: () => void;
  onOpenNotes: () => void;
  onOpenCalls: () => void;
  onLogCheckin: () => void;
  onToggleBenchmarks: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const c = client;
  const rowBg = striped ? "#080f1e" : "#060d1a";
  const cell = "px-3 py-2 whitespace-nowrap";
  const clientName = c.primary_contact_name ?? c.primary_contact ?? "";
  const hasOverrides = !!c.kpi_benchmarks && Object.keys(c.kpi_benchmarks).length > 0;
  const stale = benchmarksStale(c);
  const kickoffPending = isKickoffIncomplete(c, null);
  const showKickoffAction = isKickoffLifecycle(c.lifecycle_status) || kickoffPending;
  const benchmarkColor = benchmarksOpen ? "#38bdf8" : stale ? "#f59e0b" : hasOverrides ? "#38bdf8" : "#475569";
  const benchmarkLabel = benchmarksOpen
    ? "Close bands"
    : stale
      ? "● KPI bands ⚠"
      : hasOverrides
        ? "● KPI bands"
        : "KPI bands";

  const onBlurField = (field: string, current: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value !== current) onPatch(c.id, { [field]: e.target.value });
  };

  return (
    <>
    <tr style={{ background: rowBg, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <td className={cell}>
        <input
          defaultValue={c.name ?? ""}
          disabled={busy}
          onBlur={onBlurField("name", c.name ?? "")}
          placeholder="GHL sub-account name"
          title="GHL sub-account name — what appears in the dashboard client filter"
          className="px-2 py-1 rounded-lg text-sm outline-none w-36 font-medium"
          style={fieldStyle()}
        />
      </td>
      <td className={cell}>
        <input
          defaultValue={clientName}
          disabled={busy}
          onBlur={(e) => {
            if (e.target.value !== clientName) onPatch(c.id, { primary_contact_name: e.target.value });
          }}
          placeholder="Client / contact name"
          title="The client's name (person or business contact)"
          className="px-2 py-1 rounded-lg text-sm outline-none w-32"
          style={fieldStyle()}
        />
      </td>
      <td className={cell}>
        <StatesLicensedSelect
          value={c.states_licensed}
          disabled={busy}
          onChange={codes => onPatch(c.id, { states_licensed: codes })}
        />
      </td>
      <td className={cell}>
        <TimezoneSelect
          value={c.timezone}
          disabled={busy}
          onChange={tz => onPatch(c.id, { timezone: tz })}
        />
      </td>
      <td className={cell}>
        <input type="date" value={c.date_signed ?? ""} disabled={busy} onChange={e => onPatch(c.id, { date_signed: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input type="date" value={c.launch_date ?? ""} disabled={busy} onChange={e => onPatch(c.id, { launch_date: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <span className="text-xs" style={{ color: c.churned_at ? "#94a3b8" : "#334155" }}>
          {formatDate(c.churned_at)}
        </span>
      </td>
      <td className={cell}>
        {c.clickup_task_id ? (
          <a
            href={`https://app.clickup.com/t/${c.clickup_task_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-mono underline"
            style={{ color: "#38bdf8" }}
            title="Open ClickUp Client Hub task"
          >
            {c.clickup_task_id.slice(0, 8)}…
          </a>
        ) : (
          <span className="text-xs" style={{ color: "#334155" }}>—</span>
        )}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {confirmingDelete ? (
          <span className="flex items-center justify-end gap-2">
            <button onClick={onDelete} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded" style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)" }}>Confirm</button>
            <button onClick={onCancelDelete} className="text-xs" style={{ color: "#475569" }}>Cancel</button>
          </span>
        ) : (
          <span className="flex items-center justify-end gap-3">
            {showKickoffAction && (
              <button
                onClick={onOpenKickoff}
                className="text-xs font-semibold flex items-center gap-1.5"
                style={{ color: kickoffPending ? "#f59e0b" : "#22c55e" }}
                title={kickoffPending ? "Kick-off call incomplete — open wizard" : "Open kick-off call wizard"}
              >
                Kick-off
                {kickoffPending && (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full"
                    style={{ background: "#f59e0b" }}
                    aria-label="Kick-off incomplete"
                  />
                )}
              </button>
            )}
            <button onClick={onOpenFile} className="text-xs font-semibold" style={{ color: "#38bdf8" }} title="Open this client's file">Open file</button>
            <button onClick={onLogCheckin} className="text-xs font-semibold" style={{ color: "#38bdf8" }} title="Log a client check-in call">Check-in</button>
            <button onClick={onOpenCalls} className="text-xs font-semibold" style={{ color: "#f59e0b" }} title="Add or view account calls">Calls</button>
            <button onClick={onOpenNotes} className="text-xs font-semibold" style={{ color: "#a78bfa" }} title="Add or view client notes">Notes</button>
            <button
              onClick={onToggleBenchmarks}
              className="text-xs font-medium"
              style={{ color: benchmarkColor }}
              title={stale ? `Benchmarks last reviewed ${relativeAge(c.kpi_benchmarks_updated_at)} — review` : "Per-client KPI benchmark overrides"}
            >
              {benchmarkLabel}
            </button>
            <button onClick={onAskDelete} className="text-xs" style={{ color: "#334155" }}>Remove</button>
          </span>
        )}
      </td>
    </tr>
    {benchmarksOpen && (
      <tr style={{ background: "#050c18" }}>
        <td colSpan={ROSTER_COLS} className="px-4 py-4">
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
            {KPI_ORDER.map(kpi => {
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
  busy, showRevenue, onCreate,
}: {
  busy: string | null;
  showRevenue: boolean;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [email, setEmail] = useState("");
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
  const disabled = isBusy || !name.trim();

  function submit() {
    onCreate({
      name: name.trim(),
      primary_contact_name: clientName,
      email,
      reporting_type: reportingType,
      lifecycle_status: lifecycle,
      is_live: lifecycle === "active",
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
      <h3 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Add a new client</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Field label="Sub-account name (GHL)">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. James Office" className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} />
        </Field>
        <Field label="Client name">
          <input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="e.g. James Boisdenghein" className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} />
        </Field>
        <Field label="Email">
          <input value={email} onChange={e => setEmail(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none w-full" style={fieldStyle()} />
        </Field>
        <Field label="Reporting type">
          <select value={reportingType} onChange={e => setReportingType(normalizeReportingType(e.target.value))} className="px-2 py-1.5 rounded-lg text-sm outline-none cursor-pointer" style={fieldStyle()}>
            <option value="RM">RM - Reverse Mortgage</option>
            <option value="HE">HE - Appointment Only</option>
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
