"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

// The client "file": a single place to oversee everything about one client.
// Starts with the full profile + billing/revenue history; built so more
// sections (success reports, KPI history, notes) can be appended over time.

type FileBilling = {
  id: string;
  billed_on: string;
  due_date: string | null;
  amount: number;
  base_amount: number | null;
  performance_amount: number | null;
  late_fee: number | null;
  discount: number | null;
  passthrough_amount: number | null;
  amount_paid: number | null;
  status: string;
  paid_on: string | null;
  method: string | null;
  note: string | null;
  revenue_type: string | null;
  revenue_segment: string | null;
  lead_source: string | null;
  term_months: number | null;
  processing_fee: number | null;
  created_at: string;
};

type FileClient = {
  id: string;
  name: string;
  is_live: boolean | null;
  reporting_type: string | null;
  lifecycle_status: string | null;
  client_stage: string | null;
  mrr: number | null;
  billing_type: string | null;
  billing_day: number | null;
  launch_date: string | null;
  date_signed: string | null;
  contract_end_date: string | null;
  contract_term_months: number | null;
  daily_adspend: number | null;
  performance_terms: string | null;
  billing_email: string | null;
  primary_contact: string | null;
  primary_contact_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  website: string | null;
  brokerage_name: string | null;
  nmls: string | null;
  state: string | null;
  timezone: string | null;
  created_at: string | null;
  churned_at: string | null;
};

