"use client";

import { useCallback, useEffect, useState } from "react";
import type { AccountWeekPlan } from "@/lib/account-week-plans";

type Props = {
  onChanged?: () => void;
};

export default function AccountWeekPlanApprovalQueue({ onChanged }: Props) {
  const [plans, setPlans] = useState<AccountWeekPlan[]>([]);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        "/api/account-week-plans?view=pending_approval&include_tasks=1",
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to load");
      setPlans(d.plans ?? []);
      setCanApprove(Boolean(d.can_approve));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: "approved" | "rejected") {
    setBusyId(id);
    setError(null);
    try {
      const body: Record<string, string> = { status };
      if (status === "rejected") {
        const note = (rejectNote[id] ?? "").trim();
        if (!note) throw new Error("Reject note is required");
        body.founder_note = note;
      }
      const res = await fetch(`/api/account-week-plans/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await load();
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return <p className="text-xs text-slate-500">Loading pending plans…</p>;
  }

  return (
    <div className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Founder approval
        </h4>
        <p className="text-xs text-slate-500 mt-1">
          Every plan waits here before work is active.
          {!canApprove && " (You can view; only founder/ceo can approve.)"}
        </p>
      </div>
      {error && <p className="text-xs text-rose-400">{error}</p>}
      {plans.length === 0 && (
        <p className="text-xs text-slate-500">Nothing pending — good.</p>
      )}
      {plans.map(p => (
        <div
          key={p.id}
          className="rounded-lg p-3 space-y-2"
          style={{ border: "1px solid rgba(255,255,255,0.08)", background: "rgba(15,32,64,0.5)" }}
        >
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm font-medium text-slate-100">
              {p.client_name ?? p.client_id.slice(0, 8)}
            </span>
            {p.severity && (
              <span className="text-[10px] uppercase tracking-wide text-amber-400">
                {p.severity}
              </span>
            )}
            <span className="text-[10px] text-slate-500">week {p.week_start}</span>
          </div>
          <p className="text-xs text-slate-300 whitespace-pre-wrap">{p.why}</p>
          <ul className="space-y-1">
            {(p.tasks ?? []).map(t => (
              <li key={t.id} className="text-xs text-slate-400">
                • {t.title}
                {t.scheduled_for ? ` · ${t.scheduled_for}` : ""}
                {t.tactic_tag ? ` · #${t.tactic_tag}` : ""}
              </li>
            ))}
          </ul>
          {canApprove && (
            <div className="flex flex-wrap items-end gap-2 pt-1">
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => setStatus(p.id, "approved")}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                style={{ background: "#059669" }}
              >
                Approve
              </button>
              <div className="flex-1 min-w-[12rem]">
                <input
                  placeholder="Reject reason"
                  value={rejectNote[p.id] ?? ""}
                  onChange={e =>
                    setRejectNote(prev => ({ ...prev, [p.id]: e.target.value }))
                  }
                  className="w-full rounded-md px-2 py-1.5 text-xs text-slate-200"
                  style={{
                    background: "#0f2040",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }}
                />
              </div>
              <button
                type="button"
                disabled={busyId === p.id}
                onClick={() => setStatus(p.id, "rejected")}
                className="rounded-md px-3 py-1.5 text-xs font-medium text-rose-200 disabled:opacity-50"
                style={{ border: "1px solid rgba(244,63,94,0.4)" }}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
