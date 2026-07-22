"use client";

import { useEffect, useRef, useState } from "react";
import { CALL_CENTER_TIMEZONE } from "@/lib/time";
import { FOCUS_STATUSES, type FocusStatus } from "@/lib/focus-schedule";

type Agent = { id: string; name: string; phone: string };
type Client = { id: string; name: string; is_live?: boolean };
type AvailRow = {
  id: string; agent_id: string; weekday: string;
  time_start: string; time_end: string; is_live: boolean;
  agents: { name: string };
};
type FocusRow = {
  id: string; client_id: string; agent_id: string | null;
  scheduled_date: string; time_start: string; time_end: string;
  status: FocusStatus; notes: string | null;
  clients: { name: string }; agents: { name: string } | null;
};
type WatchEntry = {
  id: string; agent_id: string; scheduled_date: string; slot_hour: number;
  agents: { name: string };
};

type Tab = "watch" | "focus" | "availability";

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const HOURS = Array.from({ length: 13 }, (_, i) => i + 8); // 8–20

const STATUS_META: Record<FocusStatus, { label: string; color: string; bg: string; border: string }> = {
  scheduled: { label: "Scheduled", color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)" },
  done:      { label: "Done",      color: "#22c55e", bg: "rgba(34,197,94,0.12)",  border: "rgba(34,197,94,0.25)" },
  skipped:   { label: "Skipped",   color: "#64748b", bg: "rgba(100,116,139,0.12)", border: "rgba(100,116,139,0.25)" },
};

function nextWeekday(current: string) {
  return WEEKDAYS[(WEEKDAYS.indexOf(current) + 1) % 7];
}

function getMondayOfWeek(offset = 0) {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day) + offset * 7);
  return d.toISOString().split("T")[0];
}

function getWeekDates(weekStart: string): { date: string; weekday: string }[] {
  const start = new Date(weekStart + "T12:00:00Z");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start.getTime() + i * 86400000);
    return { date: d.toISOString().split("T")[0], weekday: WEEKDAY_NAMES[d.getUTCDay()] };
  });
}

function fmtTime(t: string | null | undefined) {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

function fmtHour(h: number) {
  return `${h % 12 || 12}:00 ${h >= 12 ? "PM" : "AM"}`;
}

function fmtRange(start: string, end: string) {
  return `${fmtTime(start)} – ${fmtTime(end)}`;
}

function Input({ value, onChange, type = "text", placeholder = "", className = "" }: {
  value: string; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string;
}) {
  return (
    <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
      className={`px-3 py-2 rounded-lg text-sm outline-none ${className}`}
      style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }} />
  );
}

function Sel({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="px-3 py-2 rounded-lg text-sm outline-none cursor-pointer"
      style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}>
      {children}
    </select>
  );
}

