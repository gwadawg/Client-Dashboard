"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ClientStreakSummary,
  MonthCell,
  MonthDisposition,
  OverrideDisposition,
} from "@/lib/payment-streak";
import { OVERRIDE_DISPOSITIONS } from "@/lib/payment-streak";

type SortKey = "streak" | "name" | "risk";

type ClientRow = {
  id: string;
  name: string;
  lifecycle_status: string | null;
  billing_paused: boolean;
  reporting_type: string | null;
  is_live: boolean | null;
  mrr: number | null;
  first_billable_month: string | null;
  summary: ClientStreakSummary;
  months: MonthCell[];
};

type ApiPayload = {
  clients: ClientRow[];
  months: string[];
  can_view_revenue: boolean;
  overrides_enabled?: boolean;
  error?: string;
};

type Props = {
  onOpenClient?: (clientId: string) => void;
};

const DISP_META: Record<
  MonthDisposition,
  { label: string; bg: string; border: string; text: string }
> = {
  paid: {
    label: "Paid",
    bg: "rgba(34,197,94,0.28)",
    border: "rgba(34,197,94,0.55)",
    text: "#86efac",
  },
  short: {
    label: "Short",
    bg: "rgba(249,115,22,0.28)",
    border: "rgba(249,115,22,0.55)",
    text: "#fdba74",
  },
  extension: {
    label: "Extension",
    bg: "rgba(234,179,8,0.30)",
    border: "rgba(234,179,8,0.60)",
    text: "#fde047",
  },
  unpaid: {
    label: "Unpaid",
    bg: "rgba(239,68,68,0.28)",
    border: "rgba(239,68,68,0.55)",
    text: "#fca5a5",
  },
  paused: {
    label: "Paused",
    bg: "rgba(148,163,184,0.22)",
    border: "rgba(148,163,184,0.45)",
    text: "#cbd5e1",
  },
  churned: {
    label: "Churned",
    bg: "rgba(127,29,29,0.45)",
    border: "rgba(185,28,28,0.65)",
    text: "#fca5a5",
  },
  empty: {
    label: "Empty",
    bg: "rgba(30,41,59,0.55)",
    border: "rgba(51,65,85,0.55)",
    text: "#64748b",
  },
};

