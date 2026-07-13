"use client";

import { useEffect, useState } from "react";
import {
  EMPLOYEE_POSITIONS,
  isCommissionPosition,
  isSalariedPosition,
  POSITION_LABELS,
  positionAccent,
  type EmployeePosition,
} from "@/lib/employee-positions";
import type { TeamRosterRow } from "@/lib/team-roster-api";
import EmployeePayHistory from "./EmployeePayHistory";

type PayRates = {
  base_salary: number;
  monthly_bonus: number;
  pay_per_booking: number;
  pay_per_show: number;
  pay_per_live_transfer: number;
  pay_per_qualified_demo: number;
  pay_per_close: number;
};

type Agent = TeamRosterRow;

type AvailableUser = { id: string; email: string };

type EditState = {
  phone: string;
  name: string;
  email: string;
  pay_type: EmployeePosition;
  user_id: string;
  active: boolean;
  ended_on: string;
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

const FILTER_OPTIONS = ["all", ...EMPLOYEE_POSITIONS] as const;
type FilterKey = (typeof FILTER_OPTIONS)[number];
type StatusFilter = "active" | "alumni" | "all";

export default function AgentAdmin() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availableUsers, setAvailableUsers] = useState<AvailableUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newAgent, setNewAgent] = useState<EditState>({
    phone: "",
    name: "",
    email: "",
    pay_type: "call_rep",
    user_id: "",
    active: true,
    ended_on: "",
    ...emptyPay,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({
    phone: "",
    name: "",
    email: "",
    pay_type: "call_rep",
    user_id: "",
    active: true,
    ended_on: "",
    ...emptyPay,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/agents")
      .then(r => r.json())
      .then(d => {
        setAgents(d.agents ?? []);
        setAvailableUsers(d.available_users ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  function agentToEdit(a: Agent): EditState {
    return {
      phone: a.phone,
      name: a.name,
      email: a.email ?? "",
      pay_type: (a.pay_type as EmployeePosition) ?? "call_rep",
      user_id: a.user_id ?? "",
      active: a.active !== false,
      ended_on: a.ended_on ?? "",
      base_salary: Number(a.base_salary) || 0,
      monthly_bonus: Number(a.monthly_bonus) || 0,
      pay_per_booking: Number(a.pay_per_booking) || 0,
      pay_per_show: Number(a.pay_per_show) || 0,
      pay_per_live_transfer: Number(a.pay_per_live_transfer) || 0,
      pay_per_qualified_demo: Number(a.pay_per_qualified_demo) || 0,
      pay_per_close: Number(a.pay_per_close) || 0,
    };
  }

  function payloadFromEdit(state: EditState) {
    return {
      ...state,
      user_id: state.user_id || null,
      email: state.email || null,
      active: state.active,
      ended_on: state.active ? null : (state.ended_on || new Date().toISOString().slice(0, 10)),
    };
  }

  async function handleAdd() {
    if (!newAgent.phone.trim() || !newAgent.name.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadFromEdit(newAgent)),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to add team member"); return; }
    setNewAgent({ phone: "", name: "", email: "", pay_type: "call_rep", user_id: "", active: true, ended_on: "", ...emptyPay });
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
      body: JSON.stringify(payloadFromEdit(editState)),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to update team member"); return; }
    setEditingId(null);
    load();
  }

  async function handleDeactivate(id: string, name: string) {
    if (!confirm(`Mark ${name} as alumni (no longer with the company)? Their pay history stays in the ledger.`)) return;
    const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Failed to mark as alumni"); return; }
    if (selectedId === id) setSelectedId(null);
    load();
  }

  async function handleReactivate(id: string) {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/agents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true, ended_on: null }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) { setError(data.error ?? "Failed to reactivate"); return; }
    load();
  }

  const filtered = agents.filter(a => {
    if (statusFilter === "active" && a.active === false) return false;
    if (statusFilter === "alumni" && a.active !== false) return false;
    if (filter !== "all" && a.pay_type !== filter) return false;
    return true;
  });
  const selected = agents.find(a => a.id === selectedId) ?? null;

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

  function userOptionsForEdit(currentUserId: string | null) {
    const opts = [...availableUsers];
    if (currentUserId) {
      const linked = agents.find(a => a.user_id === currentUserId);
      if (linked?.linked_user_email && !opts.some(u => u.id === currentUserId)) {
        opts.unshift({ id: currentUserId, email: linked.linked_user_email });
      }
    }
    return opts;
  }

  function PayFields({
    payType,
    values,
    onChange,
  }: {
    payType: EmployeePosition;
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

    let fields = [...common];
    if (payType === "b2b_setter") fields = [...fields, ...b2b];
    else if (payType === "call_rep") fields = [...fields, ...callRep];

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
        {isSalariedPosition(payType) && (
          <p className="col-span-full text-xs" style={{ color: "#64748b" }}>
            Salaried positions use base + monthly bonus only on Team Payroll.
          </p>
        )}
      </div>
    );
  }

  function UserLinkField({
    value,
    currentUserId,
    onChange,
  }: {
    value: string;
    currentUserId: string | null;
    onChange: (userId: string) => void;
  }) {
    return (
      <div>
        <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Dashboard login</label>
        <select style={inputStyle} value={value} onChange={e => onChange(e.target.value)}>
          <option value="">No login linked</option>
          {userOptionsForEdit(currentUserId).map(u => (
            <option key={u.id} value={u.id}>{u.email}</option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Team Roster</h2>
          <p className="text-sm mt-0.5 max-w-2xl" style={{ color: "#475569" }}>
            One record per team member — position, pay rates, and optional dashboard login. Former staff stay as Alumni so historical payroll still attributes correctly.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          >
            <option value="active">Active</option>
            <option value="alumni">Alumni</option>
            <option value="all">All people</option>
          </select>
          <select
            value={filter}
            onChange={e => setFilter(e.target.value as FilterKey)}
            className="rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
          >
            <option value="all">All positions</option>
            {EMPLOYEE_POSITIONS.map(p => (
              <option key={p} value={p}>{POSITION_LABELS[p]}</option>
            ))}
          </select>
          {!adding && (
            <button
              onClick={() => { setAdding(true); setError(""); }}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#f59e0b", color: "#fff" }}
            >
              Add team member
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
          <p className="text-sm font-semibold" style={{ color: "#f59e0b" }}>New team member</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Position</label>
              <select style={inputStyle} value={newAgent.pay_type}
                onChange={e => setNewAgent(s => ({ ...s, pay_type: e.target.value as EmployeePosition }))}>
                {EMPLOYEE_POSITIONS.map(p => (
                  <option key={p} value={p}>{POSITION_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Name</label>
              <input style={inputStyle} value={newAgent.name} onChange={e => setNewAgent(s => ({ ...s, name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Phone / ID</label>
              <input style={inputStyle} value={newAgent.phone} onChange={e => setNewAgent(s => ({ ...s, phone: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Work email</label>
              <input style={inputStyle} value={newAgent.email} onChange={e => setNewAgent(s => ({ ...s, email: e.target.value }))} placeholder="optional" />
            </div>
          </div>
          <UserLinkField value={newAgent.user_id} currentUserId={null} onChange={id => setNewAgent(s => ({ ...s, user_id: id }))} />
          <PayFields payType={newAgent.pay_type} values={newAgent} onChange={patch => setNewAgent(s => ({ ...s, ...patch }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => { setAdding(false); setNewAgent({ phone: "", name: "", email: "", pay_type: "call_rep", user_id: "", active: true, ended_on: "", ...emptyPay }); }}
              className="px-4 py-2 rounded-lg text-sm" style={{ background: "rgba(255,255,255,0.05)", color: "#64748b" }}>Cancel</button>
            <button onClick={handleAdd} disabled={saving || !newAgent.phone || !newAgent.name}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "#f59e0b", color: "#fff" }}>{saving ? "Saving…" : "Save"}</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "#050c18" }}>
                {["Position", "Name", "Status", "Login", "Base", ""].map(h => (
                  <th key={h || "actions"} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: "#64748b" }}>Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center" style={{ color: "#64748b" }}>No team members in this view</td></tr>
              ) : filtered.map((a, i) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="cursor-pointer"
                  style={{
                    borderTop: "1px solid rgba(255,255,255,0.03)",
                    background: selectedId === a.id ? "rgba(245,158,11,0.08)" : i % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent",
                    opacity: a.active === false ? 0.72 : 1,
                  }}
                >
                  <td className="px-4 py-3">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded"
                      style={{ background: `${positionAccent(a.pay_type as EmployeePosition)}22`, color: positionAccent(a.pay_type as EmployeePosition) }}>
                      {POSITION_LABELS[a.pay_type as EmployeePosition] ?? a.pay_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{a.name}</td>
                  <td className="px-4 py-3">
                    <span
                      className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded"
                      style={{
                        background: a.active === false ? "rgba(148,163,184,0.12)" : "rgba(34,197,94,0.12)",
                        color: a.active === false ? "#94a3b8" : "#86efac",
                      }}
                    >
                      {a.active === false ? "Alumni" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: a.linked_user_email ? "#94a3b8" : "#475569" }}>
                    {a.linked_user_email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "#94a3b8" }}>{Number(a.base_salary) || 0}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); setEditingId(a.id); setEditState(agentToEdit(a)); setError(""); }}
                      className="text-xs px-2 py-1 rounded"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8" }}
                    >Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-2 rounded-xl p-4 space-y-3 max-h-[calc(100vh-12rem)] overflow-y-auto" style={{ background: "#050c18", border: "1px solid rgba(255,255,255,0.06)" }}>
          {!selected ? (
            <p className="text-sm py-8 text-center" style={{ color: "#475569" }}>Select a team member to view their file</p>
          ) : (
            <>
              <div>
                <p className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>{selected.name}</p>
                <p className="text-xs mt-1" style={{ color: positionAccent(selected.pay_type as EmployeePosition) }}>
                  {POSITION_LABELS[selected.pay_type as EmployeePosition]}
                </p>
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2"><dt style={{ color: "#64748b" }}>Status</dt>
                  <dd style={{ color: selected.active === false ? "#94a3b8" : "#86efac" }}>
                    {selected.active === false ? `Alumni${selected.ended_on ? ` · ended ${selected.ended_on}` : ""}` : "Active"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2"><dt style={{ color: "#64748b" }}>Phone / ID</dt><dd style={{ color: "#e2e8f0" }}>{selected.phone}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: "#64748b" }}>Email</dt><dd style={{ color: "#e2e8f0" }}>{selected.email || "—"}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: "#64748b" }}>Login</dt><dd style={{ color: "#e2e8f0" }}>{selected.linked_user_email || "Not linked"}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: "#64748b" }}>Base</dt><dd className="tabular-nums" style={{ color: "#e2e8f0" }}>${Number(selected.base_salary) || 0}</dd></div>
                <div className="flex justify-between gap-2"><dt style={{ color: "#64748b" }}>Bonus</dt><dd className="tabular-nums" style={{ color: "#e2e8f0" }}>${Number(selected.monthly_bonus) || 0}</dd></div>
              </dl>
              {isCommissionPosition(selected.pay_type as EmployeePosition) && (
                <p className="text-xs pt-2" style={{ color: "#64748b", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  {selected.pay_type === "b2b_setter"
                    ? `Commission: $${selected.pay_per_qualified_demo}/demo · $${selected.pay_per_close}/close`
                    : `Commission: $${selected.pay_per_booking}/bk · $${selected.pay_per_show}/show · $${selected.pay_per_live_transfer}/xfer`}
                </p>
              )}
              {selected.user_id && (
                <p className="text-xs" style={{ color: "#64748b" }}>
                  Manage dashboard permissions under Admin → Users for {selected.linked_user_email}.
                </p>
              )}
              <div className="pt-3 mt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                <EmployeePayHistory agentId={selected.id} compact />
              </div>
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="button" onClick={() => { setEditingId(selected.id); setEditState(agentToEdit(selected)); }}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold"
                  style={{ background: "#f59e0b", color: "#fff" }}>Edit profile</button>
                {selected.active === false ? (
                  <button type="button" onClick={() => handleReactivate(selected.id)} disabled={saving}
                    className="text-xs px-3 py-1.5 rounded-lg font-semibold disabled:opacity-40"
                    style={{ background: "rgba(34,197,94,0.15)", color: "#86efac" }}>Reactivate</button>
                ) : (
                  <button type="button" onClick={() => handleDeactivate(selected.id, selected.name)}
                    className="text-xs px-3 py-1.5 rounded-lg"
                    style={{ background: "rgba(148,163,184,0.12)", color: "#94a3b8" }}>Mark alumni</button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {editingId && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: "#0a1628", border: "1px solid rgba(96,165,250,0.25)" }}>
          <p className="text-sm font-semibold" style={{ color: "#60a5fa" }}>Edit {editState.name}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Position</label>
              <select style={inputStyle} value={editState.pay_type}
                onChange={e => setEditState(s => ({ ...s, pay_type: e.target.value as EmployeePosition }))}>
                {EMPLOYEE_POSITIONS.map(p => (
                  <option key={p} value={p}>{POSITION_LABELS[p]}</option>
                ))}
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
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Work email</label>
              <input style={inputStyle} value={editState.email} onChange={e => setEditState(s => ({ ...s, email: e.target.value }))} />
            </div>
          </div>
          <UserLinkField
            value={editState.user_id}
            currentUserId={editState.user_id || null}
            onChange={id => setEditState(s => ({ ...s, user_id: id }))}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Employment</label>
              <select
                style={inputStyle}
                value={editState.active ? "active" : "alumni"}
                onChange={e => {
                  const active = e.target.value === "active";
                  setEditState(s => ({
                    ...s,
                    active,
                    ended_on: active ? "" : (s.ended_on || new Date().toISOString().slice(0, 10)),
                  }));
                }}
              >
                <option value="active">Active</option>
                <option value="alumni">Alumni</option>
              </select>
            </div>
            {!editState.active && (
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>Ended on</label>
                <input
                  type="date"
                  style={inputStyle}
                  value={editState.ended_on}
                  onChange={e => setEditState(s => ({ ...s, ended_on: e.target.value }))}
                />
              </div>
            )}
          </div>
          <PayFields payType={editState.pay_type} values={editState} onChange={patch => setEditState(s => ({ ...s, ...patch }))} />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "#64748b" }}>Cancel</button>
            <button onClick={() => handleUpdate(editingId)} disabled={saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
              style={{ background: "#f59e0b", color: "#fff" }}>{saving ? "Saving…" : "Save changes"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
