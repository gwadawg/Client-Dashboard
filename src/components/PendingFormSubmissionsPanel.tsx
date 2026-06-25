"use client";

import { useCallback, useEffect, useState } from "react";
import { dismissRosterPanel, isRosterPanelDismissed } from "@/lib/roster-panel-dismiss";

const PANEL_KEY = "pending-onboarding-forms";

type PendingSubmission = {
  id: string;
  match_email: string | null;
  match_phone: string | null;
  submitted_at: string;
  responses: Record<string, unknown>;
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

export default function PendingFormSubmissionsPanel({ onResolved }: { onResolved?: () => void }) {
  const [total, setTotal] = useState(0);
  const [submissions, setSubmissions] = useState<PendingSubmission[]>([]);
  const [clients, setClients] = useState<RosterClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/form-submissions/pending");
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      const nextTotal = d.total ?? 0;
      setTotal(nextTotal);
      setSubmissions(d.submissions ?? []);
      setClients(d.clients ?? []);
      setDismissed(isRosterPanelDismissed(PANEL_KEY, nextTotal));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  if (loading) return null;
  if (total === 0 || dismissed) return null;

  function closePanel() {
    dismissRosterPanel(PANEL_KEY, total);
    setDismissed(true);
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "#1a1208", border: "1px solid rgba(245,158,11,0.35)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
            Unmapped onboarding forms ({total})
          </h3>
          <p className="text-xs mt-1" style={{ color: "#a8a29e" }}>
            Client submitted the onboarding form but we couldn&apos;t match email/phone to exactly one account. Assign to the correct client or create a new folder.
          </p>
        </div>
        <button
          type="button"
          onClick={closePanel}
          className="shrink-0 w-7 h-7 rounded-lg text-sm leading-none"
          style={{ color: "#94a3b8", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          title="Hide until new unmapped forms arrive"
          aria-label="Hide unmapped onboarding forms panel"
        >
          ✕
        </button>
      </div>
      <div className="space-y-2">
        {submissions.map(s => {
          const name =
            (typeof s.responses.legal_business_name === "string" && s.responses.legal_business_name) ||
            (typeof s.responses.brokerage_name === "string" && s.responses.brokerage_name) ||
            s.match_email ||
            "Unknown";
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2"
              style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="min-w-[12rem] flex-1">
                <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>{name}</p>
                <p className="text-xs" style={{ color: "#64748b" }}>
                  {s.match_email ?? "—"} · {s.match_phone ?? "—"} · {new Date(s.submitted_at).toLocaleString()}
                </p>
              </div>
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
                onClick={() => runAction(s.id, "dismiss")}
                disabled={busy === s.id}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: "#94a3b8" }}
              >
                Dismiss
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
