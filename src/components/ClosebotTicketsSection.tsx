"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CLOSEBOT_TICKET_STATUSES,
  CLOSEBOT_TICKET_STATUS_META,
  embedOne,
  formatLogDate,
  formatVersionLabel,
  isOpenTicketStatus,
  type ClosebotAgent,
  type ClosebotAgentVersion,
  type ClosebotBugTypeRow,
  type ClosebotPromptLog,
  type ClosebotTicket,
  type ClosebotTicketStatus,
} from "@/lib/closebot";

const inputStyle: React.CSSProperties = {
  background: "#080604",
  border: "1px solid rgba(245,158,11,0.18)",
  color: "#f8fafc",
  borderRadius: "0.35rem",
  padding: "0.45rem 0.7rem",
  fontSize: "0.75rem",
  outline: "none",
  width: "100%",
  fontFamily: "var(--font-plex-mono)",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.6rem",
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#92400e",
  fontFamily: "var(--font-archivo)",
};

type Props = {
  canWrite?: boolean;
};

type ClientOption = { id: string; name: string };

function BugTypeHint({
  label,
  description,
  children,
}: {
  label: string;
  description?: string | null;
  children: React.ReactNode;
}) {
  if (!description?.trim()) return <>{children}</>;
  return (
    <span className="cb-type-hint">
      {children}
      <span role="tooltip" className="cb-type-hint-box">
        <span className="cb-type-hint-kicker">{label}</span>
        {description.trim()}
      </span>
    </span>
  );
}

