"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_REPORTING_TYPE, normalizeReportingType, type ReportingType } from "@/lib/kpi-layouts";

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
  contract_term_months?: number | null;
  contract_end_date?: string | null;
  performance_terms?: string | null;
  billing_email?: string | null;
  primary_contact?: string | null;
  total_paid?: number;
};

const LIFECYCLE_OPTIONS = ["new_account", "onboarding", "active", "paused", "off_boarding", "churned"];

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
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

export default function ClientRoster() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    fetch("/api/clients?detail=1")
      .then(r => r.json())
      .then(d => { setClients(d.clients ?? []); setLoading(false); });
  }, []);

  async function reload() {
    const d = await (await fetch("/api/clients?detail=1")).json();
    setClients(d.clients ?? []);
  }

  async function patchClient(id: string, body: Record<string, unknown>) {
    setBusy(id);
    await fetch(`/api/clients/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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

  const stats = useMemo(() => {
    const live = clients.filter(c => c.is_live).length;
    const totalMrr = clients.reduce((s, c) => s + (c.is_live && typeof c.mrr === "number" ? c.mrr : 0), 0);
    const totalPaid = clients.reduce((s, c) => s + (c.total_paid ?? 0), 0);
    return { live, offline: clients.length - live, total: clients.length, totalMrr, totalPaid };
  }, [clients]);

  if (loading) return <p className="text-sm py-8 text-center" style={{ color: "#334155" }}>Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Client Roster</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            The master record for every client. Add new clients, edit any field inline, and fill in anything missing on existing ones. Billing reads launch date, MRR, and lifecycle from here.
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

      {showAdd && <AddClientForm busy={busy} onCreate={createClient} />}

      <div className="flex gap-4 flex-wrap">
        <Stat label="Live" value={String(stats.live)} color="#22c55e" />
        <Stat label="Offline" value={String(stats.offline)} color="#ef4444" />
        <Stat label="Total clients" value={String(stats.total)} color="#e2e8f0" />
        <Stat label="Active MRR" value={money(stats.totalMrr)} color="#22c55e" />
        <Stat label="Total collected" value={money(stats.totalPaid)} color="#38bdf8" />
      </div>

      <div className="rounded-xl overflow-x-auto" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="text-sm" style={{ minWidth: 1400 }}>
          <thead>
            <tr style={{ background: "#0a1628" }}>
              {["Client", "Contact", "Billing email", "Type", "Lifecycle", "Status", "Billing type", "MRR", "Billing day", "Launch", "Signed", "Term (mo)", "Contract end", "Performance terms", "Total paid", ""].map((h, i) => (
                <th key={i} className="text-left px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap" style={{ color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.length === 0 ? (
              <tr><td colSpan={16} className="px-4 py-8 text-center text-sm" style={{ color: "#334155" }}>No clients yet. Add one above.</td></tr>
            ) : clients.map((c, i) => (
              <ClientRow
                key={c.id}
                client={c}
                striped={i % 2 === 0}
                busy={busy === c.id}
                confirmingDelete={confirmDelete === c.id}
                onPatch={patchClient}
                onAskDelete={() => setConfirmDelete(c.id)}
                onCancelDelete={() => setConfirmDelete(null)}
                onDelete={() => handleDelete(c.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs" style={{ color: "#334155" }}>
        Offline clients are excluded when using the &ldquo;Live Clients&rdquo; filter on the dashboard. Pausing or churning a client is best done from the Client Billing tab so the schedule updates too.
      </p>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-4 flex-1 min-w-[120px]" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs uppercase tracking-wider mb-1" style={{ color: "#475569" }}>{label}</p>
      <p className="text-xl font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function ClientRow({
  client, striped, busy, confirmingDelete, onPatch, onAskDelete, onCancelDelete, onDelete,
}: {
  client: Client;
  striped: boolean;
  busy: boolean;
  confirmingDelete: boolean;
  onPatch: (id: string, body: Record<string, unknown>) => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const c = client;
  const rowBg = striped ? "#080f1e" : "#060d1a";
  const cell = "px-3 py-2 whitespace-nowrap";

  // Commit a text/number field only if it actually changed.
  const onBlurField = (field: string, current: string) => (e: React.FocusEvent<HTMLInputElement>) => {
    if (e.target.value !== current) onPatch(c.id, { [field]: e.target.value });
  };

  return (
    <tr style={{ background: rowBg, borderTop: "1px solid rgba(255,255,255,0.04)" }}>
      <td className={cell}>
        <input defaultValue={c.name ?? ""} disabled={busy} onBlur={onBlurField("name", c.name ?? "")} className="px-2 py-1 rounded-lg text-sm outline-none w-44 font-medium" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input defaultValue={c.primary_contact ?? ""} disabled={busy} onBlur={onBlurField("primary_contact", c.primary_contact ?? "")} placeholder="—" className="px-2 py-1 rounded-lg text-sm outline-none w-36" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input defaultValue={c.billing_email ?? ""} disabled={busy} onBlur={onBlurField("billing_email", c.billing_email ?? "")} placeholder="—" className="px-2 py-1 rounded-lg text-sm outline-none w-48" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <select value={normalizeReportingType(c.reporting_type)} disabled={busy} onChange={e => onPatch(c.id, { reporting_type: normalizeReportingType(e.target.value) })} className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer" style={fieldStyle()}>
          <option value="RM">RM - Reverse Mortgage</option>
          <option value="HE">HE - Appointment Only</option>
        </select>
      </td>
      <td className={cell}>
        <select value={c.lifecycle_status ?? "active"} disabled={busy} onChange={e => onPatch(c.id, { lifecycle_status: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer" style={fieldStyle()}>
          {LIFECYCLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>
      <td className={cell}>
        <button
          onClick={() => onPatch(c.id, { is_live: !c.is_live })}
          disabled={busy}
          className="px-3 py-1 rounded-full text-xs font-semibold"
          style={c.is_live
            ? { color: "#22c55e", background: "rgba(34,197,94,0.1)", opacity: busy ? 0.5 : 1 }
            : { color: "#ef4444", background: "rgba(239,68,68,0.1)", opacity: busy ? 0.5 : 1 }}
        >
          {c.is_live ? "Live" : "Offline"}
        </button>
      </td>
      <td className={cell}>
        <select value={c.billing_type ?? ""} disabled={busy} onChange={e => onPatch(c.id, { billing_type: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none cursor-pointer" style={fieldStyle()}>
          <option value="">Monthly (default)</option>
          <option value="monthly">Monthly</option>
          <option value="pif">PIF</option>
          <option value="pif_monthly">PIF + Monthly</option>
        </select>
      </td>
      <td className={cell}>
        <input type="number" defaultValue={c.mrr ?? ""} disabled={busy} onBlur={onBlurField("mrr", String(c.mrr ?? ""))} placeholder="0" className="px-2 py-1 rounded-lg text-sm outline-none w-24" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input type="number" min={1} max={31} defaultValue={c.billing_day ?? ""} disabled={busy} onBlur={onBlurField("billing_day", String(c.billing_day ?? ""))} placeholder="—" title="Day of month (1-31)" className="px-2 py-1 rounded-lg text-sm outline-none w-16" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input type="date" value={c.launch_date ?? ""} disabled={busy} onChange={e => onPatch(c.id, { launch_date: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input type="date" value={c.date_signed ?? ""} disabled={busy} onChange={e => onPatch(c.id, { date_signed: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input type="number" defaultValue={c.contract_term_months ?? ""} disabled={busy} onBlur={onBlurField("contract_term_months", String(c.contract_term_months ?? ""))} placeholder="—" className="px-2 py-1 rounded-lg text-sm outline-none w-20" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input type="date" value={c.contract_end_date ?? ""} disabled={busy} onChange={e => onPatch(c.id, { contract_end_date: e.target.value })} className="px-2 py-1 rounded-lg text-xs outline-none" style={fieldStyle()} />
      </td>
      <td className={cell}>
        <input defaultValue={c.performance_terms ?? ""} disabled={busy} onBlur={onBlurField("performance_terms", c.performance_terms ?? "")} placeholder="—" className="px-2 py-1 rounded-lg text-sm outline-none w-56" style={fieldStyle()} />
      </td>
      <td className={cell} style={{ color: "#38bdf8" }}>{money(c.total_paid ?? 0)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {confirmingDelete ? (
          <span className="flex items-center justify-end gap-2">
            <button onClick={onDelete} disabled={busy} className="text-xs font-semibold px-2 py-1 rounded" style={{ color: "#ef4444", background: "rgba(239,68,68,0.12)" }}>Confirm</button>
            <button onClick={onCancelDelete} className="text-xs" style={{ color: "#475569" }}>Cancel</button>
          </span>
        ) : (
          <button onClick={onAskDelete} className="text-xs" style={{ color: "#334155" }}>Remove</button>
        )}
      </td>
    </tr>
  );
}

function AddClientForm({
  busy, onCreate,
}: {
  busy: string | null;
  onCreate: (body: Record<string, unknown>) => void;
}) {
  const [name, setName] = useState("");
  const [primaryContact, setPrimaryContact] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
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
      primary_contact: primaryContact,
      billing_email: billingEmail,
      reporting_type: reportingType,
      lifecycle_status: lifecycle,
      is_live: lifecycle === "active",
      billing_type: billingType,
      mrr,
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
        <Field label="Name"><input value={name} onChange={e => setName(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        <Field label="Primary contact"><input value={primaryContact} onChange={e => setPrimaryContact(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
        <Field label="Billing email"><input value={billingEmail} onChange={e => setBillingEmail(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
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
        <Field label="Monthly $ (base)"><input type="number" value={mrr} onChange={e => setMrr(e.target.value)} className="px-2 py-1.5 rounded-lg text-sm outline-none" style={fieldStyle()} /></Field>
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
