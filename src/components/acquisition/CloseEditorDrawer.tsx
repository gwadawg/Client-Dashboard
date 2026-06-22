"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import {
  CLOSE_FIELD_LABELS,
  type CloseCompleteness,
} from "@/lib/acquisition-close-completeness";
import { REPORTING_TYPES } from "@/lib/reporting-types";

type ClientOption = { id: string; name: string; email?: string | null; phone?: string | null };
type LeadOffer = {
  id: string;
  offer_type: string;
  offered_at: string;
  is_closed: boolean;
  cash_collected: number | null;
  offered_by: string | null;
  setter_name: string | null;
};
type LeadSearchRow = { id: string; lead_name: string | null; email: string | null; phone: string | null };

type CloseDetail = {
  id: string;
  lead_id: string | null;
  offer_id: string | null;
  client_id: string | null;
  closed_at: string;
  cash_collected: number | null;
  offer_type: string | null;
  reporting_type: string | null;
  service_program: string | null;
  setter_name: string | null;
  offered_by: string | null;
  mapping_status: string | null;
  lead_name: string | null;
  lead_email: string | null;
  client_name: string | null;
  completeness: CloseCompleteness;
};

type Props = {
  closeId: string | null;
  onClose: () => void;
  onSaved: () => void;
};

const DEFAULT_PACKAGES = [
  { code: "core_offer", label: "Core Offer" },
  { code: "mid_offer", label: "Mid Offer" },
  { code: "skool", label: "Skool" },
];

const inputStyle: CSSProperties = {
  background: "#0f2040",
  color: "#e2e8f0",
  border: "1px solid rgba(255,255,255,0.12)",
};

function CompletenessBadge({ completeness }: { completeness: CloseCompleteness }) {
  if (completeness.status === "complete") {
    return (
      <span
        className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
        style={{ background: "rgba(34,197,94,0.15)", color: "#22c55e" }}
      >
        Complete
      </span>
    );
  }
  if (completeness.status === "critical") {
    return (
      <span
        className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
        style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}
      >
        Critical gaps
      </span>
    );
  }
  return (
    <span
      className="px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
      style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}
    >
      Needs review
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium mb-1" style={{ color: "#64748b" }}>
      {children}
    </label>
  );
}