export default function ClosebotTicketsSection({ canWrite = false }: Props) {
  const [tickets, setTickets] = useState<ClosebotTicket[]>([]);
  const [agents, setAgents] = useState<ClosebotAgent[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openOnly, setOpenOnly] = useState(true);
  const [filterAgent, setFilterAgent] = useState("");
  const [filterClient, setFilterClient] = useState("");
  const [filterVersion, setFilterVersion] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [versionsByAgent, setVersionsByAgent] = useState<Record<string, ClosebotAgentVersion[]>>({});
  const [logsByAgent, setLogsByAgent] = useState<Record<string, ClosebotPromptLog[]>>({});
  const [bugTypes, setBugTypes] = useState<ClosebotBugTypeRow[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(canWrite);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeDescription, setNewTypeDescription] = useState("");
  const [savingType, setSavingType] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterAgent) params.set("agent_id", filterAgent);
      if (filterClient) params.set("client_id", filterClient);
      if (filterVersion === "none") params.set("agent_version_id", "none");
      else if (filterVersion) params.set("agent_version_id", filterVersion);
      if (openOnly) params.set("open", "1");
      params.set("limit", "200");
      const [ticketsRes, clientsRes, agentsRes, typesRes] = await Promise.all([
        fetch(`/api/closebot/tickets?${params}`),
        fetch("/api/clients"),
        fetch("/api/closebot/agents"),
        fetch("/api/closebot/bug-types"),
      ]);
      const ticketsData = await ticketsRes.json().catch(() => ({}));
      if (!ticketsRes.ok) {
        setError(ticketsData.error || "Failed to load tickets");
        setTickets([]);
        return;
      }
      setTickets(Array.isArray(ticketsData.tickets) ? ticketsData.tickets : []);
      if (clientsRes.ok) {
        const clientData = await clientsRes.json().catch(() => ({}));
        setClients(Array.isArray(clientData.clients) ? clientData.clients : []);
      }
      if (agentsRes.ok) {
        const agentData = await agentsRes.json().catch(() => []);
        setAgents(Array.isArray(agentData) ? agentData : []);
      }
      if (typesRes.ok) {
        const typeData = await typesRes.json().catch(() => ({}));
        setBugTypes(Array.isArray(typeData.types) ? typeData.types : []);
      }
    } catch {
      setError("Failed to load tickets");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [filterAgent, filterClient, filterVersion, openOnly]);

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

  async function addBugType() {
    const name = newTypeName.trim();
    const description = newTypeDescription.trim();
    if (!name) return;
    setSavingType(true);
    setError(null);
    try {
      const res = await fetch("/api/closebot/bug-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not add type");
        return;
      }
      setNewTypeName("");
      setNewTypeDescription("");
      setBugTypes((prev) =>
        [...prev, data as ClosebotBugTypeRow].sort(
          (a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
        ),
      );
    } catch {
      setError("Could not add type");
    } finally {
      setSavingType(false);
    }
  }

  async function deleteBugType(slug: string) {
    setSavingType(true);
    setError(null);
    try {
      const res = await fetch(`/api/closebot/bug-types/${encodeURIComponent(slug)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Could not delete type");
        return;
      }
      setBugTypes((prev) => prev.filter((t) => t.slug !== slug));
      setTickets((prev) =>
        prev.map((t) => (t.bug_type === slug ? { ...t, bug_type: null } : t)),
      );
    } catch {
      setError("Could not delete type");
    } finally {
      setSavingType(false);
    }
  }

  const grouped = useMemo(() => {
    const byType = new Map<string, ClosebotTicket[]>();
    for (const ticket of tickets) {
      const key = ticket.bug_type || "__unclassified__";
      const list = byType.get(key) ?? [];
      list.push(ticket);
      byType.set(key, list);
    }
    const ordered: { type: string; label: string; code: string; description: string | null; tickets: ClosebotTicket[] }[] = [];
    const unclassified = byType.get("__unclassified__") ?? [];
    if (unclassified.length) {
      ordered.push({
        type: "__unclassified__",
        label: "Unclassified",
        code: "NEW",
        description: "Not tagged yet. Hover a type in the library to see what it covers, then tag the ticket.",
        tickets: unclassified,
      });
    }
    const seen = new Set<string>(["__unclassified__"]);
    for (const t of bugTypes) {
      const list = byType.get(t.slug) ?? [];
      if (list.length === 0) continue;
      ordered.push({
        type: t.slug,
        label: t.name,
        code: t.short_code,
        description: t.description,
        tickets: list,
      });
      seen.add(t.slug);
    }
    for (const [slug, list] of byType) {
      if (seen.has(slug) || list.length === 0) continue;
      ordered.push({
        type: slug,
        label: slug.replace(/_/g, " "),
        code: slug.slice(0, 4).toUpperCase(),
        description: null,
        tickets: list,
      });
    }
    return ordered;
  }, [tickets, bugTypes]);

  const openCount = tickets.filter((t) => isOpenTicketStatus(t.status)).length;

  return (
    <div className="space-y-5 max-w-5xl">
      <style>{`
        @keyframes closebotLedgerIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: none; }
        }
        .cb-type-hint {
          position: relative;
          display: inline-block;
          cursor: help;
        }
        .cb-type-hint-box {
          position: absolute;
          left: 0;
          bottom: calc(100% + 10px);
          width: min(22rem, 72vw);
          padding: 0.8rem 0.95rem;
          border-radius: 0.7rem;
          background: #140e08;
          border: 1px solid rgba(245,158,11,0.45);
          box-shadow: 0 18px 40px rgba(0,0,0,0.45);
          color: #f5f5f4;
          font-family: var(--font-archivo);
          font-size: 0.8125rem;
          line-height: 1.45;
          letter-spacing: 0.01em;
          text-transform: none;
          opacity: 0;
          visibility: hidden;
          transform: translateY(6px);
          transition: opacity 140ms ease, transform 140ms ease, visibility 140ms ease;
          z-index: 40;
          pointer-events: none;
        }
        .cb-type-hint-kicker {
          display: block;
          margin-bottom: 0.35rem;
          font-size: 0.62rem;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #f59e0b;
          font-family: var(--font-plex-mono);
        }
        .cb-type-hint:hover .cb-type-hint-box,
        .cb-type-hint:focus-within .cb-type-hint-box {
          opacity: 1;
          visibility: visible;
          transform: none;
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <p
            className="text-4xl tabular-nums leading-none"
            style={{ color: "#fbbf24", fontFamily: "var(--font-plex-mono)" }}
          >
            {String(openCount).padStart(2, "0")}
          </p>
          <div>
            <p
              className="text-[11px] font-semibold uppercase tracking-[0.18em]"
              style={{ color: "#b45309", fontFamily: "var(--font-archivo)" }}
            >
              Open cases
            </p>
            <p className="text-xs" style={{ color: "#64748b" }}>
              {tickets.length} in this view · grouped by type
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex rounded-lg p-0.5"
            style={{ background: "#080604", border: "1px solid rgba(245,158,11,0.22)" }}
          >
            <button
              type="button"
              onClick={() => setOpenOnly(true)}
              className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md"
              style={{
                background: openOnly ? "rgba(245,158,11,0.2)" : "transparent",
                color: openOnly ? "#fbbf24" : "#64748b",
                fontFamily: "var(--font-archivo)",
              }}
            >
              Open
            </button>
            <button
              type="button"
              onClick={() => setOpenOnly(false)}
              className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider rounded-md"
              style={{
                background: !openOnly ? "rgba(245,158,11,0.2)" : "transparent",
                color: !openOnly ? "#fbbf24" : "#64748b",
                fontFamily: "var(--font-archivo)",
              }}
            >
              All history
            </button>
          </div>
          <a
            href="/forms/closebot-tickets"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg"
            style={{
              background: "#f59e0b",
              color: "#1a1206",
              fontFamily: "var(--font-archivo)",
            }}
          >
            Report form
          </a>
          {canWrite && (
            <button
              type="button"
              onClick={() => setLibraryOpen((v) => !v)}
              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg"
              style={{
                color: libraryOpen ? "#fbbf24" : "#a8a29e",
                border: "1px solid rgba(245,158,11,0.28)",
                fontFamily: "var(--font-archivo)",
              }}
            >
              Type library
            </button>
          )}
        </div>
      </div>

      {libraryOpen && canWrite && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{
            background: "rgba(245,158,11,0.05)",
            border: "1px solid rgba(245,158,11,0.2)",
          }}
        >
          <p className="text-xs" style={{ color: "#a8a29e" }}>
            Title is the group name. Description stays hidden until someone hovers the type.
          </p>
          <form
            className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void addBugType();
            }}
          >
            <label className="space-y-1 min-w-0">
              <span style={labelStyle}>Title</span>
              <input
                style={inputStyle}
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g. Booked the wrong LO"
              />
            </label>
            <label className="space-y-1 min-w-0">
              <span style={labelStyle}>Description</span>
              <input
                style={inputStyle}
                value={newTypeDescription}
                onChange={(e) => setNewTypeDescription(e.target.value)}
                placeholder="When to use this type"
              />
            </label>
            <button
              type="submit"
              disabled={savingType || !newTypeName.trim()}
              className="text-[11px] font-semibold uppercase tracking-wider px-3 py-2 rounded-lg disabled:opacity-50 h-[2.15rem]"
              style={{ background: "#f59e0b", color: "#1a1206", fontFamily: "var(--font-archivo)" }}
            >
              {savingType ? "Adding…" : "Add type"}
            </button>
          </form>
          {bugTypes.length === 0 ? (
            <p className="text-xs" style={{ color: "#78716c" }}>
              Library is empty. Add the types you actually see on the floor.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {bugTypes.map((t) => (
                <li key={t.slug}>
                  <BugTypeHint label={t.name} description={t.description}>
                    <span
                      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded"
                      style={{
                        background: t.is_active ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.04)",
                        color: t.is_active ? "#fde68a" : "#78716c",
                        fontFamily: "var(--font-plex-mono)",
                      }}
                    >
                      {t.short_code} · {t.name}
                      <button
                        type="button"
                        aria-label={`Delete ${t.name}`}
                        disabled={savingType}
                        onClick={() => void deleteBugType(t.slug)}
                        className="text-[10px] leading-none opacity-70 hover:opacity-100"
                        style={{ color: "#f87171" }}
                      >
                        ×
                      </button>
                    </span>
                  </BugTypeHint>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div
        className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5 rounded-xl p-3"
        style={{
          background:
            "linear-gradient(180deg, rgba(245,158,11,0.06) 0%, rgba(8,6,4,0.4) 100%)",
          border: "1px solid rgba(245,158,11,0.16)",
        }}
      >
        <label className="space-y-1 min-w-0">
          <span style={labelStyle}>Agent</span>
          <select
            style={inputStyle}
            value={filterAgent}
            onChange={(e) => {
              setFilterAgent(e.target.value);
              setFilterVersion("");
            }}
          >
            <option value="">All agents</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-0">
          <span style={labelStyle}>Version</span>
          <select
            style={inputStyle}
            value={filterVersion}
            disabled={!filterAgent}
            onChange={(e) => setFilterVersion(e.target.value)}
          >
            <option value="">{filterAgent ? "All versions" : "Agent first"}</option>
            <option value="none">Unknown version</option>
            {(versionsByAgent[filterAgent] ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.status} · {formatVersionLabel(v)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-0 sm:col-span-1 lg:col-span-2">
          <span style={labelStyle}>Client</span>
          <select style={inputStyle} value={filterClient} onChange={(e) => setFilterClient(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm py-10" style={{ color: "#78716c" }}>
          Pulling the case file…
        </p>
      ) : grouped.length === 0 ? (
        <div
          className="rounded-xl px-6 py-14 text-center"
          style={{ border: "1px dashed rgba(245,158,11,0.28)", background: "rgba(245,158,11,0.04)" }}
        >
          <p
            className="text-lg uppercase tracking-[0.2em]"
            style={{ color: "#fbbf24", fontFamily: "var(--font-report-display)" }}
          >
            No open cases
          </p>
          <p className="text-sm mt-2" style={{ color: "#78716c" }}>
            Share the report form. New tickets land here, not on prompt updates.
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.map((group, gi) => (
            <section
              key={group.type}
              style={{ animation: `closebotLedgerIn 420ms ease ${gi * 70}ms both` }}
            >
              <header className="flex items-end justify-between gap-3 mb-2 pb-2" style={{ borderBottom: "2px solid rgba(245,158,11,0.35)" }}>
                <div className="flex items-baseline gap-3 min-w-0">
                  <span
                    className="text-[11px] font-semibold tabular-nums"
                    style={{ color: "#f59e0b", fontFamily: "var(--font-plex-mono)" }}
                  >
                    {group.code}
                  </span>
                  <BugTypeHint label={group.label} description={group.description}>
                    <h3
                      className="text-2xl uppercase leading-none tracking-wide"
                      style={{ color: "#fef3c7", fontFamily: "var(--font-report-display)" }}
                      tabIndex={group.description ? 0 : undefined}
                    >
                      {group.label}
                    </h3>
                  </BugTypeHint>
                </div>
                <span
                  className="text-xs tabular-nums"
                  style={{ color: "#b45309", fontFamily: "var(--font-plex-mono)" }}
                >
                  {String(group.tickets.length).padStart(2, "0")}
                </span>
              </header>
              <ul className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {group.tickets.map((ticket) => {
                  const agent = embedOne(ticket.agent);
                  const client = embedOne(ticket.client);
                  const version = embedOne(ticket.agent_version);
                  const meta = CLOSEBOT_TICKET_STATUS_META[ticket.status] ?? CLOSEBOT_TICKET_STATUS_META.new;
                  const expanded = expandedId === ticket.id;
                  return (
                    <li key={ticket.id}>
                      <button
                        type="button"
                        className="w-full text-left py-3 px-1 hover:bg-white/[0.02] transition-colors"
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
                        <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] gap-3 items-start">
                          <span
                            className="text-[11px] tabular-nums pt-0.5"
                            style={{ color: "#a8a29e", fontFamily: "var(--font-plex-mono)" }}
                          >
                            {formatLogDate(ticket.occurred_at)}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "#f5f5f4" }}>
                              {client?.name ?? "Unknown client"}
                              <span style={{ color: "#78716c" }}> · {agent?.name ?? "Unknown agent"}</span>
                            </p>
                            <p className="text-sm mt-0.5 line-clamp-2" style={{ color: "#a8a29e" }}>
                              {ticket.description}
                            </p>
                          </div>
                          <span
                            className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded shrink-0"
                            style={{ color: meta.color, background: `${meta.color}22`, fontFamily: "var(--font-archivo)" }}
                          >
                            {meta.label}
                          </span>
                        </div>
                      </button>
                      {expanded && (
                        <div className="pb-4 pl-[5.5rem] space-y-3">
                          <div className="flex flex-wrap gap-3 text-[11px]" style={{ fontFamily: "var(--font-plex-mono)", color: "#a8a29e" }}>
                            <span>
                              v {formatVersionLabel(
                                version ?? (ticket.agent_version_id ? { id: ticket.agent_version_id } : null),
                              )}
                            </span>
                            <span>by {ticket.reporter_name}</span>
                            <a
                              href={ticket.contact_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline decoration-amber-700/60"
                              style={{ color: "#fbbf24" }}
                            >
                              Contact
                            </a>
                          </div>
                          {canWrite ? (
                            <div className="grid gap-3 sm:grid-cols-2 max-w-2xl">
                              <label className="space-y-1">
                                <span style={labelStyle}>Type</span>
                                <select
                                  style={inputStyle}
                                  disabled={savingId === ticket.id}
                                  value={ticket.bug_type ?? ""}
                                  onChange={(e) =>
                                    void patchTicket(ticket.id, {
                                      bug_type: e.target.value || null,
                                    })
                                  }
                                >
                                  <option value="">Unclassified</option>
                                  {bugTypes.filter((t) => t.is_active || t.slug === ticket.bug_type).map((t) => (
                                    <option key={t.slug} value={t.slug} title={t.description ?? ""}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </label>
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
                                  <span style={labelStyle}>Linked update</span>
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
                                <span style={labelStyle}>Notes</span>
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
                              <p className="text-xs" style={{ color: "#a8a29e" }}>
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
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
