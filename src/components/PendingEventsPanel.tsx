"use client";

import { useCallback, useEffect, useState } from "react";
import { dismissRosterPanel, isRosterPanelDismissed } from "@/lib/roster-panel-dismiss";

const PANEL_KEY = "pending-events";

type PendingGroup = {
  client_name: string;
  ghl_location_id: string | null;
  count: number;
  event_types: string[];
  first_received_at: string;
  last_received_at: string;
};

type RosterClient = {
  id: string;
  name: string;
  ghl_location_id: string | null;
};

function fieldStyle() {
  return { background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" } as const;
}

export default function PendingEventsPanel({ onReplayed }: { onReplayed?: () => void }) {
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState<PendingGroup[]>([]);
  const [clients, setClients] = useState<RosterClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignTo, setAssignTo] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const reload = useCallback(async () => {
    const res = await fetch("/api/pending-events");
    const d = await res.json().catch(() => ({}));
    if (res.ok) {
      const nextTotal = d.total ?? 0;
      setTotal(nextTotal);
      setGroups(d.groups ?? []);
      setClients(d.clients ?? []);
      setDismissed(isRosterPanelDismissed(PANEL_KEY, nextTotal));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function replayGroup(group: PendingGroup) {
    const clientId = assignTo[group.client_name];
    if (!clientId) {
      alert("Choose which client file to assign these events to.");
      return;
    }
    setBusy(group.client_name);
    const res = await fetch("/api/pending-events/replay", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_name: group.client_name }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(d.error ?? "Replay failed");
      setBusy(null);
      return;
    }
    await reload();
    onReplayed?.();
    setBusy(null);
    alert(
      `Replayed ${d.replayed ?? 0} event(s) to ${d.client?.name ?? "client"}` +
        ((d.skipped ?? 0) > 0 ? ` (${d.skipped} skipped as duplicates)` : "") +
        ((d.failed ?? 0) > 0 ? ` — ${d.failed} still waiting (e.g. flag update before lead)` : ""),
    );
  }

  if (loading) return null;
  if (total === 0 || dismissed) return null;

  function closePanel() {
    dismissRosterPanel(PANEL_KEY, total);
    setDismissed(true);
  }

  return (
    <div
      className="rounded-xl p-4 space-y-3"
      style={{ background: "#1a1208", border: "1px solid rgba(245,158,11,0.35)" }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
            Unmapped events ({total})
          </h3>
          <p className="text-xs mt-1" style={{ color: "#a8a29e" }}>
            These webhooks arrived before a matching sub-account name existed. Assign them to the correct client file — or set the GHL sub-account name on kick-off and they replay automatically.
          </p>
        </div>
        <button
          type="button"
          onClick={closePanel}
          className="shrink-0 w-7 h-7 rounded-lg text-sm leading-none"
          style={{ color: "#94a3b8", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
          title="Hide until new unmapped events arrive"
          aria-label="Hide unmapped events panel"
        >
          ✕
        </button>
      </div>
      <div className="space-y-2">
        {groups.map(g => (
          <div
            key={`${g.client_name}-${g.ghl_location_id ?? ""}`}
            className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2"
            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="min-w-[12rem] flex-1">
              <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>{g.client_name}</p>
              <p className="text-xs" style={{ color: "#64748b" }}>
                {g.count} event{g.count === 1 ? "" : "s"} · {g.event_types.join(", ")}
                {g.ghl_location_id ? ` · loc ${g.ghl_location_id.slice(0, 8)}…` : ""}
              </p>
            </div>
            <select
              value={assignTo[g.client_name] ?? ""}
              onChange={e => setAssignTo(prev => ({ ...prev, [g.client_name]: e.target.value }))}
              className="px-2 py-1.5 rounded-lg text-xs outline-none min-w-[10rem]"
              style={fieldStyle()}
            >
              <option value="">Assign to client…</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => replayGroup(g)}
              disabled={busy === g.client_name || !assignTo[g.client_name]}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg"
              style={{
                color: "#22c55e",
                background: "rgba(34,197,94,0.12)",
                border: "1px solid rgba(34,197,94,0.25)",
                opacity: busy === g.client_name ? 0.5 : 1,
              }}
            >
              {busy === g.client_name ? "Replaying…" : "Replay"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