function WeekNav({ weekStart, setWeekStart }: { weekStart: string; setWeekStart: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs" style={{ color: "#475569" }}>Week Starting</label>
        <Input type="date" value={weekStart} onChange={setWeekStart} />
      </div>
      <div className="flex gap-2 mt-4">
        <button type="button" onClick={() => setWeekStart(getMondayOfWeek(0))}
          className="px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: "#0f2040", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}>
          This Week
        </button>
        <button type="button" onClick={() => setWeekStart(getMondayOfWeek(1))}
          className="px-3 py-2 rounded-lg text-xs font-medium"
          style={{ background: "#0f2040", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.08)" }}>
          Next Week
        </button>
      </div>
    </div>
  );
}

// ─── Watch Schedule Tab ───────────────────────────────────────────────────────

const WATCH_ROW_H = 40; // px per hour — Google Calendar–style blocks

type WatchBlock = {
  agentId: string;
  name: string;
  date: string;
  startHour: number;
  endHour: number; // inclusive
  entryIds: string[];
};

function buildWatchBlocks(entries: WatchEntry[], date: string): WatchBlock[] {
  const day = entries
    .filter(e => e.scheduled_date === date)
    .sort((a, b) => a.slot_hour - b.slot_hour || a.agent_id.localeCompare(b.agent_id));

  const byAgent = new Map<string, WatchEntry[]>();
  for (const e of day) {
    const list = byAgent.get(e.agent_id) ?? [];
    list.push(e);
    byAgent.set(e.agent_id, list);
  }

  const blocks: WatchBlock[] = [];
  for (const [, list] of byAgent) {
    let run: WatchEntry[] = [];
    const flush = () => {
      if (!run.length) return;
      blocks.push({
        agentId: run[0].agent_id,
        name: run[0].agents?.name ?? "—",
        date,
        startHour: run[0].slot_hour,
        endHour: run[run.length - 1].slot_hour,
        entryIds: run.map(r => r.id),
      });
      run = [];
    };
    for (const e of list) {
      if (!run.length || e.slot_hour === run[run.length - 1].slot_hour + 1) {
        run.push(e);
      } else {
        flush();
        run = [e];
      }
    }
    flush();
  }
  return blocks;
}

function hourFromY(clientY: number, columnTop: number): number {
  const y = clientY - columnTop;
  const idx = Math.floor(y / WATCH_ROW_H);
  const clamped = Math.max(0, Math.min(HOURS.length - 1, idx));
  return HOURS[clamped];
}

function WatchScheduleTab({ agents, availability, weekStart, setWeekStart }: {
  agents: Agent[];
  availability: AvailRow[];
  weekStart: string;
  setWeekStart: (v: string) => void;
}) {
  const [entries, setEntries] = useState<WatchEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredAgent, setHoveredAgent] = useState<string | null>(null);
  const [dragAgentId, setDragAgentId] = useState<string | null>(null);
  const [dropHover, setDropHover] = useState<{ date: string; hour: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [resizePreview, setResizePreview] = useState<{
    blockKey: string;
    startHour: number;
    endHour: number;
  } | null>(null);

  const resizeRef = useRef<{
    blockKey: string;
    date: string;
    agentId: string;
    edge: "top" | "bottom";
    fixedHour: number;
    entryIds: string[];
    originalStart: number;
    originalEnd: number;
    columnTop: number;
  } | null>(null);
  const resizeLiveRef = useRef<{ startHour: number; endHour: number } | null>(null);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;

  useEffect(() => {
    setLoading(true);
    fetch(`/api/watch-schedule?week_start=${weekStart}`)
      .then(r => r.json())
      .then(d => { setEntries(d.rows ?? []); setLoading(false); });
  }, [weekStart]);

  const weekDates = getWeekDates(weekStart);

  function isAvailable(agentId: string, weekday: string, hour: number) {
    const hhmm = `${String(hour).padStart(2, "0")}:00:00`;
    return availability.some(a =>
      a.agent_id === agentId && a.weekday === weekday && a.is_live &&
      a.time_start <= hhmm && a.time_end > hhmm
    );
  }

  async function upsertBlockHours(date: string, startHour: number, endHour: number, agentId: string) {
    const lo = Math.min(startHour, endHour);
    const hi = Math.max(startHour, endHour);
    const res = await fetch("/api/watch-schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agent_id: agentId,
        scheduled_date: date,
        slot_hour_start: lo,
        slot_hour_end: hi,
      }),
    });
    const d = await res.json();
    const rows: WatchEntry[] = d.rows ?? (d.row ? [d.row] : []);
    if (rows.length) {
      setEntries(prev => {
        const next = [...prev];
        for (const row of rows) {
          if (!next.some(e => e.id === row.id)) next.push(row);
        }
        return next;
      });
    }
  }

  async function assignBlock(date: string, startHour: number, endHour: number, agentId: string) {
    setSaving(true);
    try {
      await upsertBlockHours(date, startHour, endHour, agentId);
    } finally {
      setSaving(false);
    }
  }

  async function removeHours(entryIds: string[]) {
    if (!entryIds.length) return;
    await Promise.all(entryIds.map(id => fetch(`/api/watch-schedule/${id}`, { method: "DELETE" })));
    const ids = new Set(entryIds);
    setEntries(prev => prev.filter(e => !ids.has(e.id)));
  }

  async function commitResize(
    date: string,
    agentId: string,
    newStart: number,
    newEnd: number,
    originalStart: number,
    originalEnd: number,
  ) {
    const lo = Math.min(newStart, newEnd);
    const hi = Math.max(newStart, newEnd);
    if (lo === originalStart && hi === originalEnd) return;

    setSaving(true);
    try {
      await upsertBlockHours(date, lo, hi, agentId);

      const toRemove = entriesRef.current
        .filter(e =>
          e.agent_id === agentId &&
          e.scheduled_date === date &&
          e.slot_hour >= originalStart &&
          e.slot_hour <= originalEnd &&
          (e.slot_hour < lo || e.slot_hour > hi),
        )
        .map(e => e.id);
      if (toRemove.length) await removeHours(toRemove);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const hour = hourFromY(e.clientY, r.columnTop);
      let startHour: number;
      let endHour: number;
      if (r.edge === "bottom") {
        startHour = r.fixedHour;
        endHour = Math.max(r.fixedHour, hour);
      } else {
        endHour = r.fixedHour;
        startHour = Math.min(r.fixedHour, hour);
      }
      resizeLiveRef.current = { startHour, endHour };
      setResizePreview({ blockKey: r.blockKey, startHour, endHour });
    }

    async function onUp() {
      const r = resizeRef.current;
      const live = resizeLiveRef.current;
      resizeRef.current = null;
      resizeLiveRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setResizePreview(null);
      if (!r || !live) return;
      await commitResize(
        r.date,
        r.agentId,
        live.startHour,
        live.endHour,
        r.originalStart,
        r.originalEnd,
      );
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  function startResize(
    e: React.MouseEvent,
    block: WatchBlock,
    edge: "top" | "bottom",
    columnEl: HTMLElement,
  ) {
    e.preventDefault();
    e.stopPropagation();
    const blockKey = `${block.date}:${block.agentId}:${block.entryIds[0]}`;
    const top = columnEl.getBoundingClientRect().top;
    resizeRef.current = {
      blockKey,
      date: block.date,
      agentId: block.agentId,
      edge,
      fixedHour: edge === "bottom" ? block.startHour : block.endHour,
      entryIds: block.entryIds,
      originalStart: block.startHour,
      originalEnd: block.endHour,
      columnTop: top,
    };
    resizeLiveRef.current = { startHour: block.startHour, endHour: block.endHour };
    setResizePreview({ blockKey, startHour: block.startHour, endHour: block.endHour });
    document.body.style.cursor = "ns-resize";
    document.body.style.userSelect = "none";
  }

  const gridH = HOURS.length * WATCH_ROW_H;

  return (
    <div className="space-y-5">
      <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />

      <p className="text-xs" style={{ color: "#64748b" }}>
        Drop a setter on an hour to place a block, then drag the bottom (or top) edge to stretch it like a calendar event.
        {saving && <span style={{ color: "#f59e0b" }}> Saving…</span>}
      </p>

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: "#334155" }}>Loading…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <div style={{ minWidth: "860px" }}>
            <div className="flex" style={{ background: "#0a1628", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <div className="shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wider"
                style={{ width: 80, color: "#334155" }}>
                Time
              </div>
              {weekDates.map(({ date, weekday }) => {
                const d = new Date(date + "T12:00:00Z");
                return (
                  <div key={date} className="flex-1 px-2 py-3 text-center text-xs"
                    style={{ color: "#94a3b8", borderLeft: "1px solid rgba(255,255,255,0.04)", minWidth: 110 }}>
                    <div className="font-semibold">{weekday.slice(0, 3)}</div>
                    <div style={{ color: "#475569" }}>{d.getUTCMonth() + 1}/{d.getUTCDate()}</div>
                  </div>
                );
              })}
            </div>

            <div className="flex">
              <div className="shrink-0 relative" style={{ width: 80 }}>
                {HOURS.map((hour, hi) => (
                  <div key={hour} className="px-3 font-mono text-xs flex items-start pt-1"
                    style={{
                      height: WATCH_ROW_H,
                      color: "#475569",
                      background: hi % 2 === 0 ? "#080f1e" : "#060d1a",
                      borderRight: "1px solid rgba(255,255,255,0.04)",
                    }}>
                    {fmtHour(hour)}
                  </div>
                ))}
              </div>

              {weekDates.map(({ date, weekday }) => {
                const blocks = buildWatchBlocks(entries, date).map(b => {
                  const key = `${b.date}:${b.agentId}:${b.entryIds[0]}`;
                  if (resizePreview && resizePreview.blockKey === key) {
                    return { ...b, startHour: resizePreview.startHour, endHour: resizePreview.endHour };
                  }
                  return b;
                });

                return (
                  <WatchDayColumn
                    key={date}
                    date={date}
                    weekday={weekday}
                    blocks={blocks}
                    gridH={gridH}
                    hoveredAgent={hoveredAgent}
                    dragAgentId={dragAgentId}
                    dropHover={dropHover}
                    isAvailable={isAvailable}
                    onDropHover={setDropHover}
                    onDrop={(hour, agentId) => {
                      void assignBlock(date, hour, hour, agentId);
                      setDropHover(null);
                      setDragAgentId(null);
                    }}
                    onRemoveBlock={block => { void removeHours(block.entryIds); }}
                    onStartResize={startResize}
                    onHoverAgent={setHoveredAgent}
                  />
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl p-4 space-y-3" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#475569" }}>
          Setters — drop onto an hour · drag block edges to cover the shift · hover to highlight availability
        </p>
        <div className="flex flex-wrap gap-2">
          {agents.length === 0 ? (
            <p className="text-xs" style={{ color: "#334155" }}>No setters yet. Add them in the Agent Roster first.</p>
          ) : agents.map(agent => (
            <div key={agent.id}
              draggable
              onDragStart={e => {
                e.dataTransfer.setData("agentId", agent.id);
                e.dataTransfer.effectAllowed = "copy";
                setDragAgentId(agent.id);
                setHoveredAgent(agent.id);
              }}
              onDragEnd={() => {
                setDragAgentId(null);
                setHoveredAgent(null);
                setDropHover(null);
              }}
              onMouseEnter={() => setHoveredAgent(agent.id)}
              onMouseLeave={() => setHoveredAgent(null)}
              className="px-3 py-1.5 rounded-full text-xs font-medium cursor-grab active:cursor-grabbing select-none"
              style={{
                background: hoveredAgent === agent.id ? "rgba(245,158,11,0.25)" : "rgba(245,158,11,0.10)",
                border: `1px solid ${hoveredAgent === agent.id ? "rgba(245,158,11,0.5)" : "rgba(245,158,11,0.2)"}`,
                color: "#f59e0b",
                transition: "background 0.1s, border-color 0.1s",
              }}>
              {agent.name}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function WatchDayColumn({
  date,
  weekday,
  blocks,
  gridH,
  hoveredAgent,
  dragAgentId,
  dropHover,
  isAvailable,
  onDropHover,
  onDrop,
  onRemoveBlock,
  onStartResize,
  onHoverAgent,
}: {
  date: string;
  weekday: string;
  blocks: WatchBlock[];
  gridH: number;
  hoveredAgent: string | null;
  dragAgentId: string | null;
  dropHover: { date: string; hour: number } | null;
  isAvailable: (agentId: string, weekday: string, hour: number) => boolean;
  onDropHover: (v: { date: string; hour: number } | null) => void;
  onDrop: (hour: number, agentId: string) => void;
  onRemoveBlock: (block: WatchBlock) => void;
  onStartResize: (e: React.MouseEvent, block: WatchBlock, edge: "top" | "bottom", columnEl: HTMLElement) => void;
  onHoverAgent: (id: string | null) => void;
}) {
  const colRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={colRef}
      className="flex-1 relative"
      style={{ minWidth: 110, height: gridH, borderLeft: "1px solid rgba(255,255,255,0.04)" }}
      onDragOver={e => {
        e.preventDefault();
        if (!colRef.current || !dragAgentId) return;
        const hour = hourFromY(e.clientY, colRef.current.getBoundingClientRect().top);
        onDropHover({ date, hour });
      }}
      onDragLeave={e => {
        if (!e.relatedTarget || !e.currentTarget.contains(e.relatedTarget as Node)) {
          onDropHover(null);
        }
      }}
      onDrop={e => {
        e.preventDefault();
        if (!colRef.current) return;
        const agentId = e.dataTransfer.getData("agentId") || dragAgentId;
        if (!agentId) return;
        const hour = hourFromY(e.clientY, colRef.current.getBoundingClientRect().top);
        onDrop(hour, agentId);
      }}
    >
      {HOURS.map((hour, hi) => {
        const highlight =
          (hoveredAgent && isAvailable(hoveredAgent, weekday, hour)) ||
          (dropHover?.date === date && dropHover.hour === hour);
        return (
          <div
            key={hour}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: hi * WATCH_ROW_H,
              height: WATCH_ROW_H,
              background: highlight
                ? "rgba(245,158,11,0.12)"
                : hi % 2 === 0
                ? "#080f1e"
                : "#060d1a",
              borderBottom: "1px solid rgba(255,255,255,0.03)",
              pointerEvents: "none",
            }}
          />
        );
      })}

      {blocks.map((block, i) => {
        const top = (block.startHour - HOURS[0]) * WATCH_ROW_H + 2;
        const height = (block.endHour - block.startHour + 1) * WATCH_ROW_H - 4;
        const overlapping = blocks.filter(b =>
          b !== block && !(b.endHour < block.startHour || b.startHour > block.endHour),
        );
        const stackIndex = overlapping.filter(b => blocks.indexOf(b) < i).length;
        const stackCount = overlapping.length + 1;
        const widthPct = 100 / Math.min(stackCount, 3);
        const leftPct = (stackIndex % 3) * widthPct;

        return (
          <div
            key={`${block.agentId}-${block.startHour}-${block.entryIds[0]}`}
            className="absolute rounded-md overflow-hidden flex flex-col"
            style={{
              top,
              height: Math.max(height, WATCH_ROW_H - 4),
              left: `calc(${leftPct}% + 3px)`,
              width: `calc(${widthPct}% - 6px)`,
              background: "rgba(245,158,11,0.18)",
              border: "1px solid rgba(245,158,11,0.35)",
              zIndex: 2,
            }}
            onMouseEnter={() => onHoverAgent(block.agentId)}
            onMouseLeave={() => onHoverAgent(null)}
          >
            <div
              className="shrink-0 cursor-ns-resize flex items-center justify-center"
              style={{ height: 6 }}
              onMouseDown={e => colRef.current && onStartResize(e, block, "top", colRef.current)}
              title="Drag to change start"
            >
              <div style={{ width: 20, height: 2, borderRadius: 1, background: "rgba(245,158,11,0.5)" }} />
            </div>

            <div className="flex-1 flex items-start gap-1 px-1.5 min-h-0">
              <span className="truncate text-xs font-medium flex-1" style={{ color: "#f59e0b" }}>
                {block.name}
              </span>
              <button
                type="button"
                onClick={() => onRemoveBlock(block)}
                className="shrink-0 leading-none opacity-50 hover:opacity-100"
                style={{ color: "#f59e0b", fontSize: 12 }}
                title="Remove entire block"
              >
                ×
              </button>
            </div>

            {block.endHour > block.startHour && (
              <div className="px-1.5 pb-0.5 text-[10px]" style={{ color: "rgba(245,158,11,0.7)" }}>
                {fmtHour(block.startHour)} – {fmtHour(block.endHour + 1)}
              </div>
            )}

            <div
              className="shrink-0 cursor-ns-resize flex items-center justify-center"
              style={{ height: 8 }}
              onMouseDown={e => colRef.current && onStartResize(e, block, "bottom", colRef.current)}
              title="Drag to extend or shorten"
            >
              <div style={{ width: 28, height: 3, borderRadius: 2, background: "rgba(245,158,11,0.65)" }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Focus Board Tab ──────────────────────────────────────────────────────────

type FocusForm = {
  client_id: string;
  scheduled_date: string;
  time_start: string;
  time_end: string;
  agent_id: string;
  notes: string;
  status: FocusStatus;
};

function emptyForm(defaultDate: string): FocusForm {
  return {
    client_id: "",
    scheduled_date: defaultDate,
    time_start: "09:00",
    time_end: "11:00",
    agent_id: "",
    notes: "",
    status: "scheduled",
  };
}

function FocusTab({ agents, clients, weekStart, setWeekStart }: {
  agents: Agent[];
  clients: Client[];
  weekStart: string;
  setWeekStart: (v: string) => void;
}) {
  const [rows, setRows] = useState<FocusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<FocusRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FocusForm>(() => emptyForm(weekStart));
  const [saving, setSaving] = useState(false);

  const weekDates = getWeekDates(weekStart);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/focus-schedule?week_start=${weekStart}`)
      .then(async r => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Failed to load");
        setRows(d.rows ?? []);
      })
      .catch(e => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [weekStart]);

  function openAdd(date?: string) {
    setEditing(null);
    setForm(emptyForm(date ?? weekStart));
    setAdding(true);
    setError(null);
  }

  function openEdit(row: FocusRow) {
    setAdding(false);
    setEditing(row);
    setForm({
      client_id: row.client_id,
      scheduled_date: row.scheduled_date,
      time_start: row.time_start.slice(0, 5),
      time_end: row.time_end.slice(0, 5),
      agent_id: row.agent_id ?? "",
      notes: row.notes ?? "",
      status: row.status,
    });
    setError(null);
  }

  function closeForm() {
    setAdding(false);
    setEditing(null);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const payload = {
      client_id: form.client_id,
      scheduled_date: form.scheduled_date,
      time_start: form.time_start,
      time_end: form.time_end,
      agent_id: form.agent_id || null,
      notes: form.notes.trim() || null,
      status: form.status,
    };

    try {
      if (editing) {
        const res = await fetch(`/api/focus-schedule/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Update failed");
        if (d.row) setRows(prev => prev.map(r => r.id === editing.id ? d.row : r));
      } else {
        const res = await fetch("/api/focus-schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || "Create failed");
        if (d.row) setRows(prev => [...prev, d.row]);
      }
      closeForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function updateField(id: string, patch: Record<string, unknown>) {
    setError(null);
    const res = await fetch(`/api/focus-schedule/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const d = await res.json();
    if (!res.ok) {
      setError(d.error || "Update failed");
      return;
    }
    if (d.row) setRows(prev => prev.map(r => r.id === id ? d.row : r));
  }

  async function handleDelete(id: string) {
    setError(null);
    const res = await fetch(`/api/focus-schedule/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Delete failed");
      return;
    }
    setRows(prev => prev.filter(r => r.id !== id));
    if (editing?.id === id) closeForm();
  }

  const byDate: Record<string, FocusRow[]> = {};
  for (const date of weekDates.map(d => d.date)) byDate[date] = [];
  for (const row of rows) {
    if (!byDate[row.scheduled_date]) byDate[row.scheduled_date] = [];
    byDate[row.scheduled_date].push(row);
  }
  for (const d of Object.keys(byDate)) {
    byDate[d].sort((a, b) => a.time_start.localeCompare(b.time_start));
  }

  const doneCount = rows.filter(r => r.status === "done").length;
  const showForm = adding || editing;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <WeekNav weekStart={weekStart} setWeekStart={setWeekStart} />
        <div className="ml-auto flex items-center gap-3 mt-4">
          {rows.length > 0 && (
            <p className="text-xs" style={{ color: "#64748b" }}>
              <span className="font-semibold" style={{ color: "#e2e8f0" }}>{doneCount}</span> / {rows.length} done
            </p>
          )}
          <button type="button" onClick={() => openAdd()}
            className="px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: "#f59e0b", color: "#fff" }}>
            + Add focus
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg px-4 py-2 text-sm" style={{ background: "rgba(239,68,68,0.1)", color: "#f87171" }}>
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>
            {editing ? "Edit focus" : "Add focus"}
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: "#475569" }}>Client</label>
              <Sel value={form.client_id} onChange={v => setForm(f => ({ ...f, client_id: v }))}>
                <option value="">Select client…</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Sel>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: "#475569" }}>Date</label>
              <Input type="date" value={form.scheduled_date} onChange={v => setForm(f => ({ ...f, scheduled_date: v }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: "#475569" }}>Start</label>
              <Input type="time" value={form.time_start} onChange={v => setForm(f => ({ ...f, time_start: v }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: "#475569" }}>End</label>
              <Input type="time" value={form.time_end} onChange={v => setForm(f => ({ ...f, time_end: v }))} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs" style={{ color: "#475569" }}>Assignee</label>
              <Sel value={form.agent_id} onChange={v => setForm(f => ({ ...f, agent_id: v }))}>
                <option value="">Unassigned</option>
                {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Sel>
            </div>
            {editing && (
              <div className="flex flex-col gap-1">
                <label className="text-xs" style={{ color: "#475569" }}>Status</label>
                <Sel value={form.status} onChange={v => setForm(f => ({ ...f, status: v as FocusStatus }))}>
                  {FOCUS_STATUSES.map(s => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                </Sel>
              </div>
            )}
            <div className="flex flex-col gap-1 min-w-[200px] flex-1">
              <label className="text-xs" style={{ color: "#475569" }}>Notes</label>
              <Input value={form.notes} onChange={v => setForm(f => ({ ...f, notes: v }))} placeholder="Optional reason / offer context" />
            </div>
            <button type="button" onClick={handleSave} disabled={!form.client_id || saving}
              className="px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ background: "#f59e0b", color: "#fff", opacity: (!form.client_id || saving) ? 0.5 : 1 }}>
              {saving ? "Saving…" : editing ? "Save" : "Add"}
            </button>
            <button type="button" onClick={closeForm}
              className="px-3 py-2 rounded-lg text-sm"
              style={{ color: "#64748b" }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm" style={{ color: "#334155" }}>Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(7, minmax(140px, 1fr))", minWidth: "980px" }}>
            {weekDates.map(({ date, weekday }) => {
              const dayRows = byDate[date] ?? [];
              const d = new Date(date + "T12:00:00Z");
              return (
                <div key={date} className="rounded-xl flex flex-col min-h-[220px]"
                  style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <button type="button" onClick={() => openAdd(date)}
                    className="px-3 py-2.5 text-left border-b transition-colors"
                    style={{ borderColor: "rgba(255,255,255,0.06)" }}
                    title="Add focus on this day">
                    <div className="text-xs font-semibold" style={{ color: "#e2e8f0" }}>{weekday.slice(0, 3)}</div>
                    <div className="text-[11px]" style={{ color: "#475569" }}>{d.getUTCMonth() + 1}/{d.getUTCDate()}</div>
                  </button>
                  <div className="p-2 flex flex-col gap-2 flex-1">
                    {dayRows.length === 0 ? (
                      <button type="button" onClick={() => openAdd(date)}
                        className="flex-1 rounded-lg border border-dashed text-[11px] px-2 py-4"
                        style={{ borderColor: "rgba(255,255,255,0.08)", color: "#334155" }}>
                        Empty
                      </button>
                    ) : dayRows.map(row => {
                      const meta = STATUS_META[row.status] ?? STATUS_META.scheduled;
                      return (
                        <div key={row.id} className="rounded-lg p-2 space-y-1.5"
                          style={{ background: meta.bg, border: `1px solid ${meta.border}` }}>
                          <button type="button" onClick={() => openEdit(row)} className="w-full text-left space-y-0.5">
                            <div className="text-xs font-semibold truncate" style={{ color: "#e2e8f0" }}>
                              {row.clients?.name ?? "—"}
                            </div>
                            <div className="text-[10px]" style={{ color: "#94a3b8" }}>
                              {fmtRange(row.time_start, row.time_end)}
                            </div>
                            <div className="text-[10px]" style={{ color: row.agent_id ? "#94a3b8" : "#475569" }}>
                              {row.agents?.name ?? "Unassigned"}
                            </div>
                            {row.notes && (
                              <div className="text-[10px] truncate" style={{ color: "#64748b" }}>{row.notes}</div>
                            )}
                          </button>
                          <div className="flex items-center gap-1">
                            <select
                              value={row.status}
                              onChange={e => updateField(row.id, { status: e.target.value })}
                              className="flex-1 text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer font-medium"
                              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", color: meta.color }}
                            >
                              {FOCUS_STATUSES.map(s => (
                                <option key={s} value={s}>{STATUS_META[s].label}</option>
                              ))}
                            </select>
                            <button type="button" onClick={() => handleDelete(row.id)}
                              className="text-[10px] px-1 opacity-50 hover:opacity-100"
                              style={{ color: "#f87171" }}
                              title="Delete">×</button>
                          </div>
                          <select
                            value={row.agent_id ?? ""}
                            onChange={e => updateField(row.id, { agent_id: e.target.value || null })}
                            className="w-full text-[10px] rounded px-1 py-0.5 outline-none cursor-pointer"
                            style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.08)", color: "#94a3b8" }}
                          >
                            <option value="">Unassigned</option>
                            {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Setter Availability Tab ──────────────────────────────────────────────────

function AvailabilityTab({ agents }: { agents: Agent[] }) {
  const [rows, setRows] = useState<AvailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentId, setAgentId] = useState("");
  const [weekday, setWeekday] = useState("Monday");
  const [timeStart, setTimeStart] = useState("09:00");
  const [timeEnd, setTimeEnd] = useState("17:00");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/setter-availability")
      .then(r => r.json())
      .then(d => { setRows(d.rows ?? []); setLoading(false); });
  }, []);

  async function handleAdd() {
    if (!agentId) return;
    setSaving(true);
    const res = await fetch("/api/setter-availability", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent_id: agentId, weekday, time_start: timeStart, time_end: timeEnd }),
    });
    const d = await res.json();
    if (d.row) { setRows(prev => [...prev, d.row]); setWeekday(nextWeekday(weekday)); }
    setSaving(false);
  }

  async function toggleLive(row: AvailRow) {
    const res = await fetch(`/api/setter-availability/${row.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_live: !row.is_live }),
    });
    const d = await res.json();
    if (d.row) setRows(prev => prev.map(r => r.id === row.id ? d.row : r));
  }

  async function handleDelete(id: string) {
    await fetch(`/api/setter-availability/${id}`, { method: "DELETE" });
    setRows(prev => prev.filter(r => r.id !== id));
  }

  if (loading) return <div className="py-8 text-center text-sm" style={{ color: "#334155" }}>Loading…</div>;

  return (
    <div className="space-y-6">
      <p className="text-xs max-w-3xl" style={{ color: "#64748b" }}>
        Live windows here control which leads count toward Speed to Lead (evaluated in{" "}
        <span className="font-medium" style={{ color: "#94a3b8" }}>{CALL_CENTER_TIMEZONE}</span>).
        Off-hours leads are excluded from the median, not penalized.
      </p>
      <div className="rounded-xl p-5 space-y-4" style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
        <p className="text-sm font-semibold" style={{ color: "#e2e8f0" }}>Add Availability</p>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: "#475569" }}>Setter</label>
            <Sel value={agentId} onChange={setAgentId}>
              <option value="">Select setter…</option>
              {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Sel>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: "#475569" }}>Day</label>
            <Sel value={weekday} onChange={setWeekday}>
              {WEEKDAYS.map(d => <option key={d} value={d}>{d}</option>)}
            </Sel>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: "#475569" }}>Available From</label>
            <Input type="time" value={timeStart} onChange={setTimeStart} />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs" style={{ color: "#475569" }}>Available Until</label>
            <Input type="time" value={timeEnd} onChange={setTimeEnd} />
          </div>
          <button type="button" onClick={handleAdd} disabled={!agentId || saving}
            className="px-4 py-2 rounded-lg text-sm font-semibold transition-opacity"
            style={{ background: "#f59e0b", color: "#fff", opacity: (!agentId || saving) ? 0.5 : 1 }}>
            {saving ? "Adding…" : "Add"}
          </button>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "#0a1628" }}>
              {["Setter", "Day", "Available From", "Available Until", "Status", ""].map(h => (
                <th key={h} className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#334155" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm" style={{ color: "#334155" }}>No availability configured yet.</td></tr>
            ) : rows.map((row, i) => (
              <tr key={row.id} style={{ background: i % 2 === 0 ? "#080f1e" : "#060d1a", borderTop: "1px solid rgba(255,255,255,0.04)" }}>
                <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>{row.agents?.name ?? "—"}</td>
                <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{row.weekday}</td>
                <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{fmtTime(row.time_start)}</td>
                <td className="px-4 py-3" style={{ color: "#94a3b8" }}>{fmtTime(row.time_end)}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => toggleLive(row)}
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={row.is_live
                      ? { color: "#22c55e", background: "rgba(34,197,94,0.1)" }
                      : { color: "#ef4444", background: "rgba(239,68,68,0.1)" }}>
                    {row.is_live ? "Live" : "Off"}
                  </button>
                </td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={() => handleDelete(row.id)} className="text-xs transition-colors"
                    style={{ color: "#334155" }}
                    onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
                    onMouseLeave={e => (e.currentTarget.style.color = "#334155")}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Root Component ───────────────────────────────────────────────────────────

export default function SetterSchedule({ clients }: { clients: Client[] }) {
  const [tab, setTab] = useState<Tab>("focus");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [availability, setAvailability] = useState<AvailRow[]>([]);
  const [weekStart, setWeekStart] = useState(getMondayOfWeek(1));

  useEffect(() => {
    fetch("/api/agents?status=active")
      .then(r => r.json())
      .then(d => setAgents(d.agents ?? []));
    fetch("/api/setter-availability")
      .then(r => r.json())
      .then(d => setAvailability(d.rows ?? []));
  }, []);

  const TABS: { key: Tab; label: string }[] = [
    { key: "focus",        label: "Focus" },
    { key: "watch",        label: "Watch" },
    { key: "availability", label: "Setter Availability" },
  ];

  return (
    <div className="space-y-6 max-w-6xl">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Weekly Focus</h2>
        <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
          Schedule client priority blocks for the week, see who&apos;s on watch, and maintain setter availability.
        </p>
      </div>

      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "#0a1628" }}>
        {TABS.map(t => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            style={tab === t.key
              ? { background: "#f59e0b", color: "#fff" }
              : { color: "#475569" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "focus" && (
        <FocusTab
          agents={agents}
          clients={clients}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
        />
      )}
      {tab === "watch" && (
        <WatchScheduleTab
          agents={agents}
          availability={availability}
          weekStart={weekStart}
          setWeekStart={setWeekStart}
        />
      )}
      {tab === "availability" && <AvailabilityTab agents={agents} />}
    </div>
  );
}
