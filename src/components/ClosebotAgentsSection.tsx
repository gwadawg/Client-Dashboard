"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CLOSEBOT_NODE_TYPES,
  CLOSEBOT_NODE_TYPE_META,
  emptyAgentNode,
  emptyFollowUp,
  emptyFollowUpType,
  type ClosebotAgent,
  type ClosebotAgentNode,
  type ClosebotAgentVersion,
  type ClosebotFollowUp,
  type ClosebotPersona,
  type ClosebotVersionStatus,
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

const VERSION_META: Record<ClosebotVersionStatus, { label: string; color: string }> = {
  pending: { label: "Pending", color: "#60a5fa" },
  live: { label: "Live", color: "#34d399" },
  superseded: { label: "Superseded", color: "#94a3b8" },
  rejected: { label: "Rejected", color: "#f87171" },
};

type Props = {
  canManage: boolean;
  onAgentsChanged?: () => void;
  embedded?: boolean;
};

type AgentForm = {
  name: string;
  description: string;
  job_information: string;
  persona_id: string;
  nodes: ClosebotAgentNode[];
  follow_ups: ClosebotFollowUp[];
};

function emptyForm(): AgentForm {
  return {
    name: "",
    description: "",
    job_information: "",
    persona_id: "",
    nodes: [],
    follow_ups: [],
  };
}

function personaLabel(agent: ClosebotAgent): string | null {
  const p = agent.persona;
  if (!p) return null;
  if (Array.isArray(p)) return p[0]?.name ?? null;
  return p.name ?? null;
}

function formFromSnapshot(
  source: Pick<
    ClosebotAgent | ClosebotAgentVersion,
    "name" | "description" | "job_information" | "persona_id" | "nodes" | "follow_ups"
  >,
): AgentForm {
  return {
    name: source.name ?? "",
    description: source.description ?? "",
    job_information: source.job_information ?? "",
    persona_id: source.persona_id ?? "",
    nodes: Array.isArray(source.nodes)
      ? source.nodes.map((n) => ({
          type: n.type,
          name: n.name ?? "",
          description: n.description ?? "",
          prompt: n.prompt ?? "",
        }))
      : [],
    follow_ups: Array.isArray(source.follow_ups) ? source.follow_ups : [],
  };
}

