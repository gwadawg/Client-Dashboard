"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import ClosebotAgentsSection from "@/components/ClosebotAgentsSection";
import ClosebotPersonasSection from "@/components/ClosebotPersonasSection";
import {
  CLOSEBOT_LOG_STATUSES,
  CLOSEBOT_STATUS_META,
  dateInputFromIso,
  formatLogDate,
  type ClosebotAgent,
  type ClosebotLogStatus,
  type ClosebotPromptLog,
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
  canWrite?: boolean;
};

type FormState = {
  id: string | null;
  agent_id: string;
  changed_at: string;
  problem_solved: string;
  change_reason: string;
  reference_urls: string;
  prompt_body: string;
  status: ClosebotLogStatus;
  outcome_notes: string;
  attach_pending_version: boolean;
};

function emptyForm(): FormState {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: null,
    agent_id: "",
    changed_at: today,
    problem_solved: "",
    change_reason: "",
    reference_urls: "",
    prompt_body: "",
    status: "watching",
    outcome_notes: "",
    attach_pending_version: true,
  };
}

function agentFromLog(log: ClosebotPromptLog): ClosebotPromptLog["agent"] {
  const a = log.agent;
  if (!a) return null;
  // Supabase embed can return object or array depending on relationship
  if (Array.isArray(a)) return a[0] ?? null;
  return a;
}