export default function CloseEditorDrawer({ closeId, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [leadOffers, setLeadOffers] = useState<LeadOffer[]>([]);
  const [closerFormUrl, setCloserFormUrl] = useState<string | null>(null);
  const [closerFormDone, setCloserFormDone] = useState(false);
  const [completeness, setCompleteness] = useState<CloseCompleteness | null>(null);

  const [leadId, setLeadId] = useState("");
  const [leadLabel, setLeadLabel] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadSearchRow[]>([]);
  const [clientId, setClientId] = useState("");
  const [offerId, setOfferId] = useState("");
  const [closedAt, setClosedAt] = useState("");
  const [offerType, setOfferType] = useState("core_offer");
  const [cashCollected, setCashCollected] = useState("");
  const [reportingType, setReportingType] = useState("");
  const [packageOptions, setPackageOptions] = useState(DEFAULT_PACKAGES);
  const [setterName, setSetterName] = useState("");
  const [offeredBy, setOfferedBy] = useState("");
  const [mappingStatus, setMappingStatus] = useState("mapped");

  useEffect(() => {
    fetch("/api/offer-catalog")
      .then(r => r.json())
      .then(d => {
        const pkgs = (d.catalog ?? [])
          .filter((r: { kind: string; is_active: boolean }) => r.kind === "sales_package" && r.is_active)
          .map((r: { code: string; label: string }) => ({ code: r.code, label: r.label }));
        if (pkgs.length) setPackageOptions(pkgs);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    if (!closeId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/acquisition/closes/${closeId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load close");

      const c = data.close as CloseDetail;
      setClients(data.clients ?? []);
      setLeadOffers(data.lead_offers ?? []);
      setCloserFormUrl(data.closer_form_url ?? null);
      setCloserFormDone(!!data.closer_form_done);
      setCompleteness(c.completeness);

      setLeadId(c.lead_id ?? "");
      setLeadLabel(c.lead_name ?? c.lead_email ?? "Unknown lead");
      setClientId(c.client_id ?? "");
      setOfferId(c.offer_id ?? "");
      setClosedAt(c.closed_at ? c.closed_at.slice(0, 16) : "");
      setOfferType(c.offer_type ?? "core_offer");
      setCashCollected(c.cash_collected != null ? String(c.cash_collected) : "");
      setReportingType(c.reporting_type ?? "");
      setSetterName(c.setter_name ?? "");
      setOfferedBy(c.offered_by ?? "");
      setMappingStatus(c.mapping_status ?? "mapped");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [closeId]);

  useEffect(() => {
    if (closeId) load();
  }, [closeId, load]);

  useEffect(() => {
    if (leadSearch.trim().length < 2) {
      setLeadResults([]);
      return;
    }
    const t = setTimeout(() => {
      fetch(`/api/acquisition/leads?search=${encodeURIComponent(leadSearch.trim())}`)
        .then(r => r.json())
        .then(d => setLeadResults((d.rows ?? []).slice(0, 8)))
        .catch(() => setLeadResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [leadSearch]);

  function applyOffer(offer: LeadOffer) {
    setOfferId(offer.id);
    setOfferType(offer.offer_type);
    if (offer.cash_collected != null) setCashCollected(String(offer.cash_collected));
    if (offer.setter_name) setSetterName(offer.setter_name);
    if (offer.offered_by) setOfferedBy(offer.offered_by);
  }

  async function save() {
    if (!closeId) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        lead_id: leadId || null,
        client_id: clientId || null,
        offer_id: offerId || null,
        closed_at: closedAt ? new Date(closedAt).toISOString() : undefined,
        offer_type: offerType || null,
        cash_collected: cashCollected === "" ? null : Number(cashCollected),
        reporting_type: reportingType || null,
        setter_name: setterName || null,
        offered_by: offeredBy || null,
        mapping_status: mappingStatus,
      };
      const res = await fetch(`/api/acquisition/closes/${closeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      if (data.close?.completeness) setCompleteness(data.close.completeness);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function excludeFromReporting() {
    if (!closeId) return;
    if (!confirm("Remove this close from acquisition reporting? The record stays in the database for audit.")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/acquisition/pending-closes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismiss", close_id: closeId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Remove failed");
    } finally {
      setSaving(false);
    }
  }

  async function restoreToReporting() {
    if (!closeId) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/acquisition/pending-closes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore", close_id: closeId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      await load();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setSaving(false);
    }
  }

  if (!closeId) return null;

  const filteredPackages = packageOptions.filter(p => {
    if (p.code === "skool") return reportingType === "RM";
    if (p.code === "mid_offer") return reportingType === "RM" || reportingType === "DSCR" || !reportingType;
    return true;
  });
  const isExcluded = mappingStatus === "dismissed";

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(2,6,15,0.6)" }}
      onClick={onClose}
    >
      <div
        className="h-full w-full overflow-y-auto"
        style={{ maxWidth: 520, background: "#060d1a", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-start justify-between gap-3"
          style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
                {leadLabel}
              </h2>
              {completeness && <CompletenessBadge completeness={completeness} />}
            </div>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>
              {isExcluded
                ? "Excluded from acquisition KPIs — restore to count again"
                : "Edit close record — fill gaps for accurate acquisition KPIs"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 text-sm px-2 py-1"
          >
            Close
          </button>
        </div>

        <div className="p-5 space-y-5">
          {loading && <p className="text-sm text-slate-500">Loading…</p>}
          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ color: "#f87171", background: "rgba(239,68,68,0.1)" }}>
              {error}
            </p>
          )}

          {isExcluded && (
            <div
              className="rounded-lg p-3 text-xs"
              style={{ background: "rgba(100,116,139,0.15)", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              This close is excluded from acquisition reporting (close counts, cash, CAC, setter/closer stats).
              Restore it to include again.
            </div>
          )}

          {!loading && completeness && completeness.missing_count > 0 && !isExcluded && (
            <div className="rounded-lg p-3" style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "#94a3b8" }}>Missing fields</p>
              <div className="flex flex-wrap gap-1.5">
                {completeness.missing_fields.map(f => (
                  <span
                    key={f}
                    className="px-2 py-0.5 rounded text-[11px]"
                    style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24" }}
                  >
                    {CLOSE_FIELD_LABELS[f] ?? f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!loading && (
            <>
              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
                  Identity
                </p>
                <div>
                  <FieldLabel>Lead</FieldLabel>
                  <p className="text-sm mb-2" style={{ color: "#cbd5e1" }}>{leadLabel}</p>
                  <input
                    type="search"
                    placeholder="Search leads to re-link…"
                    value={leadSearch}
                    onChange={e => setLeadSearch(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}
                  />
                  {leadResults.length > 0 && (
                    <ul className="mt-1 rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                      {leadResults.map(row => (
                        <li key={row.id}>
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-xs hover:bg-white/5"
                            style={{ color: "#cbd5e1" }}
                            onClick={() => {
                              setLeadId(row.id);
                              setLeadLabel(row.lead_name ?? row.email ?? row.phone ?? row.id);
                              setLeadSearch("");
                              setLeadResults([]);
                            }}
                          >
                            {row.lead_name ?? "—"} · {row.email ?? row.phone ?? "—"}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <FieldLabel>Client roster</FieldLabel>
                  <select
                    value={clientId}
                    onChange={e => {
                      setClientId(e.target.value);
                      setMappingStatus(e.target.value ? "mapped" : "pending_client");
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={inputStyle}
                  >
                    <option value="">Not linked…</option>
                    {clients.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
                  Deal
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <FieldLabel>Closed at</FieldLabel>
                    <input
                      type="datetime-local"
                      value={closedAt}
                      onChange={e => setClosedAt(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Sales package</FieldLabel>
                    <select
                      value={offerType}
                      onChange={e => setOfferType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle}
                    >
                      {filteredPackages.map(t => (
                        <option key={t.code} value={t.code}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Cash collected</FieldLabel>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="0"
                      value={cashCollected}
                      onChange={e => setCashCollected(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Product</FieldLabel>
                    <select
                      value={reportingType}
                      onChange={e => setReportingType(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle}
                    >
                      <option value="">—</option>
                      {REPORTING_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
                  Attribution
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Setter</FieldLabel>
                    <input
                      value={setterName}
                      onChange={e => setSetterName(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <FieldLabel>Closer</FieldLabel>
                    <input
                      value={offeredBy}
                      onChange={e => setOfferedBy(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={inputStyle}
                    />
                  </div>
                </div>
              </section>

              {leadOffers.length > 0 && (
                <section className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
                    Link offer
                  </p>
                  <div className="space-y-1">
                    {leadOffers.map(offer => (
                      <button
                        key={offer.id}
                        type="button"
                        onClick={() => applyOffer(offer)}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs"
                        style={{
                          background: offerId === offer.id ? "rgba(52,211,153,0.12)" : "#0a1424",
                          border: `1px solid ${offerId === offer.id ? "rgba(52,211,153,0.3)" : "rgba(255,255,255,0.06)"}`,
                          color: "#cbd5e1",
                        }}
                      >
                        {offer.offer_type} · {offer.offered_at.slice(0, 10)}
                        {offer.cash_collected != null ? ` · $${offer.cash_collected}` : ""}
                        {offer.is_closed ? " · closed" : ""}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              <section className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
                  Documentation
                </p>
                {closerFormDone ? (
                  <p className="text-xs font-medium" style={{ color: "#22c55e" }}>Closer form completed</p>
                ) : closerFormUrl ? (
                  <a
                    href={closerFormUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs font-semibold px-3 py-2 rounded-lg"
                    style={{ color: "#38bdf8", background: "rgba(56,189,248,0.1)", border: "1px solid rgba(56,189,248,0.25)" }}
                  >
                    Open closer form
                  </a>
                ) : (
                  <p className="text-xs" style={{ color: "#64748b" }}>
                    No GHL contact or demo appointment — fill attribution fields manually above.
                  </p>
                )}
              </section>

              <div className="flex flex-wrap items-center gap-2 pt-2">
                {!isExcluded && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={save}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: "#34d399", color: "#0f172a" }}
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                )}
                {isExcluded ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={restoreToReporting}
                    className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                    style={{ background: "#38bdf8", color: "#0f172a" }}
                  >
                    {saving ? "Restoring…" : "Restore to reporting"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={excludeFromReporting}
                    className="px-3 py-2 rounded-lg text-xs disabled:opacity-50"
                    style={{ color: "#f87171" }}
                  >
                    Remove from reporting
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
