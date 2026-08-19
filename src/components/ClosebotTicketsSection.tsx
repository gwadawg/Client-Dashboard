"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CLOSEBOT_BUG_TYPES,
  CLOSEBOT_BUG_TYPE_META,
  CLOSEBOT_TICKET_STATUSES,
  CLOSEBOT_TICKET_STATUS_META,
  embedOne,
  formatLogDate,
  formatVersionLabel,
  isOpenTicketStatus,
  type ClosebotAgent,
  type ClosebotAgentVersion,
  type ClosebotBugType,
  type ClosebotPromptLog,
  type ClosebotTicket,
  type ClosebotTicketStatus,
} from "@/lib/closebot";

const inputStyle: React.CSSProperties = {
  background: "#050c18",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#e2e8f0",
  borderRadius: "0.5rem",
  padding: "0.5rem 0.75rem",
  fontSize: "0.8125rem",
  outline: "none",
  width: "100%",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.625rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#64748b",
};

type Props = {
  agents: ClosebotAgent[];
  canWrite?: boolean;
};

type ClientOption = { id: string; name: string };

export default function ClosebotTicketsSection({ agents, canWrite = false }: Props) {
  const [tickets, setTickets] = useState<ClosebotTicket[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | ClosebotTicketStatus>("");
  const [filterType, setFilterType] = useState<"" | ClosebotBugType>("");
  const [filterClient, setFilterClient] = useState("");
  const [filterVersion, setFilterVersion] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [versionsByAgent, setVersionsByAgent] = useState<Record<string, ClosebotAgentVersion[]>>({});
  const [logsByAgent, setLogsByAgent] = useState<Record<string, ClosebotPromptLog[]>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterAgent) params.set("agent_id", filterAgent);
      if (filterStatus) params.set("status", filterStatus);
      if (filterType) params.set("bug_type", filterType);
      if (filterClient) params.set("client_id", filterClient);
      if (filterVersion === "none") params.set("agent_version_id", "none");
      else if (filterVersion) params.set("agent_version_id", filterVersion);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      params.set("limit", "100");
      const [ticketsRes, optionsRes] = await Promise.all([
        fetch(`/api/closebot/tickets?${params}`),
        fetch("/api/closebot/tickets/public/options"),
      ]);
      const ticketsData = await ticketsRes.json().catch(() => ({}));
      if (!ticketsRes.ok) {
        setError(ticketsData.error || "Failed to load tickets");
        setTickets([]);
        return;
      }
      setTickets(Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []);
      if (optionsRes.ok) {
        const options = await optionsRes.json().catch(() => ({}));
        setClients(Array.isArray(options.clients) ? options.clients : []);
      }
    } catch {
      setError("Failed to load tickets");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [filterAgent, filterStatus, filterType, filterClient, filterVersion, filterFrom, filterTo]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!filterAgent) return;
    void (async () => {
      const res = await fetch(`/api/closebot/agents/${filterAgent}/versions`);
      const data = await res.json().catch(() => ({}));
      setVersionsByAgent((prev) => ({
        ...prev,
        [filterAgent]: Array.isArray(data.versions) ? data.versions : [],
      }));
    })();
  }, [filterAgent]);

  async function ensureVersions(agentId: string) {
    if (versionsByAgent[agentId]) return;
    const res = await fetch(`/api/closebot/agents/${agentId}/versions`);
    const data = await res.json().catch(() => ({}));
    setVersionsByAgent((prev) => ({
      ...prev,
      [agentId]: Array.isArray(data.versions) ? data.versions : [],
    }));
  }

  async function ensureLogs(agentId: string) {
    if (logsByAgent[agentId]) return;
    const res = await fetch(`/api/closebot/logs?agent_id=${encodeURIComponent(agentId)}&limit=20`);
    const data = await res.json().catch(() => ({}));
    setLogsByAgent((prev) => ({
      ...prev,
      [agentId]: Array.isArray(data.logs) ? data.logs : [],
    }));
  }

  async function patchTicket(id: string, body: Record<string, unknown>) {
    setSavingId(id);
    setError(null);
    try {
      const res = await fetch(`/api/closebot/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not update ticket");
        return;
      }
      setTickets((prev) => prev.map((t) => (t.id === id ? (data as ClosebotTicket) : t)));
    } catch {
      setError("Could not update ticket");
    } finally {
      setSavingId(null);
    }
  }

  const openCount = tickets.filter((t) => isOpenTicketStatus(t.status)).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
            Incident tickets
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
            Team reports from the public form, rolled up to the agent version live that day.
          </p>
        </div>
        <a
          href="/forms/closebot-tickets"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-semibold px-3 py-2 rounded-lg"
          style={{ border: "1px solid rgba(255,255,255,0.12)", color: "#93c5fd" }}
        >
          Open report form
        </a>
      </div>

      <div
        className="flex flex-wrap gap-3 rounded-xl p-3"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <label className="space-y-1 min-w-[9rem] flex-1">
          <span style={labelStyle}>Agent</span>
          <select
            style={inputStyle}
            value={filterAgent}
            onChange={(e) => {
              setFilterAgent(e.target.value);
              setFilterVersion("");
            }}
          >
            <option value="">Any agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-[11rem] flex-1">
          <span style={labelStyle}>Version</span>
          <select
            style={inputStyle}
            value={filterVersion}
            disabled={!filterAgent}
            onChange={(e) => setFilterVersion(e.target.value)}
          >
            <option value="">{filterAgent ? "Any version" : "Pick an agent first"}</option>
            <option value="none">Unknown version</option>
            {(versionsByAgent[filterAgent] ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.status} · {formatVersionLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-[9rem]">
          <span style={labelStyle}>Status</span>
          <select
            style={inputStyle}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | ClosebotTicketStatus)}
          >
            <option value="">Any status</option>
            {CLOSEBOT_TICKET_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLOSEBOT_TICKET_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-[9rem]">
          <span style={labelStyle}>Type</span>
          <select
            style={inputStyle}
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as "" | ClosebotBugType)}
          >
            <option value="">Any type</option>
            {CLOSEBOT_BUG_TYPES.map((t) => (
              <option key={t} value={t}>
                {CLOSEBOT_BUG_TYPE_META[t].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-[9rem] flex-1">
          <span style={labelStyle}>Client</span>
          <select style={inputStyle} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
            <option value="">Any client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-[8rem]">
          <span style={labelStyle}>From</span>
          <input type="date" style={inputStyle} value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} />
        </label>
        <label className="space-y-1 min-w-[8rem]">
          <span style={labelStyle}>To</span>
          <input type="date" style={inputStyle} value={filterTo} onChange={(e) => setFilterTo(e.target.value)} />
        </label>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm py-8" style={{ color: "#64748b" }}>
          Loading tickets…
        </p>
      ) : tickets.length === 0 ? (
        <div
          className="rounded-xl px-6 py-10 text-center"
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}
        >
          <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
            No tickets yet
          </p>
          <p className="text-xs mt-2" style={{ color: "#64748b" }}>
            Share /forms/closebot-tickets with the team. {openCount} open in this view.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {tickets.map((ticket) => {
            const agent = embedOne(ticket.agent);
            const client = embedOne(ticket.client);
            const version = embedOne(ticket.agent_version);
            const meta = CLOSEBOT_TICKET_STATUS_META[ticket.status] ?? CLOSEBOT_TICKET_STATUS_META.new;
            const expanded = expandedId === ticket.id;
            return (
              <li
                key={ticket.id}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <button
                  type="button"
                  className="w-full text-left px-4 py-3"
                  onClick={() => {
                    const next = expanded ? null : ticket.id;
                    setExpandedId(next);
                    if (next) {
                      void ensureVersions(ticket.agent_id);
                      if (ticket.status === "resolved_updated_agent" || canWrite) {
                        void ensureLogs(ticket.agent_id);
                      }
                    }
                  }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-xs font-medium tabular-nums" style={{ color: "#94a3b8" }}>
                      {formatLogDate(ticket.occurred_at)}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "#e2e8f0" }}>
                      {client?.name ?? "Unknown client"}
                    </span>
                    <span className="text-xs" style={{ color: "#94a3b8" }}>
                      {agent?.name ?? "Unknown agent"}
                    </span>
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{ color: meta.color, background: `${meta.color}22` }}
                    >
                      {meta.label}
                    </span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ color: "#cbd5e1", background: "rgba(255,255,255,0.06)" }}>
                      {CLOSEBOT_BUG_TYPE_META[ticket.bug_type]?.label ?? ticket.bug_type}
                    </span>
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: "#fbbf24", background: "rgba(251,191,36,0.12)" }}>
                      {formatVersionLabel(
                        version ?? (ticket.agent_version_id ? { id: ticket.agent_version_id } : null),
                      )}
                    </span>
                  </div>
                  <p className="text-sm line-clamp-2" style={{ color: "#cbd5e1" }}>
                    {ticket.description}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    Reported by {ticket.reporter_name}
                  </p>
                </button>
                {expanded && (
                  <div className="px-4 pb-4 space-y-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <a
                      href={ticket.contact_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium"
                      style={{ color: "#93c5fd" }}
                    >
                      Open contact →
                    </a>
                    {canWrite ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="space-y-1">
                          <span style={labelStyle}>Status</span>
                          <select
                            style={inputStyle}
                            disabled={savingId === ticket.id}
                            value={ticket.status}
                            onChange={(e) => {
                              const status = e.target.value as ClosebotTicketStatus;
                              void patchTicket(ticket.id, { status });
                              if (status === "resolved_updated_agent") void ensureLogs(ticket.agent_id);
                            }}
                          >
                            {CLOSEBOT_TICKET_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {CLOSEBOT_TICKET_STATUS_META[s].label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1">
                          <span style={labelStyle}>Agent version</span>
                          <select
                            style={inputStyle}
                            disabled={savingId === ticket.id}
                            value={ticket.agent_version_id ?? ""}
                            onChange={(e) =>
                              void patchTicket(ticket.id, {
                                agent_version_id: e.target.value || null,
                              })
                            }
                          >
                            <option value="">Unknown version</option>
                            {(versionsByAgent[ticket.agent_id] ?? []).map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.status} · {formatVersionLabel(v)}
                              </option>
                            ))}
                          </select>
                        </label>
                        {ticket.status === "resolved_updated_agent" && (
                          <label className="space-y-1 sm:col-span-2">
                            <span style={labelStyle}>Linked prompt log</span>
                            <select
                              style={inputStyle}
                              disabled={savingId === ticket.id}
                              value={ticket.prompt_log_id ?? ""}
                              onChange={(e) =>
                                void patchTicket(ticket.id, {
                                  prompt_log_id: e.target.value || null,
                                })
                              }
                            >
                              <option value="">None</option>
                              {(logsByAgent[ticket.agent_id] ?? []).map((log) => (
                                <option key={log.id} value={log.id}>
                                  {formatLogDate(log.changed_at)} — {log.problem_solved.slice(0, 60)}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="space-y-1 sm:col-span-2">
                          <span style={labelStyle}>Status notes</span>
                          <textarea
                            rows={2}
                            style={inputStyle}
                            defaultValue={ticket.status_notes ?? ""}
                            disabled={savingId === ticket.id}
                            onBlur={(e) => {
                              const next = e.target.value.trim();
                              const prev = ticket.status_notes ?? "";
                              if (next !== prev) {
                                void patchTicket(ticket.id, { status_notes: next || null });
                              }
                            }}
                          />
                        </label>
                      </div>
                    ) : (
                      ticket.status_notes && (
                        <p className="text-xs" style={{ color: "#94a3b8" }}>
                          {ticket.status_notes}
                        </p>
                      )
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
