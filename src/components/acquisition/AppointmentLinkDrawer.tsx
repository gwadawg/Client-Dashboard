"use client";

import { useEffect, useState } from "react";
import type { EnrichedAcquisitionAppointment } from "@/lib/acquisition-appointment-enriched";
import { acquisitionLeadFileUrl } from "@/lib/acquisition-appointment-enriched";
import { acquisitionLeadSourceLabel } from "@/lib/acquisition-lead-source";

type LeadSearchRow = {
  lead_id: string;
  lead_name: string | null;
  email: string | null;
  phone: string | null;
  ghl_contact_id?: string | null;
  source?: string | null;
};

type Props = {
  row: EnrichedAcquisitionAppointment | null;
  onClose: () => void;
  onLinked: (patch: Partial<EnrichedAcquisitionAppointment> & { id: string }) => void;
};

const inputStyle = {
  background: "#0f2040",
  color: "#e2e8f0",
  border: "1px solid rgba(255,255,255,0.12)",
} as const;

function formatWhen(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium mb-1" style={{ color: "#64748b" }}>
      {children}
    </label>
  );
}

export default function AppointmentLinkDrawer({ row, onClose, onLinked }: Props) {
  const [leadSearch, setLeadSearch] = useState("");
  const [leadResults, setLeadResults] = useState<LeadSearchRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (!row) return null;

  const needsLead = !row.lead_id;
  const needsGhl = row.lead_id && !row.ghl_contact_id;
  const ghlUrl = acquisitionLeadFileUrl(row);

  async function runAction(
    action: "link_lead" | "create_lead" | "pull_ghl",
    leadId?: string,
  ) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/acquisition/appointments/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointment_id: row!.id, action, lead_id: leadId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Link failed");

      onLinked({
        id: row!.id,
        lead_id: data.lead_id,
        ghl_contact_id: data.ghl_contact_id ?? row!.ghl_contact_id,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Link failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(2,6,15,0.6)" }}
      onClick={onClose}
    >
      <div
        className="h-full w-full overflow-y-auto"
        style={{ maxWidth: 480, background: "#060d1a", borderLeft: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="sticky top-0 z-10 px-5 py-4 flex items-start justify-between gap-3"
          style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
              Link appointment
            </h2>
            <p className="text-xs mt-1" style={{ color: "#64748b" }}>
              Connect this appointment to a lead record and GHL contact
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
          {error && (
            <p
              className="text-sm px-3 py-2 rounded-lg"
              style={{ color: "#f87171", background: "rgba(239,68,68,0.1)" }}
            >
              {error}
            </p>
          )}

          <section
            className="rounded-xl p-4 space-y-2"
            style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
              Appointment
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span style={{ color: "#64748b" }}>Lead</span>
                <p style={{ color: "#e2e8f0" }}>{row.lead_name ?? "—"}</p>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Phone</span>
                <p style={{ color: "#e2e8f0" }}>{row.phone ?? "—"}</p>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Type</span>
                <p className="capitalize" style={{ color: "#e2e8f0" }}>{row.appointment_type}</p>
              </div>
              <div>
                <span style={{ color: "#64748b" }}>Scheduled</span>
                <p style={{ color: "#e2e8f0" }}>{formatWhen(row.scheduled_at)}</p>
              </div>
              <div className="col-span-2">
                <span style={{ color: "#64748b" }}>GHL appointment ID</span>
                <p className="font-mono text-[11px] truncate" style={{ color: "#94a3b8" }}>
                  {row.ghl_appointment_id ?? "—"}
                </p>
              </div>
            </div>
          </section>

          {(needsLead || needsGhl) && (
            <div
              className="rounded-lg px-3 py-2 text-xs"
              style={{
                background: "rgba(245,158,11,0.1)",
                border: "1px solid rgba(245,158,11,0.3)",
                color: "#fbbf24",
              }}
            >
              {needsLead && <p>No lead linked to this appointment.</p>}
              {needsGhl && <p>Lead exists but has no GHL contact ID.</p>}
            </div>
          )}

          {ghlUrl && (
            <a
              href={ghlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-medium"
              style={{
                background: "#0f2040",
                border: "1px solid rgba(96,165,250,0.35)",
                color: "#60a5fa",
              }}
            >
              Open in GHL ↗
            </a>
          )}

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
              Link existing lead
            </p>
            <input
              type="search"
              placeholder="Search by name, phone, or email…"
              value={leadSearch}
              onChange={e => setLeadSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm"
              style={inputStyle}
            />
            {leadResults.length > 0 && (
              <ul className="rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                {leadResults.map(lead => (
                  <li key={lead.lead_id}>
                    <button
                      type="button"
                      disabled={!!busy}
                      className="w-full text-left px-3 py-2.5 text-xs hover:bg-white/5 disabled:opacity-50"
                      style={{ color: "#cbd5e1" }}
                      onClick={() => runAction("link_lead", lead.lead_id)}
                    >
                      <div className="font-medium">{lead.lead_name ?? "Unnamed"}</div>
                      <div style={{ color: "#64748b" }}>
                        {[lead.phone, lead.email].filter(Boolean).join(" · ")}
                        {lead.source && ` · ${acquisitionLeadSourceLabel(lead.source)}`}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#475569" }}>
              Create or pull
            </p>

            {(row.lead_name || row.phone) && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => runAction("create_lead")}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left disabled:opacity-50"
                style={{
                  background: "rgba(56,189,248,0.1)",
                  border: "1px solid rgba(56,189,248,0.3)",
                  color: "#38bdf8",
                }}
              >
                {busy === "create_lead" ? "Creating…" : "Create lead from appointment data"}
                <span className="block text-[11px] mt-0.5 font-normal" style={{ color: "#64748b" }}>
                  Uses name and phone on this row
                </span>
              </button>
            )}

            {(row.phone || row.lead_name) && (
              <button
                type="button"
                disabled={!!busy}
                onClick={() => runAction("pull_ghl")}
                className="w-full px-4 py-2.5 rounded-lg text-sm font-medium text-left disabled:opacity-50"
                style={{
                  background: "rgba(167,139,250,0.1)",
                  border: "1px solid rgba(167,139,250,0.3)",
                  color: "#c4b5fd",
                }}
              >
                {busy === "pull_ghl" ? "Pulling from GHL…" : "Pull from GoHighLevel"}
                <span className="block text-[11px] mt-0.5 font-normal" style={{ color: "#64748b" }}>
                  Search GHL by phone or name, then link
                </span>
              </button>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
