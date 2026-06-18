"use client";

import { useEffect, useState } from "react";

type Client = { id: string; name: string };
type Goal = {
  id: string;
  client_id: string;
  agent_name: string | null;
  metric: string;
  target: number;
  period: string;
};

type Props = {
  clients: Client[];
  startDate: string;
  endDate: string;
  mode?: "agents";
};

const AGENT_METRICS = [
  { key: "dials", label: "Daily Dials" },
  { key: "appointments", label: "Daily Appointments" },
  { key: "pickups", label: "Daily Pickups" },
  { key: "shows", label: "Daily Shows" },
];

export default function GoalTracker({ clients, startDate, endDate, mode = "agents" }: Props) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [agentName, setAgentName] = useState("");
  const [adding, setAdding] = useState(false);
  const [newGoal, setNewGoal] = useState({ metric: "dials", target: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const rosterClientId = clients[0]?.id ?? "";

  useEffect(() => {
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    fetch(`/api/agent-stats?${params}`)
      .then(r => r.json())
      .then(d => {
        const names = (d.agents ?? [])
          .map((a: { agent_name: string }) => a.agent_name)
          .filter(Boolean);
        setAgents(names);
      })
      .catch(() => setAgents([]));
  }, [startDate, endDate]);

  function loadGoals() {
    fetch("/api/goals")
      .then(r => r.json())
      .then(d => {
        const all: Goal[] = d.goals ?? [];
        setGoals(all.filter(g => g.period === "daily" && g.agent_name));
      });
  }

  useEffect(() => {
    loadGoals();
  }, [startDate, endDate]);

  async function handleAdd() {
    if (!agentName || !newGoal.target || !rosterClientId) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: rosterClientId,
        agent_name: agentName,
        metric: newGoal.metric,
        target: Number(newGoal.target),
        period: "daily",
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to save");
      return;
    }
    setAdding(false);
    setNewGoal({ metric: "dials", target: "" });
    loadGoals();
  }

  async function handleDelete(id: string) {
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    loadGoals();
  }

  const selectStyle = {
    background: "#0a1628",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    outline: "none",
    width: "100%",
  } as React.CSSProperties;

  const agentGoals = agentName
    ? goals.filter(g => g.agent_name === agentName)
    : goals;

  if (mode !== "agents") return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Agent Goals</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Set daily KPI targets — shown on Performance scorecards as progress rings
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            style={{ ...selectStyle, width: "auto", minWidth: "11rem" }}
            value={agentName}
            onChange={e => setAgentName(e.target.value)}
          >
            <option value="">All agents</option>
            {agents.map(name => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
          {agentName && !adding && (
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#f59e0b", color: "#fff" }}
            >
              Add Goal
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="px-4 py-3 rounded-lg text-sm"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.25)",
            color: "#f87171",
          }}
        >
          {error}
        </div>
      )}

      {agentName && adding && (
        <div
          className="rounded-xl p-4 space-y-3"
          style={{ background: "#0a1628", border: "1px solid rgba(245,158,11,0.25)" }}
        >
          <p className="text-sm font-semibold" style={{ color: "#f59e0b" }}>
            New daily goal for {agentName}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Metric</label>
              <select
                style={selectStyle}
                value={newGoal.metric}
                onChange={e => setNewGoal(s => ({ ...s, metric: e.target.value }))}
              >
                {AGENT_METRICS.map(m => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Daily target</label>
              <input
                style={selectStyle}
                type="number"
                placeholder="e.g. 120"
                value={newGoal.target}
                onChange={e => setNewGoal(s => ({ ...s, target: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setAdding(false); setError(""); }}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={saving || !newGoal.target}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "#f59e0b", color: "#fff" }}
            >
              {saving ? "Saving…" : "Save Goal"}
            </button>
          </div>
        </div>
      )}

      {agentGoals.length === 0 && !adding && (
        <div
          className="rounded-xl py-12 text-center text-sm"
          style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.05)", color: "#1e3a5f" }}
        >
          {agentName
            ? `No daily goals for ${agentName} — add one above`
            : "No agent goals yet — select an agent to set daily targets"}
        </div>
      )}

      {agentGoals.length > 0 && (
        <div className="space-y-3">
          {agentGoals.map(g => {
            const metricLabel = AGENT_METRICS.find(m => m.key === g.metric)?.label ?? g.metric;
            return (
              <div
                key={g.id}
                className="rounded-xl px-5 py-4 flex items-center justify-between gap-4 group"
                style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>{g.agent_name}</p>
                  <p className="text-xs mt-0.5" style={{ color: "#475569" }}>
                    {metricLabel} · target {g.target}/day
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(g.id)}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-xs px-2 py-1 rounded"
                  style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)" }}
                >
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
