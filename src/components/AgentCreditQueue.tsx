"use client";

import { useEffect, useState } from "react";

type Client = { id: string; name: string; is_live?: boolean };
type Agent = { id: string; name: string; phone: string };
type QueueStatus = "uncredited" | "credited";

type CreditEvent = {
  id: string;
  event_type: string;
  occurred_at: string | null;
  scheduled_at: string | null;
  calendar_name: string | null;
  lead_name: string | null;
  lead_phone: string | null;
  agent_name: string | null;
  clients: { name: string } | null;
};

type Props = {
  clients: Client[];
  startDate: string;
  endDate: string;
};

const EVENT_LABELS: Record<string, string> = {
  appointment_booked: "Appointment",
  callback_booked: "Callback",
  live_transfer: "Live Transfer",
};

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function inferAgentName(agents: Agent[], email: string | null) {
  if (!email) return "";
  const localPart = email.split("@")[0] ?? "";
  const normalizedEmail = normalize(localPart);
  return agents.find(agent => normalize(agent.name) === normalizedEmail || normalize(agent.phone) === normalizedEmail)?.name ?? "";
}

export default function AgentCreditQueue({ clients, startDate, endDate }: Props) {
  const [rows, setRows] = useState<CreditEvent[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentName, setSelectedAgentName] = useState("");
  const [clientFilter, setClientFilter] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState<QueueStatus>("uncredited");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const totalPages = Math.max(1, Math.ceil(total / 50));

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(prev => {
        const next = search.trim();
        if (prev !== next) {
          setLoading(true);
          setPage(1);
        }
        return next;
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({ status, page: String(page) });
    if (clientFilter === "__live__") params.set("live_only", "true");
    else if (clientFilter) params.set("client_id", clientFilter);
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    if (debouncedSearch) params.set("search", debouncedSearch);

    fetch(`/api/credit-queue?${params}`)
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError(data.error ?? "Failed to load credit queue");
          setRows([]);
          return;
        }
        const nextAgents = data.agents ?? [];
        const nextEmail = data.currentUser?.email ?? null;
        setRows(data.rows ?? []);
        setTotal(data.total ?? 0);
        setAgents(nextAgents);
        setSelectedAgentName(current => current || inferAgentName(nextAgents, nextEmail));
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load credit queue");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientFilter, debouncedSearch, endDate, page, startDate, status]);

  async function updateAgent(row: CreditEvent, agentName: string | null) {
    if (agentName !== null && !agentName.trim()) return;
    setSavingId(row.id);
    setError("");

    const res = await fetch(`/api/credit-queue/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_name: agentName }),
    });
    const data = await res.json();
    setSavingId(null);

    if (!res.ok) {
      setError(data.error ?? "Failed to update credit");
      return;
    }

    setRows(prev => prev.filter(item => item.id !== row.id));
    setTotal(prev => Math.max(0, prev - 1));
  }

  const selectStyle = {
    background: "#0f2040",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.5rem 1rem",
    fontSize: "0.875rem",
    outline: "none",
  } as React.CSSProperties;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Agent Credit Queue</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Assign agent credit for live transfers and Call Center Booking Calendar appointments. AI Booking Calendar rows are excluded.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap justify-end">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search lead, phone, calendar, agent..."
              style={{ ...selectStyle, width: "16rem", paddingRight: search ? "2rem" : "1rem" }}
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                aria-label="Clear search"
                className="absolute top-1/2 -translate-y-1/2"
                style={{ right: "0.5rem", color: "#64748b", fontSize: "1rem", lineHeight: 1 }}
              >
                ×
              </button>
            )}
          </div>
          <select
            style={selectStyle}
            value={clientFilter}
            onChange={e => {
              setLoading(true);
              setPage(1);
              setClientFilter(e.target.value);
            }}
          >
            <option value="">All Clients</option>
            <option value="__live__">Live Clients</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}{c.is_live === false ? " (offline)" : ""}</option>)}
          </select>
          <select style={selectStyle} value={selectedAgentName} onChange={e => setSelectedAgentName(e.target.value)}>
            <option value="">Credit to...</option>
            {agents.map(agent => <option key={agent.id} value={agent.name}>{agent.name}</option>)}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 rounded-lg p-1" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
          {(["uncredited", "credited"] as QueueStatus[]).map(nextStatus => {
            const active = status === nextStatus;
            return (
              <button
                key={nextStatus}
                onClick={() => {
                  setLoading(true);
                  setPage(1);
                  setStatus(nextStatus);
                }}
                className="px-3 py-1.5 rounded-md text-sm font-semibold transition-colors"
                style={active ? { background: "#f59e0b", color: "#fff" } : { color: "#64748b" }}
              >
                {nextStatus === "uncredited" ? "Needs Credit" : "Credited"}
              </button>
            );
          })}
        </div>
        <span className="text-sm" style={{ color: "#334155" }}>{total.toLocaleString()} events</span>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["Client", "Lead", "Phone", "Event Time", "Appointment Date", "Calendar", "Type", "Agent", ""].map(label => (
                <th key={label} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                {status === "uncredited" ? "No events need agent credit" : "No credited events"}
              </td></tr>
            ) : rows.map((row, i) => (
              <tr key={row.id} style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#e2e8f0" }}>{row.clients?.name ?? "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#94a3b8" }}>{row.lead_name ?? "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs" style={{ color: "#64748b" }}>{row.lead_phone ?? "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#94a3b8" }}>{formatDate(row.occurred_at)}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#94a3b8" }}>{formatDate(row.scheduled_at)}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#94a3b8" }}>{row.calendar_name ?? "-"}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "#f59e0b" }}>{EVENT_LABELS[row.event_type] ?? row.event_type}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: row.agent_name ? "#e2e8f0" : "#334155" }}>{row.agent_name || "Unassigned"}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => updateAgent(row, selectedAgentName)}
                      disabled={!selectedAgentName || savingId === row.id}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
                      style={{ background: "#f59e0b", color: "#fff" }}
                    >
                      {savingId === row.id ? "Saving..." : status === "uncredited" ? "Take Credit" : "Reassign Credit"}
                    </button>
                    {status === "credited" && (
                      <button
                        onClick={() => updateAgent(row, null)}
                        disabled={savingId === row.id}
                        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-40 transition-colors"
                        style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}
                      >
                        Unassign
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-3 justify-end">
          <button onClick={() => { setLoading(true); setPage(p => Math.max(1, p - 1)); }} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}>
            Prev
          </button>
          <span className="text-sm" style={{ color: "#334155" }}>Page {page} of {totalPages}</span>
          <button onClick={() => { setLoading(true); setPage(p => Math.min(totalPages, p + 1)); }} disabled={page === totalPages}
            className="px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-30 transition-colors"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.10)", color: "#94a3b8" }}>
            Next
          </button>
        </div>
      )}
    </div>
  );
}