function urlsFromTextarea(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export default function ClosebotPromptLog({ canWrite = false }: Props) {
  const [agents, setAgents] = useState<ClosebotAgent[]>([]);
  const [logs, setLogs] = useState<ClosebotPromptLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filterAgent, setFilterAgent] = useState("");
  const [filterStatus, setFilterStatus] = useState<"" | ClosebotLogStatus>("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [agentsOpen, setAgentsOpen] = useState(false);

  const activeAgents = useMemo(() => agents.filter((a) => a.is_active), [agents]);

  const loadAgents = useCallback(async () => {
    const res = await fetch("/api/closebot/agents");
    if (!res.ok) return;
    const data = await res.json();
    setAgents(Array.isArray(data) ? data : []);
  }, []);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterAgent) params.set("agent_id", filterAgent);
      if (filterStatus) params.set("status", filterStatus);
      if (filterFrom) params.set("from", filterFrom);
      if (filterTo) params.set("to", filterTo);
      params.set("limit", "50");
      const res = await fetch(`/api/closebot/logs?${params}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load logs");
        setLogs([]);
        return;
      }
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      setError("Failed to load logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [filterAgent, filterStatus, filterFrom, filterTo]);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  function openCreate() {
    const f = emptyForm();
    if (activeAgents.length === 1) f.agent_id = activeAgents[0].id;
    setForm(f);
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(log: ClosebotPromptLog) {
    setForm({
      id: log.id,
      agent_id: log.agent_id,
      changed_at: dateInputFromIso(log.changed_at),
      problem_solved: log.problem_solved,
      change_reason: log.change_reason,
      reference_urls: (log.reference_urls ?? []).join("\n"),
      prompt_body: log.prompt_body,
      status: log.status,
      outcome_notes: log.outcome_notes ?? "",
      attach_pending_version: Boolean(log.agent_version_id),
    });
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const hasPending = Boolean(agents.find((a) => a.id === form.agent_id)?.pending_version);
      const payload: Record<string, unknown> = {
        agent_id: form.agent_id,
        changed_at: form.changed_at,
        problem_solved: form.problem_solved,
        change_reason: form.change_reason,
        reference_urls: urlsFromTextarea(form.reference_urls),
        prompt_body: form.prompt_body,
        status: form.status,
        outcome_notes: form.outcome_notes.trim() || null,
      };
      if (hasPending) {
        payload.attach_pending_version = form.attach_pending_version;
      }
      const res = await fetch(form.id ? `/api/closebot/logs/${form.id}` : "/api/closebot/logs", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setFormError(data.error || "Could not save log");
        return;
      }
      setModalOpen(false);
      await loadLogs();
      await loadAgents();
    } catch {
      setFormError("Could not save log");
    } finally {
      setSaving(false);
    }
  }

  async function copyPrompt(log: ClosebotPromptLog) {
    try {
      await navigator.clipboard.writeText(log.prompt_body);
      setCopiedId(log.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  const agentOptionsForForm = useMemo(() => {
    if (!form.id) return activeAgents;
    // When editing, include archived current agent so selection stays valid
    const current = agents.find((a) => a.id === form.agent_id);
    if (current && !current.is_active) {
      return [current, ...activeAgents.filter((a) => a.id !== current.id)];
    }
    return activeAgents;
  }, [form.id, form.agent_id, activeAgents, agents]);

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <span
            className="inline-block rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] mb-3"
            style={{
              background: "rgba(96,165,250,0.10)",
              color: "#60a5fa",
              border: "1px solid rgba(96,165,250,0.25)",
            }}
          >
            Closebot
          </span>
          <h2 className="text-2xl font-semibold tracking-tight" style={{ color: "#f1f5f9" }}>
            Prompt Log
          </h2>
          <p className="text-sm mt-1 max-w-xl" style={{ color: "#64748b" }}>
            What we changed, why, and whether it worked — tied to each Closebot agent.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAgentsOpen((v) => !v)}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold"
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#e2e8f0",
              background: agentsOpen ? "rgba(96,165,250,0.12)" : "transparent",
            }}
          >
            {agentsOpen ? "Hide directory" : `Directory (${agents.length})`}
          </button>
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="rounded-lg px-4 py-2.5 text-sm font-semibold"
              style={{ background: "#3b82f6", color: "#fff" }}
              disabled={activeAgents.length === 0}
              title={
                activeAgents.length === 0
                  ? "Add an agent first"
                  : undefined
              }
            >
              Log update
            </button>
          )}
        </div>
      </div>

      {(agentsOpen || agents.length === 0) && (
        <div
          className="rounded-xl p-4"
          style={{
            background: "rgba(255,255,255,0.02)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}
        >
          <ClosebotPersonasSection
            canManage={canWrite}
            onPersonasChanged={() => {
              void loadAgents();
              setAgentsOpen(true);
            }}
          />
          <div className="mt-8">
            <ClosebotAgentsSection
              canManage={canWrite}
              embedded
              onAgentsChanged={() => {
                void loadAgents();
                setAgentsOpen(true);
              }}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      <div
        className="flex flex-wrap gap-3 rounded-xl p-3"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <label className="space-y-1 min-w-[10rem] flex-1">
          <span style={labelStyle}>Agent</span>
          <select
            style={inputStyle}
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
          >
            <option value="">Any agent</option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {!a.is_active ? " (archived)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-[9rem]">
          <span style={labelStyle}>Status</span>
          <select
            style={inputStyle}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "" | ClosebotLogStatus)}
          >
            <option value="">Any status</option>
            {CLOSEBOT_LOG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CLOSEBOT_STATUS_META[s].label}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 min-w-[8rem]">
          <span style={labelStyle}>From</span>
          <input
            type="date"
            style={inputStyle}
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </label>
        <label className="space-y-1 min-w-[8rem]">
          <span style={labelStyle}>To</span>
          <input
            type="date"
            style={inputStyle}
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </label>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm py-12" style={{ color: "#64748b" }}>
          Loading timeline…
        </p>
      ) : agents.length === 0 ? (
        <div
          className="rounded-xl px-6 py-10 text-center"
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}
        >
          <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
            Add a Closebot agent above to start logging prompt updates.
          </p>
        </div>
      ) : logs.length === 0 ? (
        <div
          className="rounded-xl px-6 py-14 text-center"
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}
        >
          <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>
            No prompt updates yet
          </p>
          <p className="text-xs mt-2" style={{ color: "#64748b" }}>
            {canWrite
              ? "Log your first prompt change to start the timeline."
              : "No entries match these filters."}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {logs.map((log) => {
            const agent = agentFromLog(log);
            const meta = CLOSEBOT_STATUS_META[log.status] ?? CLOSEBOT_STATUS_META.watching;
            const expanded = expandedId === log.id;
            return (
              <li
                key={log.id}
                className="rounded-xl overflow-hidden"
                style={{
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.07)",
                }}
              >
                <button
                  type="button"
                  className="w-full text-left px-4 py-3"
                  onClick={() => setExpandedId(expanded ? null : log.id)}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <span className="text-xs font-medium tabular-nums" style={{ color: "#94a3b8" }}>
                      {formatLogDate(log.changed_at)}
                    </span>
                    <span className="text-xs font-semibold" style={{ color: "#e2e8f0" }}>
                      {agent?.name ?? "Unknown agent"}
                    </span>
                    {agent && !agent.is_active && (
                      <span
                        className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(100,116,139,0.25)", color: "#94a3b8" }}
                      >
                        Archived
                      </span>
                    )}
                    <span
                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                      style={{
                        color: meta.color,
                        background: `${meta.color}22`,
                      }}
                    >
                      {meta.label}
                    </span>
                    {log.agent_version_id && (
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}
                      >
                        Agent config
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-medium" style={{ color: "#f1f5f9" }}>
                    {log.problem_solved}
                  </p>
                  <p
                    className="text-xs mt-1 line-clamp-2"
                    style={{ color: "#64748b" }}
                  >
                    {log.change_reason}
                  </p>
                  {(log.reference_urls?.length ?? 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2" onClick={(e) => e.stopPropagation()}>
                      {log.reference_urls.map((url) => (
                        <a
                          key={url}
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] px-2 py-0.5 rounded-full truncate max-w-[12rem]"
                          style={{
                            background: "rgba(96,165,250,0.12)",
                            color: "#93c5fd",
                            border: "1px solid rgba(96,165,250,0.2)",
                          }}
                          title={url}
                        >
                          {(() => {
                            try {
                              return new URL(url).hostname.replace(/^www\./, "");
                            } catch {
                              return "link";
                            }
                          })()}
                        </a>
                      ))}
                    </div>
                  )}
                </button>

                {expanded && (
                  <div
                    className="px-4 pb-4 pt-1 space-y-3 border-t"
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span style={labelStyle}>Prompt</span>
                        <button
                          type="button"
                          onClick={() => void copyPrompt(log)}
                          className="text-[10px] font-semibold"
                          style={{ color: "#60a5fa" }}
                        >
                          {copiedId === log.id ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <pre
                        className="text-xs overflow-x-auto max-h-64 overflow-y-auto p-3 rounded-lg whitespace-pre-wrap font-mono"
                        style={{
                          background: "#050c18",
                          color: "#cbd5e1",
                          border: "1px solid rgba(255,255,255,0.08)",
                        }}
                      >
                        {log.prompt_body}
                      </pre>
                    </div>
                    {log.outcome_notes && (
                      <div>
                        <span style={labelStyle}>Outcome notes</span>
                        <p className="text-xs mt-1" style={{ color: "#94a3b8" }}>
                          {log.outcome_notes}
                        </p>
                      </div>
                    )}
                    {canWrite && (
                      <button
                        type="button"
                        onClick={() => openEdit(log)}
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                        style={{
                          border: "1px solid rgba(255,255,255,0.12)",
                          color: "#e2e8f0",
                        }}
                      >
                        Edit / update status
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
          style={{ background: "rgba(0,0,0,0.7)" }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-2xl p-5 space-y-3 my-8"
            style={{ background: "#0c1829", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
              {form.id ? "Edit prompt update" : "Log prompt update"}
            </h3>

            <label className="block space-y-1">
              <span style={labelStyle}>Agent</span>
              <select
                style={inputStyle}
                value={form.agent_id}
                onChange={(e) => setForm((f) => ({ ...f, agent_id: e.target.value }))}
              >
                <option value="">Select agent…</option>
                {agentOptionsForForm.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {!a.is_active ? " (archived)" : ""}
                  </option>
                ))}
              </select>
              {canWrite && (
                <button
                  type="button"
                  className="text-[11px] underline"
                  style={{ color: "#60a5fa" }}
                  onClick={() => {
                    setModalOpen(false);
                    setAgentsOpen(true);
                  }}
                >
                  Manage agents
                </button>
              )}
            </label>

            {Boolean(agents.find((a) => a.id === form.agent_id)?.pending_version) && (
              <label className="flex items-start gap-2 text-sm" style={{ color: "#cbd5e1" }}>
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={form.attach_pending_version}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, attach_pending_version: e.target.checked }))
                  }
                />
                <span>
                  Attach pending agent config to this update.
                  <span className="block text-xs mt-0.5" style={{ color: "#64748b" }}>
                    Marking this log Worked will make that config live. Didn’t work or Reverted
                    rejects it.
                  </span>
                </span>
              </label>
            )}

            <label className="block space-y-1">
              <span style={labelStyle}>Live date</span>
              <input
                type="date"
                style={inputStyle}
                value={form.changed_at}
                onChange={(e) => setForm((f) => ({ ...f, changed_at: e.target.value }))}
              />
            </label>

            <label className="block space-y-1">
              <span style={labelStyle}>Problem this solves</span>
              <input
                style={inputStyle}
                value={form.problem_solved}
                onChange={(e) => setForm((f) => ({ ...f, problem_solved: e.target.value }))}
                placeholder="Short problem statement"
              />
            </label>

            <label className="block space-y-1">
              <span style={labelStyle}>Why we changed it</span>
              <textarea
                style={{ ...inputStyle, minHeight: "4rem", resize: "vertical" }}
                value={form.change_reason}
                onChange={(e) => setForm((f) => ({ ...f, change_reason: e.target.value }))}
                placeholder="Why this update shipped"
              />
            </label>

            <label className="block space-y-1">
              <span style={labelStyle}>Reference links (one per line)</span>
              <textarea
                style={{ ...inputStyle, minHeight: "3.5rem", resize: "vertical" }}
                value={form.reference_urls}
                onChange={(e) => setForm((f) => ({ ...f, reference_urls: e.target.value }))}
                placeholder="https://ticket…&#10;https://slack…"
              />
            </label>

            <label className="block space-y-1">
              <span style={labelStyle}>New prompt</span>
              <textarea
                style={{
                  ...inputStyle,
                  minHeight: "10rem",
                  resize: "vertical",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: "0.75rem",
                }}
                value={form.prompt_body}
                onChange={(e) => setForm((f) => ({ ...f, prompt_body: e.target.value }))}
                placeholder="Paste the full prompt as updated in Closebot"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span style={labelStyle}>Status</span>
                <select
                  style={inputStyle}
                  value={form.status}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, status: e.target.value as ClosebotLogStatus }))
                  }
                >
                  {CLOSEBOT_LOG_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {CLOSEBOT_STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span style={labelStyle}>Outcome notes</span>
                <input
                  style={inputStyle}
                  value={form.outcome_notes}
                  onChange={(e) => setForm((f) => ({ ...f, outcome_notes: e.target.value }))}
                  placeholder="Optional"
                />
              </label>
            </div>

            {formError && (
              <p className="text-xs" style={{ color: "#f87171" }}>
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-2 pt-2">
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
                disabled={
                  saving ||
                  !form.agent_id ||
                  !form.problem_solved.trim() ||
                  !form.change_reason.trim() ||
                  !form.prompt_body.trim()
                }
                onClick={() => void handleSave()}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "#3b82f6", color: "#fff" }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
