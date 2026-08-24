"use client";

import { useCallback, useEffect, useState } from "react";
import type { WorkInboxItem, WorkInboxPayload } from "@/lib/work-inbox";
import { todayYmdInCallCenterTz } from "@/lib/time";

type Assignee = { id: string; name: string };

type Props = {
  onNavigate?: (view: string, tab?: string) => void;
};

function hrefToNav(href: string): { view: string; tab?: string } {
  try {
    const u = new URL(href, "https://local.invalid");
    const view = u.searchParams.get("view") || "account_work";
    const tab = u.searchParams.get("tab") || undefined;
    return { view, tab };
  } catch {
    return { view: "account_work" };
  }
}

export default function DueTodayPlate({ onNavigate }: Props) {
  const day = todayYmdInCallCenterTz();
  const [payload, setPayload] = useState<WorkInboxPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const [scopeUserId, setScopeUserId] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [snippetById, setSnippetById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ day });
      if (scopeUserId) {
        qs.set("scope", "user");
        qs.set("user_id", scopeUserId);
      }
      const res = await fetch(`/api/work-inbox?${qs.toString()}`);
      const json = (await res.json()) as WorkInboxPayload & { error?: string };
      if (!res.ok) {
        setError(json.error || "Failed to load Due today");
        return;
      }
      setPayload(json);
      setError(null);
      if (!scopeUserId) setSelfId(json.user_id);
      if (json.can_scope_user) {
        const aRes = await fetch("/api/account-week-plans/assignees");
        if (aRes.ok) {
          const aJson = (await aRes.json()) as { assignees?: Assignee[] };
          setAssignees(aJson.assignees ?? []);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load Due today");
    }
  }, [day, scopeUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  function go(href: string) {
    const { view, tab } = hrefToNav(href);
    onNavigate?.(view, tab);
  }

  async function completeCadence(item: WorkInboxItem) {
    setBusyId(item.source_id);
    try {
      const res = await fetch(`/api/account-plan-tasks/${item.source_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "done",
          work_type: item.label === "Finding" ? "finding" : "cadence",
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not complete task");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function completeFollowup(item: WorkInboxItem) {
    const snippet = (snippetById[item.source_id] ?? "").trim();
    if (!snippet) {
      setError("Paste the Slack snippet to complete this follow-up.");
      return;
    }
    setBusyId(item.source_id);
    try {
      const res = await fetch(`/api/cs-touchpoints/${item.source_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "done",
          slack_sent: true,
          slack_snippet: snippet,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Could not complete follow-up");
        return;
      }
      setSnippetById(prev => {
        const next = { ...prev };
        delete next[item.source_id];
        return next;
      });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (error && !payload) {
    return (
      <section
        className="rounded-xl border px-5 py-4 text-sm"
        style={{
          borderColor: "rgba(248,113,113,0.35)",
          color: "#fca5a5",
          background: "rgba(127,29,29,0.2)",
        }}
      >
        {error}
      </section>
    );
  }

  if (!payload) {
    return (
      <section
        className="rounded-xl border p-5 h-24 animate-pulse"
        style={{
          borderColor: "rgba(148,163,184,0.15)",
          background: "rgba(148,163,184,0.08)",
        }}
      />
    );
  }

  return (
    <section
      className="rounded-xl border p-5"
      style={{
        borderColor: "rgba(148,163,184,0.15)",
        background: "rgba(10,22,40,0.9)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            Due today
          </h2>
          <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
            Assigned plan work for {payload.day}
            {payload.items.some(i => i.kind === "cs_followup")
              ? " · unowned follow-ups"
              : ""}
            {payload.items.some(i => i.kind === "plan_approve")
              ? " · plans to approve"
              : ""}
          </p>
        </div>
        {payload.can_scope_user && (assignees.length > 0 || selfId) && (
          <label className="text-xs flex items-center gap-2" style={{ color: "#94a3b8" }}>
            Person
            <select
              value={scopeUserId ?? selfId ?? payload.user_id}
              onChange={e => {
                const v = e.target.value;
                setScopeUserId(selfId && v === selfId ? null : v);
              }}
              className="rounded border bg-transparent px-2 py-1 text-xs"
              style={{ borderColor: "rgba(148,163,184,0.3)", color: "#e2e8f0" }}
            >
              {selfId && !assignees.some(a => a.id === selfId) && (
                <option value={selfId}>Me</option>
              )}
              {assignees.map(a => (
                <option key={a.id} value={a.id}>
                  {a.id === selfId ? `${a.name} (me)` : a.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {error && (
        <p className="text-xs mb-3" style={{ color: "#f87171" }}>
          {error}
        </p>
      )}

      {payload.warnings.length > 0 && (
        <p className="text-xs mb-3" style={{ color: "#fbbf24" }}>
          {payload.warnings.map(w => w.message).join(" · ")}
        </p>
      )}

      {payload.items.length === 0 ? (
        <p className="text-sm py-4 text-center" style={{ color: "#475569" }}>
          Nothing due on this plate.
        </p>
      ) : (
        <ul className="divide-y" style={{ borderColor: "rgba(51,65,85,0.5)" }}>
          {payload.items.map(item => (
            <li
              key={`${item.kind}-${item.source_id}`}
              className="py-3 first:pt-0 last:pb-0 space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium" style={{ color: "#f1f5f9" }}>
                    {item.client_name ? `${item.client_name} · ` : ""}
                    {item.title}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
                    {item.label}
                    {item.blocked_reason && item.complete_mode === "deep_link"
                      ? ` · ${item.blocked_reason}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.complete_mode === "inline" && item.kind === "plan_task" && (
                    <button
                      type="button"
                      disabled={busyId === item.source_id}
                      onClick={() => void completeCadence(item)}
                      className="text-xs font-semibold px-2.5 py-1 rounded"
                      style={{
                        color: "#34d399",
                        background: "rgba(52,211,153,0.12)",
                      }}
                    >
                      {busyId === item.source_id ? "Saving…" : "Done"}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => go(item.href)}
                    className="text-xs font-semibold hover:underline"
                    style={{ color: "#60a5fa" }}
                  >
                    Open
                  </button>
                </div>
              </div>
              {item.kind === "cs_followup" && item.complete_mode === "inline" && (
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <textarea
                    value={snippetById[item.source_id] ?? ""}
                    onChange={e =>
                      setSnippetById(prev => ({
                        ...prev,
                        [item.source_id]: e.target.value,
                      }))
                    }
                    rows={2}
                    placeholder="Slack snippet (required)"
                    className="flex-1 rounded border px-2 py-1 text-xs"
                    style={{
                      borderColor: "rgba(148,163,184,0.3)",
                      background: "rgba(15,23,42,0.8)",
                      color: "#e2e8f0",
                    }}
                  />
                  <button
                    type="button"
                    disabled={busyId === item.source_id}
                    onClick={() => void completeFollowup(item)}
                    className="text-xs font-semibold px-2.5 py-1 rounded shrink-0"
                    style={{
                      color: "#34d399",
                      background: "rgba(52,211,153,0.12)",
                    }}
                  >
                    {busyId === item.source_id ? "Saving…" : "Complete"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
