"use client";

import { useEffect, useMemo, useState } from "react";
import { calendarMonthOf } from "@/lib/calendar-month";

type Client = { id: string; name: string };

type Goal = {
  id: string;
  client_id: string;
  agent_name: string | null;
  metric: string;
  target: number;
  period: string;
  month: string | null;
};

type DraftRow = {
  agent_name: string;
  conversations: string;
  dials: string;
};

type Props = {
  clients: Client[];
  startDate: string;
  endDate: string;
  mode?: "agents";
};

export default function GoalTracker({ clients, startDate, endDate, mode = "agents" }: Props) {
  const rosterClientId = clients[0]?.id ?? "";
  const defaultMonth = calendarMonthOf(endDate || startDate).month;
  const [month, setMonth] = useState(defaultMonth);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setMonth(calendarMonthOf(endDate || startDate).month);
  }, [startDate, endDate]);

  useEffect(() => {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    params.set("includeAllRoster", "1");

    Promise.all([
      fetch(`/api/agent-stats?${params}`).then(r => r.json()),
      fetch(`/api/goals?month=${encodeURIComponent(month)}`).then(r => r.json()),
    ])
      .then(([statsData, goalsData]) => {
        if (statsData.error) throw new Error(statsData.error);
        if (goalsData.error) throw new Error(goalsData.error);
        const goals: Goal[] = goalsData.goals ?? [];
        const names: string[] = (statsData.agents ?? [])
          .map((a: { agent_name: string }) => a.agent_name)
          .filter(Boolean)
          .sort((a: string, b: string) => a.localeCompare(b));

        setRows(
          names.map(agent_name => {
            const conv = goals.find(
              g =>
                g.agent_name === agent_name &&
                g.metric === "conversations" &&
                g.period === "monthly" &&
                g.month === month,
            );
            const dials = goals.find(
              g => g.agent_name === agent_name && g.metric === "dials" && g.period === "daily",
            );
            return {
              agent_name,
              conversations: conv ? String(conv.target) : "",
              dials: dials ? String(dials.target) : "",
            };
          }),
        );
        setLoading(false);
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load goals");
        setLoading(false);
      });
  }, [startDate, endDate, month]);

  const monthOptions = useMemo(() => {
    const options: string[] = [];
    const base = calendarMonthOf(endDate || startDate);
    const [y, m] = base.month.split("-").map(Number);
    for (let i = -2; i <= 3; i++) {
      const d = new Date(y, m - 1 + i, 1);
      options.push(
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      );
    }
    return options;
  }, [startDate, endDate]);

  function updateRow(agent_name: string, field: "conversations" | "dials", value: string) {
    setRows(prev =>
      prev.map(r => (r.agent_name === agent_name ? { ...r, [field]: value } : r)),
    );
    setSavedAt(null);
  }

  async function handleSaveAll() {
    if (!rosterClientId) {
      setError("No client available to attach goals to");
      return;
    }
    setSaving(true);
    setError("");

    const payload: Array<{
      client_id: string;
      agent_name: string;
      metric: string;
      target: number;
      period: string;
      month: string | null;
    }> = [];

    for (const row of rows) {
      const conv = Number(row.conversations);
      if (row.conversations.trim() && Number.isFinite(conv) && conv > 0) {
        payload.push({
          client_id: rosterClientId,
          agent_name: row.agent_name,
          metric: "conversations",
          target: conv,
          period: "monthly",
          month,
        });
      }
      const dials = Number(row.dials);
      if (row.dials.trim() && Number.isFinite(dials) && dials > 0) {
        payload.push({
          client_id: rosterClientId,
          agent_name: row.agent_name,
          metric: "dials",
          target: dials,
          period: "daily",
          month: null,
        });
      }
    }

    if (payload.length === 0) {
      setSaving(false);
      setError("Enter at least one positive target before saving");
      return;
    }

    const res = await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ goals: payload }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "Failed to save");
      return;
    }
    setSavedAt(new Date().toLocaleTimeString());
  }

  const selectStyle = {
    background: "#0a1628",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#e2e8f0",
    borderRadius: "0.5rem",
    padding: "0.5rem 0.75rem",
    fontSize: "0.875rem",
    outline: "none",
  } as React.CSSProperties;

  const inputStyle = {
    ...selectStyle,
    width: "100%",
    fontVariantNumeric: "tabular-nums" as const,
  };

  if (mode !== "agents") return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>
            Agent Goals
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
            Set monthly Conversations (show / LT) and daily dials — Save all at once
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            style={{ ...selectStyle, minWidth: "9rem" }}
            value={month}
            onChange={e => setMonth(e.target.value)}
          >
            {monthOptions.map(m => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleSaveAll}
            disabled={saving || loading || !rosterClientId}
            className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
            style={{ background: "#f59e0b", color: "#0a1628" }}
          >
            {saving ? "Saving…" : "Save all"}
          </button>
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

      {savedAt && !error && (
        <div className="text-xs" style={{ color: "#34d399" }}>
          Saved at {savedAt}
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: "#1e3a5f" }}>
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div
          className="rounded-xl py-12 text-center text-sm"
          style={{
            background: "#0a1628",
            border: "1px solid rgba(255,255,255,0.05)",
            color: "#1e3a5f",
          }}
        >
          No active agents on the roster
        </div>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div
            className="grid gap-0 px-4 py-3 text-[10px] font-semibold tracking-wider uppercase"
            style={{
              gridTemplateColumns: "1.4fr 1fr 1fr",
              background: "rgba(255,255,255,0.04)",
              color: "#64748b",
            }}
          >
            <div>Agent</div>
            <div>Monthly conversations</div>
            <div>Daily dials</div>
          </div>
          {rows.map((row, i) => (
            <div
              key={row.agent_name}
              className="grid gap-3 px-4 py-3 items-center"
              style={{
                gridTemplateColumns: "1.4fr 1fr 1fr",
                borderTop: "1px solid rgba(255,255,255,0.05)",
                background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.015)",
              }}
            >
              <div className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
                {row.agent_name}
              </div>
              <input
                style={inputStyle}
                type="number"
                min={1}
                placeholder="e.g. 22"
                value={row.conversations}
                onChange={e => updateRow(row.agent_name, "conversations", e.target.value)}
              />
              <input
                style={inputStyle}
                type="number"
                min={1}
                placeholder="e.g. 150"
                value={row.dials}
                onChange={e => updateRow(row.agent_name, "dials", e.target.value)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
