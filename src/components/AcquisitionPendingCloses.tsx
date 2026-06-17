"use client";

import { useCallback, useEffect, useState } from "react";

type PendingClose = {
  id: string;
  lead_id: string | null;
  closed_at: string;
  cash_collected: number | null;
  offer_type: string | null;
  reporting_type: string | null;
  service_program: string | null;
  acquisition_leads?: { lead_name: string | null; email: string | null; phone: string | null } | null;
};

type Client = { id: string; name: string; email: string | null; phone: string | null };

function leadLabel(row: PendingClose): string {
  const l = row.acquisition_leads;
  if (!l || Array.isArray(l)) return "Unknown lead";
  return l.lead_name ?? l.email ?? l.phone ?? "Unknown lead";
}

export default function AcquisitionPendingCloses() {
  const [closes, setCloses] = useState<PendingClose[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedClient, setSelectedClient] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/acquisition/pending-closes")
      .then((r) => r.json())
      .then((d) => {
        setCloses(d.closes ?? []);
        setClients(d.clients ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function assign(closeId: string) {
    const clientId = selectedClient[closeId];
    if (!clientId) return;
    setAssigning(closeId);
    try {
      const res = await fetch("/api/acquisition/pending-closes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", close_id: closeId, client_id: clientId }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setAssigning(null);
    }
  }

  async function dismiss(closeId: string) {
    if (!confirm("Dismiss this pending close?")) return;
    await fetch("/api/acquisition/pending-closes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", close_id: closeId }),
    });
    load();
  }

  if (loading) {
    return <p className="text-sm text-slate-500 p-8 text-center">Loading pending closes…</p>;
  }

  if (!closes.length) {
    return (
      <p className="text-sm text-slate-500 p-8 text-center rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)", background: "#0a1424" }}>
        No closes awaiting new client form mapping.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {closes.map((row) => (
        <div
          key={row.id}
          className="rounded-xl p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
          style={{ background: "#0a1424", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div>
            <p className="font-medium text-slate-200">{leadLabel(row)}</p>
            <p className="text-xs text-slate-500 mt-1">
              Closed {new Date(row.closed_at).toLocaleDateString()} · {row.reporting_type ?? row.offer_type ?? "—"}
              {row.cash_collected != null ? ` · $${row.cash_collected}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedClient[row.id] ?? ""}
              onChange={(e) => setSelectedClient((s) => ({ ...s, [row.id]: e.target.value }))}
              className="px-2 py-1.5 rounded-lg text-xs"
              style={{ background: "#0f2040", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <option value="">Map to client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedClient[row.id] || assigning === row.id}
              onClick={() => assign(row.id)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ background: "#34d399", color: "#0f172a" }}
            >
              {assigning === row.id ? "…" : "Assign"}
            </button>
            <button type="button" onClick={() => dismiss(row.id)} className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200">
              Dismiss
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
