"use client";

import { useEffect, useState } from "react";

type PayRates = {
  base_salary: number;
  pay_per_booking: number;
  pay_per_show: number;
  pay_per_live_transfer: number;
};

type Agent = {
  id: string;
  phone: string;
  name: string;
  created_at: string;
} & PayRates;

type EditState = {
  phone: string;
  name: string;
} & PayRates;

const emptyPay: PayRates = {
  base_salary: 0,
  pay_per_booking: 0,
  pay_per_show: 0,
  pay_per_live_transfer: 0,
};

export default function AgentAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newAgent, setNewAgent] = useState<EditState>({ phone: "", name: "", ...emptyPay });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ phone: "", name: "", ...emptyPay });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/agents")
      .then(r => r.json())
      .then(d => { setAgents(d.agents ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function agentToEdit(a: Agent): EditState {
    return {
      phone: a.phone,
      name: a.name,
      base_salary: Number(a.base_salary) || 0,
      pay_per_booking: Number(a.pay_per_booking) || 0,
      pay_per_show: Number(a.pay_per_show) || 0,
      pay_per_live_transfer: Number(a.pay_per_live_transfer) || 0,
    };
  }

  async function handleAdd() {
    if (!newAgent.phone.trim() || !newAgent.name.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newAgent),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add agent"); return; }
    setNewAgent({ phone: "", name: "", ...emptyPay });
    setAdding(false);
    load();
  }

  async function handleUpdate(id: string) {
    if (!editState.phone.trim() || !editState.name.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editState),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update agent"); return; }
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Remove ${name} from the agent roster?`)) return;
    const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to delete agent"); return; }
    load();
  }

  const inputStyle = {
    background: "#0a1628",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    outline: "none",
    width: "100%",
  } as React.CSSProperties;

  const payInputStyle = { ...inputStyle, width: "5rem" } as React.CSSProperties;

  function PayFields({
    values,
    onChange,
  }: {
    values: PayRates;
    onChange: (patch: Partial<PayRates>) => void;
  }) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {([
          ["base_salary", "Base salary (mo)"],
          ["pay_per_booking", "$/booking"],
          ["pay_per_show", "$/show"],
          ["pay_per_live_transfer", "$/live transfer"],
        ] as const).map(([key, label]) => (
          <div key={key}>
            <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>{label}</label>
            <input
              type="number"
              min={0}
              step={0.01}
              style={payInputStyle}
              value={values[key]}
              onChange={e => onChange({ [key]: Number(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Agent Roster</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Map agent phone numbers to names and set default pay rates for the Agent Payroll tab
          </p>
        </div>
        {!adding && (
          <button
            onClick={() => { setAdding(true); setError(""); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            style={{ background: "#f59e0b", color: "#fff" }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add Agent
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {adding && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "#0a1628", border: "1px solid rgba(245,158,11,0.25)" }}>
          <p className="text-sm font-semibold" style={{ color: "#f59e0b" }}>New Agent</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Agent Number</label>
              <input
                style={inputStyle}
                placeholder={`ex: ${agents.length + 1}`}
                value={newAgent.phone}
                onChange={e => setNewAgent(s => ({ ...s, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Agent Name</label>
              <input
                style={inputStyle}
                placeholder="Jane Smith"
                value={newAgent.name}
                onChange={e => setNewAgent(s => ({ ...s, name: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
          </div>
          <PayFields values={newAgent} onChange={patch => setNewAgent(s => ({ ...s, ...patch }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setError(""); setNewAgent({ phone: "", name: "", ...emptyPay }); }}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
              Cancel
            </button>
            <button onClick={handleAdd} disabled={saving || !newAgent.phone || !newAgent.name}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "#f59e0b", color: "#fff" }}>
              {saving ? "Saving…" : "Save Agent"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["Agent Name", "Agent Number", "Base", "$/Bk", "$/Show", "$/Xfer", "Added", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>Loading…</td></tr>
            ) : agents.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                No agents yet — add your first agent above
              </td></tr>
            ) : agents.map((a, i) => (
              <tr key={a.id} style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                {editingId === a.id ? (
                  <td colSpan={8} className="px-4 py-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Agent Name</label>
                        <input style={inputStyle} value={editState.name} onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Agent Number</label>
                        <input style={inputStyle} value={editState.phone} onChange={e => setEditState(s => ({ ...s, phone: e.target.value }))} />
                      </div>
                    </div>
                    <PayFields values={editState} onChange={patch => setEditState(s => ({ ...s, ...patch }))} />
                    <div className="flex items-center gap-2 justify-end mt-3">
                      <button onClick={() => setEditingId(null)} className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>Cancel</button>
                      <button onClick={() => handleUpdate(a.id)} disabled={saving}
                        className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
                        style={{ background: "#f59e0b", color: "#fff" }}>Save</button>
                    </div>
                  </td>
                ) : (
                  <>
                    <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{a.name}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "#64748b" }}>{a.phone}</td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#94a3b8" }}>{Number(a.base_salary) || 0}</td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#94a3b8" }}>{Number(a.pay_per_booking) || 0}</td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#94a3b8" }}>{Number(a.pay_per_show) || 0}</td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#94a3b8" }}>{Number(a.pay_per_live_transfer) || 0}</td>
                    <td className="px-4 py-3" style={{ color: "#334155" }}>
                      {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => { setEditingId(a.id); setEditState(agentToEdit(a)); setError(""); }}
                          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                          style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#94a3b8"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#64748b"}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(a.id, a.name)}
                          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.18)"}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(239,68,68,0.08)"}>
                          Remove
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
