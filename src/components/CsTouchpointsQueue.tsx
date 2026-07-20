"use client";

import { useCallback, useEffect, useState } from "react";
import ClientFile from "@/components/ClientFile";
import {
  CS_TOUCHPOINT_LABELS,
  tenurePhaseLabel,
  type CsTouchpointType,
} from "@/lib/cs-touchpoints";

type DueFilter = "overdue" | "today" | "upcoming" | "open";

type TouchpointRow = {
  id: string;
  client_id: string;
  touchpoint_type: CsTouchpointType;
  status: string;
  due_at: string;
  trigger_source: string;
  playbook_stage: string | null;
  clients: {
    id: string;
    name: string;
    launch_date: string | null;
    date_signed: string | null;
    lifecycle_status: string | null;
  } | null;
};

type Props = {
  onOpenClient?: (clientId: string) => void;
};

function formatDue(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTenure(client: TouchpointRow["clients"]): string {
  if (!client) return "—";
  const { days, phase } = tenurePhaseLabel(client);
  if (days == null) return "No launch/signed";
  if (phase === "m1") return `Day ${days} · M1`;
  if (phase === "m2") return `Day ${days} · M2+`;
  if (phase === "prelaunch") return `Day ${days}`;
  return `Day ${days}`;
}

export default function CsTouchpointsQueue({ onOpenClient }: Props) {
  const [due, setDue] = useState<DueFilter>("today");
  const [rows, setRows] = useState<TouchpointRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [snippet, setSnippet] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [fileClientId, setFileClientId] = useState<string | null>(null);

  function openClient(clientId: string) {
    if (onOpenClient) onOpenClient(clientId);
    else setFileClientId(clientId);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ due, page: "1" });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/cs-touchpoints?${params}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [due, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  async function patch(
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/cs-touchpoints/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete() {
    if (!completeId) return;
    const ok = await patch(completeId, {
      action: "done",
      slack_sent: true,
      slack_snippet: snippet,
      completion_note: note || undefined,
    });
    if (ok) {
      setCompleteId(null);
      setSnippet("");
      setNote("");
    }
  }

  function snoozeDays(id: string, days: number) {
    const until = new Date();
    until.setUTCDate(until.getUTCDate() + days);
    void patch(id, { action: "snooze", snoozed_until: until.toISOString() });
  }

  const filters: { key: DueFilter; label: string }[] = [
    { key: "overdue", label: "Overdue" },
    { key: "today", label: "Due today" },
    { key: "upcoming", label: "Upcoming" },
    { key: "open", label: "All open" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div>
          <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
            Follow-ups
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            Clear the queue before EOD. Complete requires the Slack message you sent.
          </p>
          <p className="text-[11px] mt-1" style={{ color: "#475569" }}>
            Month 1 = event milestones · Month 2+ = scheduled every 14 days
          </p>
        </div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search client…"
          className="text-sm rounded-lg px-3 py-1.5"
          style={{
            background: "#050c18",
            border: "1px solid rgba(255,255,255,0.12)",
            color: "#e2e8f0",
            minWidth: 180,
          }}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            type="button"
            onClick={() => setDue(f.key)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg"
            style={{
              color: due === f.key ? "#38bdf8" : "#94a3b8",
              background:
                due === f.key ? "rgba(56,189,248,0.12)" : "rgba(255,255,255,0.04)",
              border:
                due === f.key
                  ? "1px solid rgba(56,189,248,0.35)"
                  : "1px solid rgba(255,255,255,0.08)",
            }}
          >
            {f.label}
          </button>
        ))}
        <span className="text-xs self-center ml-auto" style={{ color: "#64748b" }}>
          {total} item{total === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm" style={{ color: "#64748b" }}>
          Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-sm py-8 text-center" style={{ color: "#64748b" }}>
          Queue clear for this filter.
        </p>
      ) : (
        <div
          className="rounded-xl overflow-hidden"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "rgba(255,255,255,0.03)", color: "#64748b" }}>
                <th className="text-left font-medium px-3 py-2">Client</th>
                <th className="text-left font-medium px-3 py-2">Tenure</th>
                <th className="text-left font-medium px-3 py-2">Touchpoint</th>
                <th className="text-left font-medium px-3 py-2">Due</th>
                <th className="text-left font-medium px-3 py-2">Source</th>
                <th className="text-right font-medium px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr
                  key={row.id}
                  style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      className="font-medium hover:underline"
                      style={{ color: "#e2e8f0" }}
                      onClick={() => openClient(row.client_id)}
                    >
                      {row.clients?.name ?? "Client"}
                    </button>
                  </td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: "#94a3b8" }}>
                    {formatTenure(row.clients)}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: "#cbd5e1" }}>
                    {CS_TOUCHPOINT_LABELS[row.touchpoint_type] ?? row.touchpoint_type}
                    {row.status === "snoozed" && (
                      <span className="ml-2 text-xs" style={{ color: "#fbbf24" }}>
                        snoozed
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5" style={{ color: "#94a3b8" }}>
                    {formatDue(row.due_at)}
                  </td>
                  <td className="px-3 py-2.5 text-xs" style={{ color: "#64748b" }}>
                    {row.trigger_source}
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => {
                        setCompleteId(row.id);
                        setSnippet("");
                        setNote("");
                      }}
                      className="text-xs font-semibold px-2 py-1 rounded mr-1"
                      style={{
                        color: "#22c55e",
                        background: "rgba(34,197,94,0.12)",
                        border: "1px solid rgba(34,197,94,0.3)",
                      }}
                    >
                      Complete
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => snoozeDays(row.id, 1)}
                      className="text-xs font-semibold px-2 py-1 rounded mr-1"
                      style={{ color: "#fbbf24", background: "rgba(251,191,36,0.1)" }}
                    >
                      +1d
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() =>
                        void patch(row.id, { action: "skip", completion_note: "Skipped" })
                      }
                      className="text-xs font-semibold px-2 py-1 rounded"
                      style={{ color: "#94a3b8", background: "rgba(255,255,255,0.05)" }}
                    >
                      Skip
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {completeId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.65)" }}
          onClick={() => !saving && setCompleteId(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl p-5 space-y-3"
            style={{
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
              Mark complete
            </h3>
            <p className="text-xs" style={{ color: "#94a3b8" }}>
              Paste the Slack message you sent (required).
            </p>
            <textarea
              value={snippet}
              onChange={e => setSnippet(e.target.value)}
              rows={5}
              placeholder="Paste Slack message…"
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{
                background: "#050c18",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#e2e8f0",
              }}
            />
            <input
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Optional internal note"
              className="w-full text-sm rounded-lg px-3 py-2"
              style={{
                background: "#050c18",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "#e2e8f0",
              }}
            />
            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={saving}
                onClick={() => setCompleteId(null)}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ color: "#94a3b8" }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving || !snippet.trim()}
                onClick={() => void handleComplete()}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{
                  color: "#22c55e",
                  background: "rgba(34,197,94,0.15)",
                  border: "1px solid rgba(34,197,94,0.35)",
                  opacity: !snippet.trim() ? 0.5 : 1,
                }}
              >
                {saving ? "Saving…" : "Complete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {fileClientId && (
        <ClientFile
          clientId={fileClientId}
          fallbackName={
            rows.find(r => r.client_id === fileClientId)?.clients?.name ?? "Client"
          }
          onClose={() => setFileClientId(null)}
          initialTab="touchpoints"
        />
      )}
    </div>
  );
}