export default function ClosebotAgentsSection({
  canManage,
  onAgentsChanged,
  embedded = false,
}: Props) {
  const [agents, setAgents] = useState<ClosebotAgent[]>([]);
  const [personas, setPersonas] = useState<ClosebotPersona[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClosebotAgent | null>(null);
  const [form, setForm] = useState<AgentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [historyAgent, setHistoryAgent] = useState<ClosebotAgent | null>(null);
  const [versions, setVersions] = useState<ClosebotAgentVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [agentsRes, personasRes] = await Promise.all([
        fetch("/api/closebot/agents?counts=1"),
        fetch("/api/closebot/personas"),
      ]);
      if (!agentsRes.ok) {
        const data = await agentsRes.json().catch(() => ({}));
        setError(data.error || "Failed to load agents");
        setAgents([]);
        return;
      }
      const data = await agentsRes.json();
      setAgents(Array.isArray(data) ? data : []);
      if (personasRes.ok) {
        const p = await personasRes.json();
        setPersonas(Array.isArray(p) ? p : []);
      }
    } catch {
      setError("Failed to load agents");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activePersonas = useMemo(() => personas.filter((p) => p.is_active), [personas]);

  function openAdd() {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(agent: ClosebotAgent) {
    setEditing(agent);
    setForm(formFromSnapshot(agent.pending_version ?? agent));
    setFormError(null);
    setModalOpen(true);
  }

  async function openHistory(agent: ClosebotAgent) {
    setHistoryAgent(agent);
    setHistoryLoading(true);
    setExpandedVersion(null);
    try {
      const res = await fetch(`/api/closebot/agents/${agent.id}/versions`);
      const data = await res.json().catch(() => ({}));
      setVersions(Array.isArray(data.versions) ? data.versions : []);
    } catch {
      setVersions([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        job_information: form.job_information.trim() || null,
        persona_id: form.persona_id || null,
        nodes: form.nodes
          .filter((n) => n.name.trim())
          .map((n) => ({
            ...n,
            name: n.name.trim(),
            description: n.description.trim(),
            prompt: (n.prompt ?? "").trim(),
          })),
        follow_ups: form.follow_ups
          .filter((fu) => fu.name.trim())
          .map((fu) => ({
            name: fu.name.trim(),
            prompt: fu.prompt.trim(),
            types: fu.types
              .filter((t) => t.label.trim())
              .map((t) => ({ label: t.label.trim(), details: t.details.trim() })),
          })),
      };
      const res = await fetch(
        editing ? `/api/closebot/agents/${editing.id}` : "/api/closebot/agents",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || "Could not save agent");
        return;
      }
      setModalOpen(false);
      await load();
      onAgentsChanged?.();
    } catch {
      setFormError("Could not save agent");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(agent: ClosebotAgent) {
    try {
      const res = await fetch(`/api/closebot/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !agent.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Could not update agent");
        return;
      }
      await load();
      onAgentsChanged?.();
    } catch {
      setError("Could not update agent");
    }
  }

  const personaOptions = useMemo(() => {
    if (!form.persona_id) return activePersonas;
    const current = personas.find((p) => p.id === form.persona_id);
    if (current && !current.is_active) {
      return [current, ...activePersonas.filter((p) => p.id !== current.id)];
    }
    return activePersonas;
  }, [form.persona_id, activePersonas, personas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3
            className={embedded ? "text-base font-semibold" : "text-lg font-semibold"}
            style={{ color: "#f1f5f9" }}
          >
            Agents
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
            Job info, persona, nodes, and follow-ups for each Closebot agent.
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openAdd}
            className="rounded-lg px-4 py-2 text-sm font-semibold"
            style={{ background: "#f59e0b", color: "#1a1206" }}
          >
            Add agent
          </button>
        )}
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm py-8" style={{ color: "#64748b" }}>
          Loading agents…
        </p>
      ) : agents.length === 0 ? (
        <div
          className="rounded-xl px-6 py-12 text-center"
          style={{ border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)" }}
        >
          <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
            No Closebot agents yet
          </p>
          <p className="text-xs mt-1" style={{ color: "#64748b" }}>
            {canManage
              ? "Add an agent with job info, nodes, and follow-ups, then log prompt changes."
              : "Ask an ops lead to add Closebot agents."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {agents.map((agent) => {
            const personaName = personaLabel(agent);
            const nodeCount = Array.isArray(agent.nodes) ? agent.nodes.length : 0;
            const fuCount = Array.isArray(agent.follow_ups) ? agent.follow_ups.length : 0;
            return (
              <li
                key={agent.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-xl px-4 py-3"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm" style={{ color: "#e2e8f0" }}>
                      {agent.name}
                    </span>
                    {!agent.is_active && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(100,116,139,0.25)", color: "#94a3b8" }}
                      >
                        Archived
                      </span>
                    )}
                    {agent.pending_version && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(96,165,250,0.18)", color: "#93c5fd" }}
                      >
                        Pending changes
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "#475569" }}>
                      {agent.log_count ?? 0} log{(agent.log_count ?? 0) === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    {personaName ? `Persona: ${personaName}` : "No persona"}
                    {" · "}
                    {nodeCount} node{nodeCount === 1 ? "" : "s"}
                    {" · "}
                    {fuCount} follow-up{fuCount === 1 ? "" : "s"}
                  </p>
                  {agent.description && (
                    <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                      {agent.description}
                    </p>
                  )}
                </div>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void openHistory(agent)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      History
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(agent)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      style={{ color: "#94a3b8", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void toggleActive(agent)}
                      className="text-xs font-medium px-2.5 py-1.5 rounded-lg"
                      style={{
                        color: agent.is_active ? "#fbbf24" : "#34d399",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      {agent.is_active ? "Archive" : "Reactivate"}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="w-full max-w-2xl rounded-2xl p-5 space-y-4 my-8"
            style={{ background: "#0c1829", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h4 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
                {editing ? "Edit agent" : "Add Closebot agent"}
              </h4>
              {editing && (
                <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                  Edits save as pending until a prompt log for this agent is marked Worked.
                </p>
              )}
            </div>

            <label className="block space-y-1">
              <span style={labelStyle}>Name</span>
              <input
                style={inputStyle}
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Qualifier"
                autoFocus
              />
            </label>

            <label className="block space-y-1">
              <span style={labelStyle}>Job information</span>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: "8rem",
                  resize: "vertical",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                }}
                value={form.job_information}
                onChange={(e) => setForm((f) => ({ ...f, job_information: e.target.value }))}
                placeholder="Paste the full job information from Closebot"
              />
            </label>

            <label className="block space-y-1">
              <span style={labelStyle}>Persona</span>
              <select
                style={inputStyle}
                value={form.persona_id}
                onChange={(e) => setForm((f) => ({ ...f, persona_id: e.target.value }))}
              >
                <option value="">None</option>
                {personaOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {!p.is_active ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span style={labelStyle}>Nodes</span>
                <button
                  type="button"
                  className="text-[11px] font-semibold"
                  style={{ color: "#60a5fa" }}
                  onClick={() =>
                    setForm((f) => ({ ...f, nodes: [...f.nodes, emptyAgentNode()] }))
                  }
                >
                  Add node
                </button>
              </div>
              {form.nodes.length === 0 && (
                <p className="text-xs" style={{ color: "#475569" }}>
                  Optional. Add labeled nodes (not the Closebot prompt).
                </p>
              )}
              {form.nodes.map((node, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 space-y-2"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex justify-between gap-2">
                    <select
                      style={inputStyle}
                      value={node.type}
                      onChange={(e) => {
                        const type = e.target.value as ClosebotAgentNode["type"];
                        setForm((f) => ({
                          ...f,
                          nodes: f.nodes.map((n, idx) => (idx === i ? { ...n, type } : n)),
                        }));
                      }}
                    >
                      {CLOSEBOT_NODE_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {CLOSEBOT_NODE_TYPE_META[t].label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="text-[11px] shrink-0"
                      style={{ color: "#f87171" }}
                      onClick={() =>
                        setForm((f) => ({ ...f, nodes: f.nodes.filter((_, idx) => idx !== i) }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <input
                    style={inputStyle}
                    placeholder="Node name (ours)"
                    value={node.name}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        nodes: f.nodes.map((n, idx) =>
                          idx === i ? { ...n, name: e.target.value } : n,
                        ),
                      }))
                    }
                  />
                  <label className="block space-y-1">
                    <span style={labelStyle}>What it should do</span>
                    <textarea
                      style={{ ...inputStyle, minHeight: "3.5rem", resize: "vertical" }}
                      placeholder="Short note for us — not the Closebot prompt"
                      value={node.description}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          nodes: f.nodes.map((n, idx) =>
                            idx === i ? { ...n, description: e.target.value } : n,
                          ),
                        }))
                      }
                    />
                  </label>
                  <label className="block space-y-1">
                    <span style={labelStyle}>Prompt</span>
                    <textarea
                      style={{
                        ...inputStyle,
                        minHeight: "8rem",
                        resize: "vertical",
                        fontFamily: "ui-monospace, monospace",
                        fontSize: "0.75rem",
                      }}
                      placeholder="Paste the Closebot prompt for this node"
                      value={node.prompt ?? ""}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          nodes: f.nodes.map((n, idx) =>
                            idx === i ? { ...n, prompt: e.target.value } : n,
                          ),
                        }))
                      }
                    />
                  </label>
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span style={labelStyle}>Follow-ups</span>
                <button
                  type="button"
                  className="text-[11px] font-semibold"
                  style={{ color: "#60a5fa" }}
                  onClick={() =>
                    setForm((f) => ({ ...f, follow_ups: [...f.follow_ups, emptyFollowUp()] }))
                  }
                >
                  Add follow-up
                </button>
              </div>
              {form.follow_ups.map((fu, i) => (
                <div
                  key={i}
                  className="rounded-xl p-3 space-y-2"
                  style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  <div className="flex justify-between gap-2">
                    <input
                      style={inputStyle}
                      placeholder="Follow-up name"
                      value={fu.name}
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          follow_ups: f.follow_ups.map((row, idx) =>
                            idx === i ? { ...row, name: e.target.value } : row,
                          ),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="text-[11px] shrink-0"
                      style={{ color: "#f87171" }}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          follow_ups: f.follow_ups.filter((_, idx) => idx !== i),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    style={{ ...inputStyle, minHeight: "4.5rem", resize: "vertical" }}
                    placeholder="Follow-up prompt"
                    value={fu.prompt}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        follow_ups: f.follow_ups.map((row, idx) =>
                          idx === i ? { ...row, prompt: e.target.value } : row,
                        ),
                      }))
                    }
                  />
                  <div className="flex items-center justify-between">
                    <span style={labelStyle}>Settings types</span>
                    <button
                      type="button"
                      className="text-[11px] font-semibold"
                      style={{ color: "#93c5fd" }}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          follow_ups: f.follow_ups.map((row, idx) =>
                            idx === i
                              ? { ...row, types: [...row.types, emptyFollowUpType()] }
                              : row,
                          ),
                        }))
                      }
                    >
                      Add type
                    </button>
                  </div>
                  {fu.types.map((t, j) => (
                    <div key={j} className="space-y-1 pl-2" style={{ borderLeft: "2px solid rgba(96,165,250,0.25)" }}>
                      <div className="flex gap-2">
                        <input
                          style={inputStyle}
                          placeholder="Type label"
                          value={t.label}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              follow_ups: f.follow_ups.map((row, idx) =>
                                idx === i
                                  ? {
                                      ...row,
                                      types: row.types.map((tr, tidx) =>
                                        tidx === j ? { ...tr, label: e.target.value } : tr,
                                      ),
                                    }
                                  : row,
                              ),
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="text-[11px] shrink-0"
                          style={{ color: "#f87171" }}
                          onClick={() =>
                            setForm((f) => ({
                              ...f,
                              follow_ups: f.follow_ups.map((row, idx) =>
                                idx === i
                                  ? { ...row, types: row.types.filter((_, tidx) => tidx !== j) }
                                  : row,
                              ),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        style={{ ...inputStyle, minHeight: "3rem", resize: "vertical" }}
                        placeholder="Details / settings paste"
                        value={t.details}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            follow_ups: f.follow_ups.map((row, idx) =>
                              idx === i
                                ? {
                                    ...row,
                                    types: row.types.map((tr, tidx) =>
                                      tidx === j ? { ...tr, details: e.target.value } : tr,
                                    ),
                                  }
                                : row,
                            ),
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {formError && (
              <p className="text-xs" style={{ color: "#f87171" }}>
                {formError}
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setModalOpen(false)}
                className="text-sm px-3 py-2 rounded-lg"
                style={{ color: "#94a3b8" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !form.name.trim()}
                onClick={() => void handleSave()}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "#f59e0b", color: "#1a1206" }}
              >
                {saving ? "Saving…" : editing ? "Save pending" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {historyAgent && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => setHistoryAgent(null)}
        >
          <div
            className="w-full max-w-xl rounded-2xl p-5 space-y-3 my-8"
            style={{ background: "#0c1829", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
              History — {historyAgent.name}
            </h4>
            {historyLoading ? (
              <p className="text-sm" style={{ color: "#64748b" }}>
                Loading versions…
              </p>
            ) : versions.length === 0 ? (
              <p className="text-sm" style={{ color: "#64748b" }}>
                No versions stored yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {versions.map((v) => {
                  const meta = VERSION_META[v.status] ?? VERSION_META.superseded;
                  const open = expandedVersion === v.id;
                  return (
                    <li
                      key={v.id}
                      className="rounded-xl"
                      style={{ border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2"
                        onClick={() => setExpandedVersion(open ? null : v.id)}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                            style={{ color: meta.color, background: `${meta.color}22` }}
                          >
                            {meta.label}
                          </span>
                          <span className="text-xs" style={{ color: "#94a3b8" }}>
                            {new Date(v.updated_at).toLocaleString()}
                          </span>
                          <span className="text-xs" style={{ color: "#e2e8f0" }}>
                            {v.name}
                          </span>
                        </div>
                      </button>
                      {open && (
                        <div className="px-3 pb-3 space-y-2 text-xs" style={{ color: "#94a3b8" }}>
                          {v.persona_snapshot && (
                            <p>Persona: {v.persona_snapshot.name}</p>
                          )}
                          {v.job_information && (
                            <pre
                              className="whitespace-pre-wrap p-2 rounded-lg max-h-40 overflow-y-auto"
                              style={{ background: "#050c18" }}
                            >
                              {v.job_information}
                            </pre>
                          )}
                          <p>
                            {v.nodes?.length ?? 0} nodes · {v.follow_ups?.length ?? 0} follow-ups
                          </p>
                          {(v.nodes ?? []).map((n, i) => (
                            <div key={i}>
                              <p>
                                {CLOSEBOT_NODE_TYPE_META[n.type]?.label ?? n.type}: {n.name}
                                {n.description ? ` — ${n.description}` : ""}
                              </p>
                              {n.prompt && (
                                <pre
                                  className="whitespace-pre-wrap mt-1 p-2 rounded-lg max-h-40 overflow-y-auto"
                                  style={{ background: "#050c18", color: "#cbd5e1" }}
                                >
                                  {n.prompt}
                                </pre>
                              )}
                            </div>
                          ))}
                          {(v.follow_ups ?? []).map((fu, i) => (
                            <div key={i}>
                              <p className="font-medium" style={{ color: "#cbd5e1" }}>
                                Follow-up: {fu.name}
                              </p>
                              {fu.prompt && (
                                <pre className="whitespace-pre-wrap mt-1" style={{ color: "#64748b" }}>
                                  {fu.prompt}
                                </pre>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setHistoryAgent(null)}
                className="text-sm px-3 py-2 rounded-lg"
                style={{ color: "#94a3b8" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
