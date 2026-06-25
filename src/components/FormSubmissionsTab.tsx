"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import ClientFormsSection, { type FormSubmissionSummary } from "@/components/ClientFormsSection";
import {
  FORM_STATUSES,
  FORM_STATUS_LABELS,
  FORM_TYPES,
  FORM_TYPE_LABELS,
  type FormStatus,
  type FormType,
} from "@/lib/form-submissions";

type SubmissionRow = FormSubmissionSummary & {
  client_id: string | null;
  client_name: string | null;
  match_email: string | null;
  match_phone: string | null;
};

type RosterClient = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

function fieldStyle() {
  return { background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" } as const;
}

function statusStyle(status: string): { color: string; bg: string; border: string } {
  switch (status) {
    case "unmapped":
      return { color: "#fbbf24", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)" };
    case "applied":
      return { color: "#86efac", bg: "rgba(34,197,94,0.12)", border: "rgba(34,197,94,0.25)" };
    case "submitted":
      return { color: "#93c5fd", bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.25)" };
    case "dismissed":
      return { color: "#94a3b8", bg: "rgba(148,163,184,0.1)", border: "rgba(148,163,184,0.2)" };
    default:
      return { color: "#cbd5e1", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)" };
  }
}

function submissionLabel(s: SubmissionRow): string {
  const r = s.responses ?? {};
  return (
    (typeof r.legal_business_name === "string" && r.legal_business_name) ||
    (typeof r.brokerage_name === "string" && r.brokerage_name) ||
    s.client_name ||
    s.match_email ||
    "Unknown"
  );
}

type Props = {
  onOpenClient?: (clientId: string, clientName: string) => void;
  onResolved?: () => void;
};

export default function FormSubmissionsTab({ onOpenClient, onResolved }: Props) {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [clients, setClients] = useState<RosterClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formType, setFormType] = useState<FormType | "">("");
  const [status, setStatus] = useState<FormStatus | "">("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (formType) params.set("form_type", formType);
    if (status) params.set("status", status);
    if (status === "dismissed") params.set("include_dismissed", "1");

    const [listRes, pendingRes] = await Promise.all([
      fetch(`/api/form-submissions?${params.toString()}`),
      fetch("/api/form-submissions/pending"),
    ]);

    const listData = await listRes.json().catch(() => ({}));
    const pendingData = await pendingRes.json().catch(() => ({}));

    if (!listRes.ok) {
      setLoadError(listData.error ?? "Failed to load submissions");
      setSubmissions([]);
    } else {
      setLoadError(null);
      setSubmissions(listData.submissions ?? []);
    }

    if (pendingRes.ok) {
      setClients(pendingData.clients ?? []);
    }

    setLoading(false);
  }, [formType, status]);

  useEffect(() => {
    reload();
  }, [reload]);

  const unmappedCount = useMemo(
    () => submissions.filter(s => s.status === "unmapped").length,
    [submissions],
  );

  async function runAction(submissionId: string, action: string, clientId?: string) {
    setBusy(submissionId);
    const res = await fetch("/api/form-submissions/pending", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, submission_id: submissionId, client_id: clientId }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d.error ?? "Action failed");
      setBusy(null);
      return;
    }
    await reload();
    onResolved?.();
    setBusy(null);
    if (action === "create_client") {
      alert(`Created client folder: ${d.client?.name ?? "client"}`);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: "#64748b" }}>
            Form type
          </label>
          <select
            value={formType}
            onChange={e => setFormType(e.target.value as FormType | "")}
            className="px-3 py-2 rounded-lg text-xs outline-none min-w-[10rem]"
            style={fieldStyle()}
          >
            <option value="">All types</option>
            {FORM_TYPES.map(t => (
              <option key={t} value={t}>{FORM_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wide mb-1" style={{ color: "#64748b" }}>
            Status
          </label>
          <select
            value={status}
            onChange={e => setStatus(e.target.value as FormStatus | "")}
            className="px-3 py-2 rounded-lg text-xs outline-none min-w-[10rem]"
            style={fieldStyle()}
          >
            <option value="">All (except dismissed)</option>
            {FORM_STATUSES.map(s => (
              <option key={s} value={s}>{FORM_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </div>
        <p className="text-xs pb-2" style={{ color: "#64748b" }}>
          {loading ? "Loading…" : `${submissions.length} submission${submissions.length === 1 ? "" : "s"}`}
          {unmappedCount > 0 ? ` · ${unmappedCount} need mapping` : ""}
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 bg-red-950/40 border border-red-500/30">
          {loadError}
        </div>
      )}

      {!loading && submissions.length === 0 && !loadError && (
        <div
          className="rounded-xl px-4 py-10 text-center text-sm"
          style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
        >
          No form submissions match these filters.
        </div>
      )}

      {submissions.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <table className="w-full text-left text-xs">
            <thead style={{ background: "#0a1628", position: "sticky", top: 0, zIndex: 1 }}>
              <tr>
                {["Submitted", "Type", "Client", "Contact", "Status", ""].map(h => (
                  <th key={h} className="px-3 py-2.5 font-semibold" style={{ color: "#64748b" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {submissions.map(s => {
                const st = statusStyle(s.status);
                const isOpen = expanded === s.id;
                const isUnmappedOb = s.form_type === "onboarding" && s.status === "unmapped";
                return (
                  <Fragment key={s.id}>
                    <tr
                      style={{ background: isOpen ? "#0f2040" : "#080f1e", borderTop: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "#94a3b8" }}>
                        {new Date(s.submitted_at).toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "#e2e8f0" }}>
                        {FORM_TYPE_LABELS[s.form_type]}
                      </td>
                      <td className="px-3 py-2.5">
                        {s.client_id && s.client_name ? (
                          <button
                            type="button"
                            onClick={() => onOpenClient?.(s.client_id!, s.client_name!)}
                            className="font-medium hover:underline text-left"
                            style={{ color: "#60a5fa" }}
                          >
                            {s.client_name}
                          </button>
                        ) : (
                          <span style={{ color: "#fbbf24" }}>Unmapped</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5" style={{ color: "#94a3b8" }}>
                        <span className="block">{s.match_email ?? submissionLabel(s)}</span>
                        {s.match_phone && <span className="block text-[10px]" style={{ color: "#64748b" }}>{s.match_phone}</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        <span
                          className="inline-block px-2 py-0.5 rounded-md font-semibold"
                          style={{ color: st.color, background: st.bg, border: `1px solid ${st.border}` }}
                        >
                          {FORM_STATUS_LABELS[s.status as FormStatus] ?? s.status}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setExpanded(isOpen ? null : s.id)}
                          className="text-xs font-semibold px-2 py-1 rounded"
                          style={{ color: "#94a3b8" }}
                        >
                          {isOpen ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr style={{ background: "#0a1628" }}>
                        <td colSpan={6} className="px-4 py-4 space-y-3">
                          <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>{submissionLabel(s)}</p>
                          {s.submitted_by && (
                            <p className="text-xs" style={{ color: "#64748b" }}>Submitted by {s.submitted_by}</p>
                          )}
                          <ClientFormsSection submissions={[s]} alwaysExpanded />
                          {isUnmappedOb && (
                            <div
                              className="flex flex-wrap items-center gap-2 pt-2 mt-2 border-t border-white/5"
                            >
                              <select
                                value={assignTo[s.id] ?? ""}
                                onChange={e => setAssignTo(prev => ({ ...prev, [s.id]: e.target.value }))}
                                className="px-2 py-1.5 rounded-lg text-xs outline-none min-w-[10rem]"
                                style={fieldStyle()}
                              >
                                <option value="">Assign to client…</option>
                                {clients.map(c => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                onClick={() => runAction(s.id, "assign", assignTo[s.id])}
                                disabled={busy === s.id || !assignTo[s.id]}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                                style={{
                                  color: "#22c55e",
                                  background: "rgba(34,197,94,0.12)",
                                  border: "1px solid rgba(34,197,94,0.25)",
                                  opacity: busy === s.id ? 0.5 : 1,
                                }}
                              >
                                Assign
                              </button>
                              <button
                                type="button"
                                onClick={() => runAction(s.id, "create_client")}
                                disabled={busy === s.id}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                                style={{
                                  color: "#60a5fa",
                                  background: "rgba(96,165,250,0.12)",
                                  border: "1px solid rgba(96,165,250,0.25)",
                                  opacity: busy === s.id ? 0.5 : 1,
                                }}
                              >
                                New folder
                              </button>
                              <button
                                type="button"
                                onClick={() => runAction(s.id, "dismiss")}
                                disabled={busy === s.id}
                                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                                style={{ color: "#94a3b8" }}
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