const STATUS_STYLE: Record<string, { color: string; bg: string }> = {
  paid: { color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  partial: { color: "#38bdf8", bg: "rgba(56,189,248,0.12)" },
  pending: { color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  overdue: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  failed: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  refunded: { color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
};

const REVENUE_TYPE_LABEL: Record<string, string> = {
  mrr: "Retainer",
  pif: "PIF",
  performance: "Performance",
  passthrough: "Passthrough",
};

function money(n: number | null | undefined): string {
  if (typeof n !== "number" || Number.isNaN(n)) return "—";
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export default function ClientFile({
  clientId, fallbackName, onClose,
}: {
  clientId: string;
  fallbackName: string;
  onClose: () => void;
}) {
  const [client, setClient] = useState<FileClient | null>(null);
  const [billings, setBillings] = useState<FileBilling[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/clients/${clientId}`)
      .then(r => r.json())
      .then(d => {
        if (!active) return;
        if (d.error) setError(d.error);
        else { setClient(d.client ?? null); setBillings(d.billings ?? []); }
        setLoading(false);
      })
      .catch(e => { if (active) { setError(String(e)); setLoading(false); } });
    return () => { active = false; };
  }, [clientId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const summary = useMemo(() => {
    let collected = 0, retainer = 0, performance = 0, passthrough = 0;
    let lastPaidOn: string | null = null;
    for (const b of billings) {
      collected += Number(b.amount_paid) || 0;
      retainer += Number(b.base_amount) || 0;
      performance += Number(b.performance_amount) || 0;
      passthrough += Number(b.passthrough_amount) || 0;
      if (b.paid_on && (!lastPaidOn || b.paid_on > lastPaidOn)) lastPaidOn = b.paid_on;
    }
    return { collected, retainer, performance, passthrough, count: billings.length, lastPaidOn };
  }, [billings]);

  const name = client?.name ?? fallbackName;
  const lifecycle = client?.lifecycle_status ?? "—";

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(2,6,15,0.6)" }} onClick={onClose}>
      <div
        className="h-full w-full overflow-y-auto"
        style={{ maxWidth: 760, background: "#060d1a", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Sticky header */}
        <div className="sticky top-0 z-10 px-6 py-4 flex items-start justify-between gap-4" style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>{name}</h2>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: "#cbd5e1", background: "rgba(148,163,184,0.12)" }}>{lifecycle}</span>
              {client && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={client.is_live ? { color: "#22c55e", background: "rgba(34,197,94,0.12)" } : { color: "#ef4444", background: "rgba(239,68,68,0.12)" }}>
                  {client.is_live ? "Live" : "Offline"}
                </span>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: "#475569" }}>Client file — profile &amp; full billing history</p>
          </div>
          <button onClick={onClose} className="text-xs font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap" style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
            Close ✕
          </button>
        </div>

        {loading ? (
          <p className="text-sm py-12 text-center" style={{ color: "#334155" }}>Loading file…</p>
        ) : error ? (
          <p className="text-sm py-12 text-center" style={{ color: "#ef4444" }}>{error}</p>
        ) : (
          <div className="px-6 py-5 space-y-7">
            {/* Overview */}
            <Section title="Overview">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                <Detail label="Primary contact" value={client?.primary_contact || client?.primary_contact_name} />
                <Detail label="Billing email" value={client?.billing_email} />
                <Detail label="Email" value={client?.email} />
                <Detail label="Phone" value={client?.phone} />
                <Detail label="Reporting type" value={client?.reporting_type} />
                <Detail label="Lead source" value={client?.source} />
                <Detail label="Brokerage" value={client?.brokerage_name} />
                <Detail label="NMLS" value={client?.nmls} />
                <Detail label="State" value={client?.state} />
              </div>
            </Section>

            {/* Billing config */}
            <Section title="Billing setup">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
                <Detail label="Billing type" value={billingTypeLabel(client?.billing_type)} />
                <Detail label="Monthly $ (base)" value={money(client?.mrr)} />
                <Detail label="Billing day" value={client?.billing_day ? `Day ${client.billing_day}` : "launch day"} />
                <Detail label="Launch date" value={client?.launch_date} />
                <Detail label="Date signed" value={client?.date_signed} />
                <Detail label="Contract term" value={client?.contract_term_months ? `${client.contract_term_months} mo` : null} />
                <Detail label="Contract end" value={client?.contract_end_date} />
                <Detail label="Daily ad spend" value={money(client?.daily_adspend)} />
                <Detail label="Churned" value={client?.churned_at} />
              </div>
              {client?.performance_terms && (
                <div className="mt-4">
                  <Detail label="Performance terms" value={client.performance_terms} wide />
                </div>
              )}
            </Section>

            {/* Billing & revenue history */}
            <Section title={`Billing & revenue history (${summary.count})`}>
              <div className="flex gap-3 flex-wrap mb-4">
                <Chip label="Total collected" value={money(summary.collected)} color="#38bdf8" />
                <Chip label="Retainer" value={money(summary.retainer)} color="#22c55e" />
                <Chip label="Performance" value={money(summary.performance)} color="#a78bfa" />
                {summary.passthrough > 0 && <Chip label="Passthrough" value={money(summary.passthrough)} color="#64748b" />}
                <Chip label="Last payment" value={summary.lastPaidOn ?? "—"} color="#cbd5e1" />
              </div>

              {billings.length === 0 ? (
                <p className="text-sm py-6 text-center" style={{ color: "#334155" }}>No billings logged for this client yet.</p>
              ) : (
                <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr style={{ background: "#0a1628" }}>
                        {["Date", "Type", "Cash", "Amount", "Status", "Method"].map((h, i) => (
                          <th key={i} className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "#334155" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {billings.map((b, i) => {
                        const st = STATUS_STYLE[b.status] ?? STATUS_STYLE.pending;
                        const isPassthrough = b.revenue_type === "passthrough";
                        const cash = isPassthrough ? Number(b.passthrough_amount) || 0 : Number(b.amount_paid) || 0;
                        const typeLabel = b.revenue_type ? REVENUE_TYPE_LABEL[b.revenue_type] ?? b.revenue_type : "—";
                        const seg = b.revenue_segment === "front_end" ? "new" : b.revenue_segment === "back_end" ? "recurring" : null;
                        return (
                          <tr key={b.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#cbd5e1" }}>
                              {b.paid_on ?? b.billed_on}
                              {b.note && <div className="text-xs mt-0.5" style={{ color: "#334155" }}>{b.note}</div>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              <span style={{ color: "#e2e8f0" }}>{typeLabel}</span>
                              {seg && <span className="ml-1.5 text-xs" style={{ color: "#475569" }}>· {seg}</span>}
                              {b.lead_source && <div className="text-xs mt-0.5" style={{ color: "#475569" }}>{b.lead_source}</div>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: isPassthrough ? "#64748b" : "#38bdf8" }}>{money(cash)}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#e2e8f0" }}>{money(b.amount)}</td>
                            <td className="px-3 py-2.5"><span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ color: st.color, background: st.bg }}>{b.status}</span></td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>{b.method ?? "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  );
}

function billingTypeLabel(t: string | null | undefined): string {
  if (!t) return "Monthly (default)";
  if (t === "pif") return "PIF";
  if (t === "pif_monthly") return "PIF + Monthly";
  return "Monthly";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wider mb-3" style={{ color: "#cbd5e1" }}>{title}</h3>
      {children}
    </section>
  );
}

function Detail({ label, value, wide }: { label: string; value: ReactNode; wide?: boolean }) {
  const display = value === null || value === undefined || value === "" || value === "—" ? "—" : value;
  return (
    <div className={wide ? "col-span-2 md:col-span-3" : undefined}>
      <p className="text-xs uppercase tracking-wider mb-0.5" style={{ color: "#475569" }}>{label}</p>
      <p className="text-sm" style={{ color: display === "—" ? "#334155" : "#e2e8f0" }}>{display}</p>
    </div>
  );
}

function Chip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs uppercase tracking-wider" style={{ color: "#475569" }}>{label}</p>
      <p className="text-base font-bold" style={{ color }}>{value}</p>
    </div>
  );
}
