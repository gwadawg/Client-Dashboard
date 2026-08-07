"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CalendarTaskItem } from "@/lib/account-week-plans";
import { weekStartMondayContaining } from "@/lib/account-week-plans";
import { addDaysToYmd } from "@/lib/team-meetings";
import { todayYmdInCallCenterTz } from "@/lib/time";

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

function monthLabel(year: number, monthIndex0: number): string {
  return new Date(Date.UTC(year, monthIndex0, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** Calendar grid start (Monday) and end (Sunday) covering the month. */
function monthGridBounds(year: number, monthIndex0: number): {
  gridStart: string;
  gridEnd: string;
  monthStart: string;
  monthEnd: string;
} {
  const monthStart = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
  const monthEnd = `${year}-${String(monthIndex0 + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  const gridStart = weekStartMondayContaining(monthStart);
  // Week containing last day of month, then Sunday
  const lastWeekMon = weekStartMondayContaining(monthEnd);
  const gridEnd = addDaysToYmd(lastWeekMon, 6);
  return { gridStart, gridEnd, monthStart, monthEnd };
}

function parseYmdParts(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split("-").map(Number);
  return { y, m, d };
}

export default function AccountWeekPlansCalendar() {
  const today = todayYmdInCallCenterTz();
  const todayParts = parseYmdParts(today);
  const [year, setYear] = useState(todayParts.y);
  const [month0, setMonth0] = useState(todayParts.m - 1);
  const [tasks, setTasks] = useState<CalendarTaskItem[]>([]);
  const [overdue, setOverdue] = useState<CalendarTaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const bounds = useMemo(() => monthGridBounds(year, month0), [year, month0]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/account-week-plans?view=calendar&from=${encodeURIComponent(bounds.gridStart)}&to=${encodeURIComponent(bounds.gridEnd)}`,
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed to load calendar");
      setTasks(d.tasks ?? []);
      setOverdue(d.overdue ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [bounds.gridStart, bounds.gridEnd]);

  useEffect(() => {
    load();
  }, [load]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarTaskItem[]>();
    for (const t of tasks) {
      const day = t.scheduled_for?.slice(0, 10);
      if (!day) continue;
      const list = map.get(day) ?? [];
      list.push(t);
      map.set(day, list);
    }
    return map;
  }, [tasks]);

  const days = useMemo(() => {
    const out: string[] = [];
    let cur = bounds.gridStart;
    while (cur <= bounds.gridEnd) {
      out.push(cur);
      cur = addDaysToYmd(cur, 1);
    }
    return out;
  }, [bounds.gridStart, bounds.gridEnd]);

  function shiftMonth(delta: number) {
    let m = month0 + delta;
    let y = year;
    while (m < 0) {
      m += 12;
      y -= 1;
    }
    while (m > 11) {
      m -= 12;
      y += 1;
    }
    setMonth0(m);
    setYear(y);
  }

  async function markDone(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/account-plan-tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "done" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  function TaskChip({ t, compact }: { t: CalendarTaskItem; compact?: boolean }) {
    const isDone = t.status === "done";
    const isCancelled = t.status === "cancelled";
    const isOverdue = t.overdue;
    const isPending = t.plan_status === "pending";

    let bg = "rgba(30,58,95,0.85)";
    let border = "rgba(148,163,184,0.25)";
    let color = "#e2e8f0";
    if (isOverdue) {
      bg = "rgba(127,29,29,0.55)";
      border = "rgba(248,113,113,0.65)";
      color = "#fecaca";
    } else if (isDone) {
      bg = "rgba(6,78,59,0.45)";
      border = "rgba(52,211,153,0.35)";
      color = "#a7f3d0";
    } else if (isCancelled) {
      bg = "rgba(15,23,42,0.6)";
      border = "rgba(100,116,139,0.3)";
      color = "#64748b";
    } else if (isPending) {
      bg = "rgba(113,63,18,0.4)";
      border = "rgba(251,191,36,0.4)";
      color = "#fde68a";
    }

    return (
      <div
        className={`rounded px-1.5 py-1 ${compact ? "text-[10px]" : "text-xs"}`}
        style={{ background: bg, border: `1px solid ${border}`, color }}
        title={[t.client_name, t.title, t.why].filter(Boolean).join(" · ")}
      >
        <div className="font-medium truncate leading-tight">
          {isOverdue ? "⚠ " : ""}
          {t.client_name ?? "Client"}
        </div>
        <div className={`truncate ${isCancelled ? "line-through" : ""} opacity-90`}>
          {t.title}
        </div>
        {!compact && isOverdue && t.status === "open" && t.plan_status === "approved" && (
          <button
            type="button"
            disabled={busyId === t.id}
            className="mt-1 text-[10px] underline opacity-90 hover:opacity-100"
            onClick={e => {
              e.stopPropagation();
              markDone(t.id);
            }}
          >
            Mark done
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Calendar
          </h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Tasks by scheduled day. Overdue (open + past day) stay red in this
            view.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="text-xs text-sky-400 px-2 py-1 rounded hover:bg-white/5"
            onClick={() => shiftMonth(-1)}
          >
            ←
          </button>
          <span className="text-sm text-slate-200 min-w-[9rem] text-center">
            {monthLabel(year, month0)}
          </span>
          <button
            type="button"
            className="text-xs text-sky-400 px-2 py-1 rounded hover:bg-white/5"
            onClick={() => shiftMonth(1)}
          >
            →
          </button>
          <button
            type="button"
            className="text-xs text-slate-400 px-2 py-1"
            onClick={() => {
              setYear(todayParts.y);
              setMonth0(todayParts.m - 1);
            }}
          >
            Today
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {/* Always-visible overdue strip */}
      <section
        className="rounded-lg p-3 space-y-2"
        style={{
          border: "1px solid rgba(248,113,113,0.35)",
          background: "rgba(127,29,29,0.18)",
        }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <h5 className="text-xs font-semibold uppercase tracking-wide text-rose-300">
            Overdue
            {overdue.length > 0 && (
              <span className="ml-2 text-rose-200/90 normal-case font-medium">
                ({overdue.length})
              </span>
            )}
          </h5>
          <span className="text-[10px] text-rose-200/60">
            Open tasks on approved plans past their day
          </span>
        </div>
        {loading && overdue.length === 0 ? (
          <p className="text-xs text-rose-200/50">Loading…</p>
        ) : overdue.length === 0 ? (
          <p className="text-xs text-rose-200/60">None overdue — good.</p>
        ) : (
          <ul className="space-y-1.5">
            {overdue.map(t => (
              <li key={t.id} className="flex flex-wrap items-start gap-2">
                <div className="flex-1 min-w-0">
                  <TaskChip t={t} />
                </div>
                <span className="text-[10px] text-rose-200/70 font-mono shrink-0 pt-1">
                  due {t.scheduled_for}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Month grid */}
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="grid grid-cols-7">
          {DOW.map(d => (
            <div
              key={d}
              className="text-[10px] uppercase tracking-wide text-slate-500 px-2 py-1.5 text-center"
              style={{ background: "rgba(15,32,64,0.8)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
            >
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map(ymd => {
            const inMonth = ymd >= bounds.monthStart && ymd <= bounds.monthEnd;
            const isToday = ymd === today;
            const dayTasks = byDay.get(ymd) ?? [];
            const dayOverdue = dayTasks.filter(t => t.overdue).length;

            return (
              <div
                key={ymd}
                className="min-h-[5.5rem] p-1.5 space-y-1"
                style={{
                  background: isToday
                    ? "rgba(37,99,235,0.12)"
                    : inMonth
                      ? "rgba(8,15,30,0.6)"
                      : "rgba(8,15,30,0.25)",
                  borderBottom: "1px solid rgba(255,255,255,0.04)",
                  borderRight: "1px solid rgba(255,255,255,0.04)",
                  opacity: inMonth ? 1 : 0.55,
                }}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-[11px] font-medium ${
                      isToday ? "text-sky-300" : "text-slate-400"
                    }`}
                  >
                    {parseYmdParts(ymd).d}
                  </span>
                  {dayOverdue > 0 && (
                    <span className="text-[9px] text-rose-400 font-semibold">
                      {dayOverdue} overdue
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {dayTasks.slice(0, 4).map(t => (
                    <TaskChip key={t.id} t={t} compact />
                  ))}
                  {dayTasks.length > 4 && (
                    <p className="text-[9px] text-slate-500 pl-0.5">
                      +{dayTasks.length - 4} more
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <p className="text-xs text-slate-500">Refreshing calendar…</p>
      )}

      <div className="flex flex-wrap gap-3 text-[10px] text-slate-500">
        <span>
          <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "rgba(248,113,113,0.8)" }} />
          Overdue
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "rgba(251,191,36,0.7)" }} />
          Pending approval
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "rgba(148,163,184,0.5)" }} />
          Open
        </span>
        <span>
          <span className="inline-block w-2 h-2 rounded-sm mr-1 align-middle" style={{ background: "rgba(52,211,153,0.6)" }} />
          Done
        </span>
      </div>
    </div>
  );
}
