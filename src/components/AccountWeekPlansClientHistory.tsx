"use client";

import { useEffect, useState } from "react";
import type { AccountWeekPlan } from "@/lib/account-week-plans";

type Props = {
  clientId: string;
  compact?: boolean;
};

export default function AccountWeekPlansClientHistory({
  clientId,
  compact = false,
}: Props) {
  const [plans, setPlans] = useState<AccountWeekPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(
      `/api/account-week-plans?client_id=${encodeURIComponent(clientId)}&include_tasks=1`,
    )
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error ?? "Failed");
        if (!cancelled) {
          setPlans(d.plans ?? []);
          setLoading(false);
        }
      })
      .catch(e => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return <p className="text-xs text-slate-500">Loading week plans…</p>;
  }
  if (error) {
    return <p className="text-xs text-rose-400">{error}</p>;
  }
  if (!plans.length) {
    return (
      <p className="text-xs text-slate-500">
        No account week plans yet for this client.
      </p>
    );
  }

  const list = compact ? plans.slice(0, 5) : plans;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        Account work history
      </h4>
      {list.map(p => {
        const open = expanded === p.id;
        const tasks = p.tasks ?? [];
        const done = tasks.filter(t => t.status === "done").length;
        return (
          <div
            key={p.id}
            className="rounded-lg"
            style={{ border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <button
              type="button"
              className="w-full text-left px-3 py-2 flex flex-wrap items-center gap-2"
              onClick={() => setExpanded(open ? null : p.id)}
            >
              <span className="text-xs font-medium text-slate-200">
                Week {p.week_start}
              </span>
              <span className="text-[10px] uppercase text-slate-500">{p.status}</span>
              <span className="text-[10px] text-slate-500">
                {done}/{tasks.length} done
              </span>
              <span className="text-[10px] text-slate-500 ml-auto">
                {open ? "▾" : "▸"}
              </span>
            </button>
            {open && (
              <div className="px-3 pb-3 space-y-1">
                <p className="text-xs text-slate-400 whitespace-pre-wrap">{p.why}</p>
                {p.founder_note && (
                  <p className="text-[11px] text-slate-500">Note: {p.founder_note}</p>
                )}
                <ul className="space-y-1 mt-2">
                  {tasks.map(t => (
                    <li key={t.id} className="text-[11px] text-slate-400">
                      <span className="text-slate-300">{t.title}</span>
                      {" — "}
                      {t.status}
                      {t.scheduled_for ? ` · ${t.scheduled_for}` : ""}
                      {t.completion_report ? (
                        <span className="block text-slate-500 mt-0.5 pl-2">
                          {t.completion_report}
                        </span>
                      ) : null}
                      {t.client_action_log_id ? (
                        <span className="block text-sky-500/80 pl-2">
                          Logged as account change
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}
      {compact && plans.length > 5 && (
        <p className="text-[10px] text-slate-500">
          Showing 5 of {plans.length} — open full client file for more.
        </p>
      )}
    </div>
  );
}
