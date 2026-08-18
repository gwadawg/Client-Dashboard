"use client";

import { useEffect, useMemo, useState } from "react";
import { describeClientTenure } from "@/lib/client-tenure";
import { cachedJsonFetch, peekCachedJson } from "@/lib/client-fetch-cache";
import type { DashboardClient } from "@/lib/use-dashboard-filters";

type Activity = {
  client_id: string;
  source_id: string;
  activity_type: string;
  occurred_at: string;
  subtype: string | null;
  summary: string | null;
  source_table: string;
};

type FetchedActivity = {
  clientId: string;
  rows: Activity[];
  error: string;
};

type Props = {
  /** Null under All / Live scope, where there is no single history to show. */
  client: DashboardClient | null;
  todayYmd: string;
  onClose: () => void;
};

const cacheKeyFor = (clientId: string) => `activity|${clientId}`;

/** One accent per activity family, so the rail is scannable without reading it. */
const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  lifecycle: { label: "Status", color: "#c084fc" },
  call: { label: "Call", color: "#38bdf8" },
  note: { label: "Note", color: "#94a3b8" },
  action: { label: "Action", color: "#fbbf24" },
  billing: { label: "Billing", color: "#34d399" },
  touchpoint: { label: "Touchpoint", color: "#2dd4bf" },
  commitment: { label: "Commitment", color: "#f472b6" },
  plan: { label: "Plan", color: "#a3e635" },
  task: { label: "Task", color: "#a3e635" },
  health: { label: "Health", color: "#fb923c" },
  mrr: { label: "MRR", color: "#34d399" },
};

function styleFor(type: string, subtype?: string | null) {
  if (type === "action") {
    if (subtype === "finding") return { label: "Finding", color: "#fbbf24" };
    if (subtype === "cadence") return { label: "Cadence", color: "#94a3b8" };
    if (subtype === "bet") return { label: "Bet", color: "#60a5fa" };
    return { label: "Work", color: "#fbbf24" };
  }
  return TYPE_STYLE[type] ?? { label: type, color: "#64748b" };
}

/** "Today" / "Yesterday" / "Mar 12, 2026" for the day dividers. */
function dayLabel(iso: string, todayYmd: string): string {
  const day = iso.slice(0, 10);
  if (day === todayYmd) return "Today";
  const [ty, tm, td] = todayYmd.split("-").map(Number);
  const yesterday = new Date(Date.UTC(ty, tm - 1, td - 1)).toISOString().slice(0, 10);
  if (day === yesterday) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: y === ty ? undefined : "numeric",
  });
}

