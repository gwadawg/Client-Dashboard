"use client";

import { useEffect, useState } from "react";

type PayType = "call_rep" | "b2b_setter";

type PayRates = {
  base_salary: number;
  monthly_bonus: number;
  pay_per_booking: number;
  pay_per_show: number;
  pay_per_live_transfer: number;
  pay_per_qualified_demo: number;
  pay_per_close: number;
};

type Agent = {
  id: string;
  phone: string;
  name: string;
  pay_type: PayType;
  created_at: string;
} & PayRates;

type EditState = {
  phone: string;
  name: string;
  pay_type: PayType;
} & PayRates;

const emptyPay: PayRates = {
  base_salary: 0,
  monthly_bonus: 0,
  pay_per_booking: 0,
  pay_per_show: 0,
  pay_per_live_transfer: 0,
  pay_per_qualified_demo: 0,
  pay_per_close: 0,
};

const PAY_TYPE_LABELS: Record<PayType, string> = {
  call_rep: "Call Rep",
  b2b_setter: "B2B Setter",
};

export default function AgentAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"all" | PayType>("all");
  const [newAgent, setNewAgent] = useState<EditState>({ phone: "", name: "", pay_type: "call_rep", ...emptyPay });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ phone: "", name: "", pay_type: "call_rep", ...emptyPay });
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
      pay_type: a.pay_type ?? "call_rep",
      base_salary: Number(a.base_salary) || 0,
      monthly_bonus: Number(a.monthly_bonus) || 0,
      pay_per_booking: Number(a.pay_per_booking) || 0,
      pay_per_show: Number(a.pay_per_show) || 0,
      pay_per_live_transfer: Number(a.pay_per_live_transfer) || 0,
      pay_per_qualified_demo: Number(a.pay_per_qualified_demo) || 0,
      pay_per_close: Number(a.pay_per_close) || 0,
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
    setNewAgent({ phone: "", name: "", pay_type: "call_rep", ...emptyPay });
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

  const filtered = filter === "all" ? agents : agents.filter(a => (a.pay_type ?? "call_rep") === filter);

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
    payType,
    values,
    onChange,
  }: {
    payType: PayType;
    values: PayRates;
    onChange: (patch: Partial<PayRates>) => void;
  }) {
    const common: [keyof PayRates, string][] = [
      ["base_salary", "Base salary (mo)"],
      ["monthly_bonus", "Monthly bonus"],
    ];
    const callRep: [keyof PayRates, string][] = [
      ["pay_per_booking", "$/booking"],
      ["pay_per_show", "$/show"],
      ["pay_per_live_transfer", "$/live transfer"],
    ];
    const b2b: [keyof PayRates, string][] = [
      ["pay_per_qualified_demo", "$/qualified demo"],
      ["pay_per_close", "$/close"],
    ];
    const fields = [...common, ...(payType === "b2b_setter" ? b2b : callRep)];

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3 pt-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        {fields.map(([key, label]) => (
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
    <div className="space-y-6 max-w-5xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Employee Roster</h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Unified roster for call reps and B2B setters — pay rates feed the Agent Payroll dashboard
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "call_rep", "b2b_setter"] as const).map(f => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{
                background: filter === f ? "rgba(245,158,11,0.2)" : "rgba(255,255,255,0.05)",
                color: filter === f ? "#fbbf24" : "#64748b",
              }}
            >
              {f === "all" ? "All" : PAY_TYPE_LABELS[f]}
            </button>
          ))}
          {!adding && (
            <button
              onClick={() => { setAdding(true); setError(""); }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#f59e0b", color: "#fff" }}
            >
              Add Employee
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg text-sm" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {adding && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "#0a1628", border: "1px solid rgba(245,158,11,0.25)" }}>
          <p className="text-sm font-semibold" style={{ color: "#f59e0b" }}>New Employee</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Pay Type</label>
              <select
                style={inputStyle}
                value={newAgent.pay_type}
                onChange={e => setNewAgent(s => ({ ...s, pay_type: e.target.value as PayType }))}
              >
                <option value="call_rep">Call Rep</option>
                <option value="b2b_setter">B2B Setter</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Phone / ID</label>
              <input
                style={inputStyle}
                placeholder="ex: 1 or b2b-john"
                value={newAgent.phone}
                onChange={e => setNewAgent(s => ({ ...s, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Name</label>
              <input
                style={inputStyle}
                placeholder="Jane Smith"
                value={newAgent.name}
                onChange={e => setNewAgent(s => ({ ...s, name: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") handleAdd(); }}
              />
            </div>
          </div>
          <PayFields payType={newAgent.pay_type} values={newAgent} onChange={patch => setNewAgent(s => ({ ...s, ...patch }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setError(""); setNewAgent({ phone: "", name: "", pay_type: "call_rep", ...emptyPay }); }}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
              Cancel
            </button>
            <button onClick={handleAdd} disabled={saving || !newAgent.phone || !newAgent.name}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "#f59e0b", color: "#fff" }}>
              {saving ? "Saving…" : "Save Employee"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#050c18" }}>
              {["Type", "Name", "Phone", "Base", "Bonus", "Rates", "Added", ""].map(h => (
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
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
                No employees yet — add your first employee above
              </td></tr>
            ) : filtered.map((a, i) => (
              <tr key={a.id} style={{ borderTop: "1px solid rgba(255,255,255,0.03)", background: i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent" }}>
                {editingId === a.id ? (
                  <td colSpan={8} className="px-4 py-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Pay Type</label>
                        <select style={inputStyle} value={editState.pay_type}
                          onChange={e => setEditState(s => ({ ...s, pay_type: e.target.value as PayType }))}>
                          <option value="call_rep">Call Rep</option>
                          <option value="b2b_setter">B2B Setter</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Name</label>
                        <input style={inputStyle} value={editState.name} onChange={e => setEditState(s => ({ ...s, name: e.target.value }))} />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Phone / ID</label>
                        <input style={inputStyle} value={editState.phone} onChange={e => setEditState(s => ({ ...s, phone: e.target.value }))} />
                      </div>
                    </div>
                    <PayFields payType={editState.pay_type} values={editState} onChange={patch => setEditState(s => ({ ...s, ...patch }))} />
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
                    <td className="px-4 py-3">
                      <span className="text-xs font-semibold px-2 py-0.5 rounded"
                        style={{
                          background: (a.pay_type ?? "call_rep") === "b2b_setter" ? "rgba(245,158,11,0.15)" : "rgba(96,165,250,0.15)",
                          color: (a.pay_type ?? "call_rep") === "b2b_setter" ? "#fbbf24" : "#60a5fa",
                        }}>
                        {PAY_TYPE_LABELS[a.pay_type ?? "call_rep"]}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{a.name}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: "#64748b" }}>{a.phone}</td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#94a3b8" }}>{Number(a.base_salary) || 0}</td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#94a3b8" }}>{Number(a.monthly_bonus) || 0}</td>
                    <td className="px-4 py-3 text-xs" style={{ color: "#64748b" }}>
                      {(a.pay_type ?? "call_rep") === "b2b_setter"
                        ? `$${a.pay_per_qualified_demo}/demo · $${a.pay_per_close}/close`
                        : `$${a.pay_per_booking}/bk · $${a.pay_per_show}/show · $${a.pay_per_live_transfer}/xfer`}
                    </td>
                    <td className="px-4 py-3" style={{ color: "#334155" }}>
                      {new Date(a.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button onClick={() => { setEditingId(a.id); setEditState(agentToEdit(a)); setError(""); }}
                          className="text-xs px-3 py-1.5 rounded-lg"
                          style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(a.id, a.name)}
                          className="text-xs px-3 py-1.5 rounded-lg"
                          style={{ background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>
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
