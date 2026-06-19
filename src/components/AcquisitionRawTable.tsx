"use client";

import { useCallback, useEffect, useState } from "react";

type Props = {
  type: "leads" | "appointments" | "offers" | "closes" | "ads" | "dials";
  startDate: string;
  endDate: string;
};

type ClientOption = { id: string; name: string };

const COLUMNS: Record<Exclude<Props["type"], "closes">, { key: string; label: string }[]> = {
  leads: [
    { key: "created_at", label: "Created" },
    { key: "lead_name", label: "Name" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "source", label: "Source" },
    { key: "offer_interest", label: "Offer" },
    { key: "ghl_contact_id", label: "GHL ID" },
  ],
  appointments: [
    { key: "booked_at", label: "Booked" },
    { key: "scheduled_at", label: "Scheduled" },
    { key: "appointment_type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "setter_name", label: "Setter" },
    { key: "call_taken_by", label: "Taken By" },
    { key: "lead_name", label: "Lead" },
    { key: "qualified", label: "Qualified" },
    { key: "closer_form", label: "Closer form" },
  ],
  offers: [
    { key: "offered_at", label: "Date" },
    { key: "lead_name", label: "Lead" },
    { key: "offer_type", label: "Offer" },
    { key: "is_closed", label: "Closed" },
    { key: "cash_collected", label: "Cash" },
    { key: "setter_name", label: "Setter" },
    { key: "offered_by", label: "Closer" },
    { key: "lead_email", label: "Email" },
  ],
  ads: [
    { key: "insight_date", label: "Date" },
    { key: "platform", label: "Platform" },
    { key: "adset_name", label: "Ad Set" },
    { key: "ad_name", label: "Ad" },
    { key: "amount_spent", label: "Spend" },
  ],
  dials: [
    { key: "occurred_at", label: "When" },
    { key: "agent_name", label: "Agent" },
    { key: "phone", label: "Phone" },
    { key: "duration_seconds", label: "Duration" },
    { key: "outcome", label: "Outcome" },
    { key: "recording_url", label: "Recording" },
  ],
};

const CLOSE_COLUMNS = [
  { key: "closed_at", label: "Closed" },
  { key: "lead_name", label: "Lead" },
  { key: "offer_type", label: "Offer" },
  { key: "setter_name", label: "Setter" },
  { key: "offered_by", label: "Closer" },
  { key: "client", label: "Client" },
  { key: "cash_collected", label: "Cash" },
  { key: "actions", label: "" },
];

function fmt(key: string, v: unknown): string {
  if (v == null) return "—";
  if (key === "is_closed") return v ? "Y" : "N";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && (key.includes("spent") || key.includes("cash") || key.includes("collected"))) {
    return `$${v.toLocaleString()}`;
  }
  if (typeof v === "string" && v.includes("T")) return v.slice(0, 16).replace("T", " ");
  return String(v);
}

function CloseStatusBadge({ status }: { status: string }) {
  if (status === "pending_client") {
    return (
      <span
        className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
        style={{ background: "rgba(245, 158, 11, 0.15)", color: "#fbbf24" }}
      >
        Awaiting client
      </span>
    );
  }
  if (status === "dismissed") {
    return (
      <span
        className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-medium uppercase tracking-wide"
        style={{ background: "rgba(100, 116, 139, 0.2)", color: "#94a3b8" }}
      >
        Excluded
      </span>
    );
  }
  return null;
}

function CloserFormCell({ row }: { row: Record<string, unknown> }) {
  if (row.status !== "showed") {
    return <span style={{ color: "#334155" }}>—</span>;
  }
  if (row.closer_form_done === true) {
    return <span className="text-xs font-medium" style={{ color: "#22c55e" }}>Done</span>;
  }
  const url = row.closer_form_url;
  if (typeof url === "string" && url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs font-semibold whitespace-nowrap"
        style={{ color: "#38bdf8" }}
      >
        Fill out form
      </a>
    );
  }
  return <span className="text-xs" style={{ color: "#f87171" }}>No GHL contact</span>;
}

type CloseRowProps = {
  row: Record<string, unknown>;
  clients: ClientOption[];
  draftClientId: string;
  onDraftChange: (closeId: string, clientId: string) => void;
  onSave: (closeId: string) => void;
  onDismiss: (closeId: string) => void;
  onRestore: (closeId: string) => void;
  saving: boolean;
};