function timeLabel(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/**
 * Chronological account history for the selected client, beside the numbers.
 * The whole point is answering "what did we change, and when" without leaving
 * the KPIs you're trying to explain.
 */
export default function ClientActivityRail({ client, todayYmd, onClose }: Props) {
  // Keyed by client so a result never bleeds onto the next selection: anything
  // whose clientId doesn't match the current one is ignored rather than shown.
  const [fetched, setFetched] = useState<FetchedActivity | null>(null);
  const clientId = client?.id ?? null;

  useEffect(() => {
    // Nothing to fetch under All / Live scope — the empty state renders instead.
    if (!clientId) return;

    const ac = new AbortController();
    cachedJsonFetch<{ activities?: Activity[]; error?: string }>(
      cacheKeyFor(clientId),
      `/api/clients/${clientId}/activity?limit=200`,
      { signal: ac.signal, preferCache: false, staleTime: 30_000 },
    )
      .then(d => {
        if (ac.signal.aborted) return;
        setFetched({ clientId, rows: d.error ? [] : d.activities ?? [], error: d.error ?? "" });
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        setFetched({ clientId, rows: [], error: "Couldn't load account history" });
      });

    return () => ac.abort();
  }, [clientId]);

  const settled = fetched?.clientId === clientId ? fetched : null;
  // Revisiting a client shows its cached rows immediately, dimmed, instead of
  // flashing a spinner over history that's already in memory.
  const cachedRows =
    settled || !clientId
      ? null
      : peekCachedJson<{ activities?: Activity[] }>(cacheKeyFor(clientId))?.activities ?? null;

  const activities = settled?.rows ?? cachedRows;
  const error = settled?.error ?? "";
  const loading = Boolean(clientId) && !settled;

  const grouped = useMemo(() => {
    const days = new Map<string, Activity[]>();
    for (const a of activities ?? []) {
      const day = a.occurred_at?.slice(0, 10) ?? "";
      if (!day) continue;
      const bucket = days.get(day);
      if (bucket) bucket.push(a);
      else days.set(day, [a]);
    }
    return [...days.entries()];
  }, [activities]);

  const tenure = client ? describeClientTenure(client, todayYmd) : null;

  return (
    <aside
      className="hidden lg:flex shrink-0 flex-col w-80 rounded-2xl overflow-hidden self-start sticky top-28"
      style={{
        background: "var(--color-ws-panel)",
        border: "1px solid var(--color-ws-hairline)",
        maxHeight: "calc(100vh - 12rem)",
      }}
    >
      <header
        className="flex items-start gap-2 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid var(--color-ws-hairline)" }}
      >
        <div className="min-w-0 flex-1">
          <p
            className="text-[10px] font-bold uppercase tracking-widest font-display"
            style={{ color: "var(--color-ws-text-ghost)" }}
          >
            Account history
          </p>
          <p className="text-sm font-semibold truncate mt-0.5" style={{ color: "var(--color-ws-text)" }}>
            {client?.name ?? "No client selected"}
          </p>
          {tenure && (
            <p className="text-[11px] mt-0.5" style={{ color: "var(--color-ws-text-faint)" }}>
              {tenure.liveLabel}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 p-1 rounded-md transition-colors"
          style={{ color: "var(--color-ws-text-faint)" }}
          aria-label="Hide account history"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3">
        {/* Stays mounted under All / Live scope so the rail doesn't appear to
            break when you widen the filter — it explains what it needs instead. */}
        {!client ? (
          <p className="text-xs py-6 text-center leading-relaxed" style={{ color: "var(--color-ws-text-ghost)" }}>
            Select a single client in the filter bar to see its account history — status changes, calls,
            notes, interventions, touchpoints and billing.
          </p>
        ) : loading && !activities ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--color-ws-text-ghost)" }}>
            Loading history…
          </p>
        ) : error ? (
          <p className="text-xs py-6 text-center" style={{ color: "var(--color-ws-text-faint)" }}>
            {error}
          </p>
        ) : grouped.length === 0 ? (
          <p className="text-xs py-6 text-center leading-relaxed" style={{ color: "var(--color-ws-text-ghost)" }}>
            Nothing logged yet. Status changes, calls, notes, interventions, touchpoints and billings show up here.
          </p>
        ) : (
          <div
            className="space-y-4 transition-opacity duration-200 ease-ws"
            style={{ opacity: loading ? 0.55 : 1 }}
            aria-busy={loading}
          >
            {grouped.map(([day, items]) => (
              <section key={day}>
                <p
                  className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 font-data"
                  style={{ color: "var(--color-ws-text-ghost)" }}
                >
                  {dayLabel(day, todayYmd)}
                </p>
                <div className="space-y-1.5">
                  {items.map(a => {
                    const style = styleFor(a.activity_type, a.subtype);
                    return (
                      <article
                        key={`${a.source_table}-${a.source_id}`}
                        className="rounded-lg px-2.5 py-2"
                        style={{
                          background: "var(--color-ws-base)",
                          borderLeft: `2px solid ${style.color}`,
                        }}
                      >
                        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold">
                          <span style={{ color: style.color }}>{style.label}</span>
                          <span style={{ color: "var(--color-ws-text-ghost)" }}>
                            {timeLabel(a.occurred_at)}
                          </span>
                        </p>
                        <p
                          className="text-xs mt-1 leading-relaxed break-words"
                          style={{ color: "var(--color-ws-text-muted)" }}
                        >
                          {a.summary ?? "—"}
                        </p>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
