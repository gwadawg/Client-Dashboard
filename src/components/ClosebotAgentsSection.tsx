"use client";

import { useCallback, useEffect, useState } from "react";
import type { ClosebotAgent } from "@/lib/closebot";

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

type Props = {
  canManage: boolean;
};

export default function ClosebotAgentsSection({ canManage }: Props) {
  const [agents, setAgents] = useState<ClosebotAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ClosebotAgent | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/closebot/agents?counts=1");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to load agents");
        setAgents([]);
        return;
      }
      const data = await res.json();
      setAgents(Array.isArray(data) ? data : []);
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

  function openAdd() {
    setEditing(null);
    setName("");
    setDescription("");
    setFormError(null);
    setModalOpen(true);
  }

  function openEdit(agent: ClosebotAgent) {
    setEditing(agent);
    setName(agent.name);
    setDescription(agent.description ?? "");
    setFormError(null);
    setModalOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
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
    } catch {
      setError("Could not update agent");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold" style={{ color: "#f1f5f9" }}>
            Closebot Agents
          </h3>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
            Options for the prompt log — which AI agent each update applies to.
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
              ? "Add agents here, then log prompt changes from Ops → Closebot Log."
              : "Ask an ops lead to add Closebot agents."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {agents.map((agent) => (
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
                  <span className="text-xs" style={{ color: "#475569" }}>
                    {agent.log_count ?? 0} log{(agent.log_count ?? 0) === 1 ? "" : "s"}
                  </span>
                </div>
                {agent.description && (
                  <p className="text-xs mt-1" style={{ color: "#64748b" }}>
                    {agent.description}
                  </p>
                )}
                <p className="text-[10px] mt-1 font-mono" style={{ color: "#334155" }}>
                  {agent.slug}
                </p>
              </div>
              {canManage && (
                <div className="flex items-center gap-2">
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
          ))}
        </ul>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => !saving && setModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl p-5 space-y-4"
            style={{ background: "#0c1829", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h4 className="text-base font-semibold" style={{ color: "#f1f5f9" }}>
              {editing ? "Edit agent" : "Add Closebot agent"}
            </h4>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Name
              </span>
              <input
                style={inputStyle}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Qualifier"
                autoFocus
              />
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#64748b" }}>
                Description (optional)
              </span>
              <textarea
                style={{ ...inputStyle, minHeight: "4.5rem", resize: "vertical" }}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this agent handles"
              />
            </label>
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
                disabled={saving || !name.trim()}
                onClick={() => void handleSave()}
                className="text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                style={{ background: "#f59e0b", color: "#1a1206" }}
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