function CloseRowActions({
  row,
  clients,
  draftClientId,
  onDraftChange,
  onSave,
  onDismiss,
  onRestore,
  saving,
}: CloseRowProps) {
  const closeId = String(row.id);
  const mappingStatus = String(row.mapping_status ?? "mapped");
  const savedClientId = typeof row.client_id === "string" ? row.client_id : "";
  const dismissed = mappingStatus === "dismissed";
  const dirty = !dismissed && draftClientId !== savedClientId;

  return (
    <>
      <td className="px-3 py-2 whitespace-nowrap" style={{ color: "#cbd5e1", minWidth: "14rem" }}>
        <div className="flex flex-col gap-1">
          {dismissed ? (
            <span className="text-xs text-slate-500">{row.client_name ? String(row.client_name) : "—"}</span>
          ) : (
            <select
              value={draftClientId}
              onChange={(e) => onDraftChange(closeId, e.target.value)}
              className="w-full max-w-xs px-2 py-1.5 rounded-lg text-xs"
              style={{ background: "#0f2040", color: "#e2e8f0", border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <option value="">Select client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
          <CloseStatusBadge status={mappingStatus} />
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#cbd5e1" }}>
        {fmt("cash_collected", row.cash_collected)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {!dismissed && (
            <>
              <button
                type="button"
                disabled={!dirty || !draftClientId || saving}
                onClick={() => onSave(closeId)}
                className="px-2 py-1 rounded text-[11px] font-medium disabled:opacity-40"
                style={{ background: "#34d399", color: "#0f172a" }}
              >
                {saving ? "…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => onDismiss(closeId)}
                className="px-2 py-1 rounded text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
              >
                Dismiss
              </button>
            </>
          )}
          {dismissed && (
            <button
              type="button"
              disabled={saving}
              onClick={() => onRestore(closeId)}
              className="px-2 py-1 rounded text-[11px] text-slate-400 hover:text-slate-200 disabled:opacity-40"
            >
              Restore
            </button>
          )}
        </div>
      </td>
    </>
  );
}

export default function AcquisitionRawTable({ type, startDate, endDate }: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [draftClientIds, setDraftClientIds] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    const q = new URLSearchParams({ type, from: startDate, to: endDate, limit: "1000" });
    fetch(`/api/acquisition/raw?${q}`)
      .then((r) => r.json())
      .then((d) => {
        const nextRows = d.rows ?? [];
        setRows(nextRows);
        setTotal(d.total ?? 0);
        if (type === "closes") {
          setClients(d.clients ?? []);
          const drafts: Record<string, string> = {};
          for (const row of nextRows) {
            const id = String(row.id);
            drafts[id] = typeof row.client_id === "string" ? row.client_id : "";
          }
          setDraftClientIds(drafts);
        }
      })
      .finally(() => setLoading(false));
  }, [type, startDate, endDate]);

  useEffect(() => {
    load();
  }, [load]);

  async function postCloseAction(body: Record<string, string>) {
    const res = await fetch("/api/acquisition/pending-closes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data.error === "string" ? data.error : "Request failed");
    }
  }

  async function saveClient(closeId: string) {
    const clientId = draftClientIds[closeId];
    if (!clientId) return;
    setSavingId(closeId);
    try {
      await postCloseAction({ action: "assign", close_id: closeId, client_id: clientId });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingId(null);
    }
  }

  async function dismissClose(closeId: string) {
    if (!confirm("Exclude this close from reporting?")) return;
    setSavingId(closeId);
    try {
      await postCloseAction({ action: "dismiss", close_id: closeId });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Dismiss failed");
    } finally {
      setSavingId(null);
    }
  }

  async function restoreClose(closeId: string) {
    setSavingId(closeId);
    try {
      await postCloseAction({ action: "restore", close_id: closeId });
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setSavingId(null);
    }
  }

  const cols = type === "closes" ? CLOSE_COLUMNS : COLUMNS[type];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="px-4 py-3 flex justify-between" style={{ background: "#0a1424" }}>
        <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
          {total.toLocaleString()} rows {total > rows.length ? `(showing ${rows.length})` : ""}
        </p>
      </div>
      {loading ? (
        <p className="p-8 text-center text-sm" style={{ color: "#64748b" }}>Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#070f1d" }}>
                {cols.map((c) => (
                  <th key={c.key} className="text-left px-3 py-2 font-medium whitespace-nowrap" style={{ color: "#64748b" }}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rowKey = String(row.id ?? row.closed_at);
                if (type === "closes") {
                  const closeId = String(row.id);
                  return (
                    <tr key={rowKey} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                      {CLOSE_COLUMNS.slice(0, 5).map((c) => (
                        <td key={c.key} className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#cbd5e1" }}>
                          {fmt(c.key, row[c.key])}
                        </td>
                      ))}
                      <CloseRowActions
                        row={row}
                        clients={clients}
                        draftClientId={draftClientIds[closeId] ?? ""}
                        onDraftChange={(id, clientId) =>
                          setDraftClientIds((s) => ({ ...s, [id]: clientId }))
                        }
                        onSave={saveClient}
                        onDismiss={dismissClose}
                        onRestore={restoreClose}
                        saving={savingId === closeId}
                      />
                    </tr>
                  );
                }

                return (
                  <tr key={rowKey} style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                    {cols.map((c) => (
                      <td key={c.key} className="px-3 py-2 whitespace-nowrap tabular-nums" style={{ color: "#cbd5e1" }}>
                        {c.key === "closer_form" ? (
                          <CloserFormCell row={row} />
                        ) : c.key === "recording_url" && row[c.key] ? (
                          <a
                            href={String(row[c.key])}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold"
                            style={{ color: "#f59e0b" }}
                          >
                            Listen
                          </a>
                        ) : (
                          fmt(c.key, row[c.key])
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