function money(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function shortYm(ym: string): string {
  const [y, m] = ym.split("-");
  const labels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  const mi = Number(m) - 1;
  return `${labels[mi] ?? m}${String(y).slice(2)}`;
}

function fmtYmLong(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
}

export default function PaymentStreakTimeline({ onOpenClient }: Props) {
  const [includePaused, setIncludePaused] = useState(false);
  const [sort, setSort] = useState<SortKey>("streak");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<ApiPayload | null>(null);
  const [selected, setSelected] = useState<{
    client: ClientRow;
    cell: MonthCell;
  } | null>(null);
  const [overrideDisp, setOverrideDisp] = useState<OverrideDisposition>("paid");
  const [overrideNote, setOverrideNote] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (includePaused) params.set("include_paused", "true");
      const res = await fetch(`/api/cs/payment-streaks?${params}`);
      const json = (await res.json()) as ApiPayload;
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [includePaused]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setOverrideDisp(
      selected.cell.disposition === "empty"
        ? "paid"
        : (selected.cell.disposition as OverrideDisposition),
    );
    setOverrideNote(selected.cell.note ?? "");
  }, [selected]);

  const monthColumns = data?.months ?? [];

  const rows = useMemo(() => {
    let list = data?.clients ?? [];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }
    const sorted = [...list];
    sorted.sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "risk") {
        const ar = a.summary.at_risk ? 0 : 1;
        const br = b.summary.at_risk ? 0 : 1;
        if (ar !== br) return ar - br;
        return b.summary.current_streak - a.summary.current_streak;
      }
      // streak desc, name tiebreak
      if (b.summary.current_streak !== a.summary.current_streak) {
        return b.summary.current_streak - a.summary.current_streak;
      }
      return a.name.localeCompare(b.name);
    });
    return sorted;
  }, [data, search, sort]);

  async function saveOverride() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/cs/payment-streaks/override", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selected.client.id,
          year_month: selected.cell.year_month,
          disposition: overrideDisp,
          note: overrideNote.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      await load();
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function clearOverride() {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      const params = new URLSearchParams({
        client_id: selected.client.id,
        year_month: selected.cell.year_month,
      });
      const res = await fetch(`/api/cs/payment-streaks/override?${params}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Clear failed");
      await load();
      setSelected(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Clear failed");
    } finally {
      setSaving(false);
    }
  }

  function cellAt(client: ClientRow, ym: string): MonthCell | undefined {
    return client.months.find((m) => m.year_month === ym);
  }

  return (
    <div className="space-y-4" style={{ color: "#e2e8f0" }}>
      <style>{`
        @keyframes streak-row-in {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .streak-row {
          animation: streak-row-in 0.35s ease both;
        }
      `}</style>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            className="text-lg font-semibold tracking-tight"
            style={{ color: "#f8fafc" }}
          >
            Payment streak
          </h2>
          <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
            Consecutive full-freight months from the billing ledger. M3 / M6
            badges foreshadow stickiness commissions (no dollars here).
            Cell overrides change this board only — they do not edit invoices,
            payments, MRR, or client status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            placeholder="Search client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md px-3 py-1.5 text-sm outline-none"
            style={{
              background: "rgba(15,23,42,0.65)",
              border: "1px solid rgba(51,65,85,0.8)",
              color: "#e2e8f0",
              minWidth: 160,
            }}
          />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md px-2 py-1.5 text-sm"
            style={{
              background: "rgba(15,23,42,0.65)",
              border: "1px solid rgba(51,65,85,0.8)",
              color: "#e2e8f0",
            }}
          >
            <option value="streak">Sort: streak</option>
            <option value="name">Sort: name</option>
            <option value="risk">Sort: at risk</option>
          </select>
          <label
            className="flex items-center gap-2 text-sm px-2 py-1.5 rounded-md cursor-pointer"
            style={{ color: "#94a3b8" }}
          >
            <input
              type="checkbox"
              checked={includePaused}
              onChange={(e) => setIncludePaused(e.target.checked)}
            />
            Include billing-paused
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-md px-3 py-1.5 text-sm font-medium"
            style={{
              background: "rgba(245,158,11,0.12)",
              color: "#f59e0b",
              border: "1px solid rgba(245,158,11,0.25)",
            }}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {(
          ["paid", "short", "extension", "unpaid", "paused", "churned", "empty"] as MonthDisposition[]
        ).map((d) => {
          const meta = DISP_META[d];
          return (
            <span key={d} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{
                  background: meta.bg,
                  border: `1px solid ${meta.border}`,
                }}
              />
              <span style={{ color: "#94a3b8" }}>{meta.label}</span>
            </span>
          );
        })}
      </div>

      {error && (
        <div
          className="text-sm rounded-md px-3 py-2"
          style={{
            background: "rgba(239,68,68,0.12)",
            color: "#fca5a5",
            border: "1px solid rgba(239,68,68,0.25)",
          }}
        >
          {error}
        </div>
      )}

      {data && data.overrides_enabled === false && (
        <div
          className="text-sm rounded-md px-3 py-2"
          style={{
            background: "rgba(245,158,11,0.10)",
            color: "#fbbf24",
            border: "1px solid rgba(245,158,11,0.25)",
          }}
        >
          Derived from the billing ledger. Month overrides need the
          <code className="mx-1">client_month_disposition_overrides</code>
          migration applied in Supabase.
        </div>
      )}

      {loading && (
        <p className="text-sm" style={{ color: "#64748b" }}>
          Loading active clients…
        </p>
      )}

      {!loading && data && (
        <div
          className="rounded-lg overflow-hidden"
          style={{
            border: "1px solid rgba(51,65,85,0.7)",
            background:
              "linear-gradient(180deg, rgba(15,23,42,0.92) 0%, rgba(2,6,23,0.96) 100%)",
          }}
        >
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid rgba(51,65,85,0.75)",
                    background: "rgba(15,23,42,0.85)",
                  }}
                >
                  <th
                    className="sticky left-0 z-20 text-left px-3 py-2 font-medium"
                    style={{
                      minWidth: 220,
                      background: "rgba(15,23,42,0.98)",
                      color: "#94a3b8",
                      boxShadow: "4px 0 8px rgba(0,0,0,0.25)",
                    }}
                  >
                    Client · streak
                  </th>
                  {monthColumns.map((ym) => (
                    <th
                      key={ym}
                      className="px-0.5 py-2 text-center font-mono text-[10px] font-normal"
                      style={{ color: "#64748b", minWidth: 28 }}
                      title={fmtYmLong(ym)}
                    >
                      {shortYm(ym)}
                    </th>
                  ))}
                  <th
                    className="px-3 py-2 text-right font-medium"
                    style={{ color: "#94a3b8", minWidth: 88 }}
                  >
                    Totals
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={monthColumns.length + 2}
                      className="px-3 py-8 text-center"
                      style={{ color: "#64748b" }}
                    >
                      No active clients in this filter.
                    </td>
                  </tr>
                )}
                {rows.map((client, idx) => (
                  <tr
                    key={client.id}
                    className="streak-row"
                    style={{
                      animationDelay: `${Math.min(idx, 24) * 18}ms`,
                      borderBottom: "1px solid rgba(30,41,59,0.9)",
                    }}
                  >
                    <td
                      className="sticky left-0 z-10 px-3 py-2"
                      style={{
                        background: "rgba(15,23,42,0.98)",
                        boxShadow: "4px 0 8px rgba(0,0,0,0.2)",
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => onOpenClient?.(client.id)}
                          className="text-left font-medium truncate hover:underline"
                          style={{ color: "#f1f5f9", maxWidth: 140 }}
                          title={client.name}
                        >
                          {client.name}
                        </button>
                        <span
                          className="shrink-0 font-mono text-xs tabular-nums px-1.5 py-0.5 rounded"
                          style={{
                            background: client.summary.at_risk
                              ? "rgba(239,68,68,0.15)"
                              : "rgba(34,197,94,0.12)",
                            color: client.summary.at_risk ? "#fca5a5" : "#86efac",
                          }}
                          title="Current consecutive paid months"
                        >
                          {client.summary.current_streak}
                        </span>
                        {client.summary.milestone_m6 && (
                          <span
                            className="shrink-0 text-[10px] font-semibold px-1 rounded"
                            style={{
                              background: "rgba(168,85,247,0.2)",
                              color: "#d8b4fe",
                            }}
                          >
                            M6
                          </span>
                        )}
                        {!client.summary.milestone_m6 &&
                          client.summary.milestone_m3 && (
                            <span
                              className="shrink-0 text-[10px] font-semibold px-1 rounded"
                              style={{
                                background: "rgba(59,130,246,0.2)",
                                color: "#93c5fd",
                              }}
                            >
                              M3
                            </span>
                          )}
                        {client.billing_paused && (
                          <span
                            className="shrink-0 text-[10px] px-1 rounded"
                            style={{ color: "#94a3b8" }}
                          >
                            paused
                          </span>
                        )}
                      </div>
                    </td>
                    {monthColumns.map((ym) => {
                      const cell = cellAt(client, ym);
                      const d = cell?.disposition ?? "empty";
                      const meta = DISP_META[d];
                      return (
                        <td key={ym} className="px-0.5 py-1.5 text-center">
                          <button
                            type="button"
                            title={`${fmtYmLong(ym)}: ${meta.label}${
                              cell?.source === "override" ? " (override)" : ""
                            }`}
                            onClick={() => {
                              if (!cell) return;
                              setSelected({ client, cell });
                            }}
                            className="inline-block w-[22px] h-[22px] rounded-sm transition-transform duration-150 hover:scale-110 focus:outline-none focus:ring-1 focus:ring-amber-500/50"
                            style={{
                              background: meta.bg,
                              border: `1px solid ${meta.border}`,
                              boxShadow:
                                cell?.source === "override"
                                  ? "inset 0 0 0 1px rgba(245,158,11,0.7)"
                                  : undefined,
                            }}
                            aria-label={`${client.name} ${ym} ${meta.label}`}
                          />
                        </td>
                      );
                    })}
                    <td
                      className="px-3 py-2 text-right font-mono text-[11px] tabular-nums"
                      style={{ color: "#64748b" }}
                    >
                      {client.summary.total_paid}P ·{" "}
                      {client.summary.total_misses}M ·{" "}
                      {client.summary.total_extensions}E
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div
            className="px-3 py-2 text-xs flex flex-wrap gap-4"
            style={{
              borderTop: "1px solid rgba(51,65,85,0.6)",
              color: "#64748b",
            }}
          >
            <span>{rows.length} clients</span>
            <span>Totals: P = paid · M = misses (unpaid+short) · E = extensions</span>
            <span>Ring on cell = board overlay only (ledger unchanged)</span>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: "rgba(2,6,23,0.55)" }}
          onClick={() => setSelected(null)}
        >
          <aside
            className="h-full w-full max-w-md shadow-2xl overflow-y-auto p-5 space-y-4"
            style={{
              background:
                "linear-gradient(165deg, #0f172a 0%, #020617 100%)",
              borderLeft: "1px solid rgba(51,65,85,0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wider" style={{ color: "#64748b" }}>
                  Board overlay
                </p>
                <h3 className="text-lg font-semibold mt-0.5" style={{ color: "#f8fafc" }}>
                  {selected.client.name}
                </h3>
                <p className="text-sm" style={{ color: "#94a3b8" }}>
                  {fmtYmLong(selected.cell.year_month)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-sm px-2 py-1 rounded"
                style={{ color: "#94a3b8" }}
              >
                Close
              </button>
            </div>

            <div
              className="rounded-md p-3 space-y-1.5 text-sm"
              style={{
                background: "rgba(15,23,42,0.8)",
                border: "1px solid rgba(51,65,85,0.7)",
              }}
            >
              <div className="flex justify-between">
                <span style={{ color: "#64748b" }}>Board shows</span>
                <span style={{ color: DISP_META[selected.cell.disposition].text }}>
                  {DISP_META[selected.cell.disposition].label}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "#64748b" }}>Billing ledger</span>
                <span style={{ color: DISP_META[selected.cell.ledger_disposition ?? selected.cell.disposition].text }}>
                  {DISP_META[selected.cell.ledger_disposition ?? selected.cell.disposition].label}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "#64748b" }}>Source</span>
                <span style={{ color: "#e2e8f0" }}>
                  {selected.cell.source === "override" ? "Board overlay" : "Ledger"}
                </span>
              </div>
              {data?.can_view_revenue && (
                <>
                  <div className="flex justify-between">
                    <span style={{ color: "#64748b" }}>Amount</span>
                    <span className="font-mono">{money(selected.cell.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span style={{ color: "#64748b" }}>Collected</span>
                    <span className="font-mono">{money(selected.cell.amount_paid)}</span>
                  </div>
                </>
              )}
              {selected.cell.billing_id && (
                <div className="flex justify-between gap-2">
                  <span style={{ color: "#64748b" }}>Billing</span>
                  <span className="font-mono text-xs truncate" style={{ color: "#94a3b8" }}>
                    {selected.cell.billing_id}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: "#64748b" }}>Streak now</span>
                <span className="font-mono">
                  {selected.client.summary.current_streak} mo
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed" style={{ color: "#64748b" }}>
              Saving an overlay updates stickiness streak only. Queue, paid
              history, invoice amounts, and client lifecycle stay untouched.
            </p>

            <div className="space-y-2">
              <label className="block text-xs" style={{ color: "#94a3b8" }}>
                Board overlay (not billing)
              </label>
              <select
                value={overrideDisp}
                onChange={(e) =>
                  setOverrideDisp(e.target.value as OverrideDisposition)
                }
                className="w-full rounded-md px-3 py-2 text-sm"
                style={{
                  background: "rgba(15,23,42,0.9)",
                  border: "1px solid rgba(51,65,85,0.85)",
                  color: "#e2e8f0",
                }}
              >
                {OVERRIDE_DISPOSITIONS.map((d) => (
                  <option key={d} value={d}>
                    {DISP_META[d].label}
                  </option>
                ))}
              </select>
              <label className="block text-xs mt-2" style={{ color: "#94a3b8" }}>
                Note (optional)
              </label>
              <textarea
                value={overrideNote}
                onChange={(e) => setOverrideNote(e.target.value)}
                rows={3}
                placeholder="Founder exception / history gap…"
                className="w-full rounded-md px-3 py-2 text-sm resize-y"
                style={{
                  background: "rgba(15,23,42,0.9)",
                  border: "1px solid rgba(51,65,85,0.85)",
                  color: "#e2e8f0",
                }}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving || data?.overrides_enabled === false}
                onClick={() => void saveOverride()}
                className="rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
                style={{
                  background: "rgba(245,158,11,0.18)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245,158,11,0.35)",
                }}
              >
                {saving ? "Saving…" : "Save override"}
              </button>
              {selected.cell.source === "override" && (
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void clearOverride()}
                  className="rounded-md px-4 py-2 text-sm disabled:opacity-50"
                  style={{
                    background: "transparent",
                    color: "#fca5a5",
                    border: "1px solid rgba(239,68,68,0.35)",
                  }}
                >
                  Clear override
                </button>
              )}
              {onOpenClient && (
                <button
                  type="button"
                  onClick={() => onOpenClient(selected.client.id)}
                  className="rounded-md px-4 py-2 text-sm"
                  style={{
                    background: "transparent",
                    color: "#94a3b8",
                    border: "1px solid rgba(71,85,105,0.6)",
                  }}
                >
                  Open client file
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
