"use client";

import { useEffect, useMemo, useState } from "react";
import ReportingTypeBadge from "@/components/ReportingTypeBadge";
import { lifecycleStatusLabel } from "@/lib/client-feedback";
import { normalizeReportingType, type ReportingType } from "@/lib/kpi-layouts";
import { REPORTING_TYPE_META, REPORTING_TYPES } from "@/lib/reporting-types";
import type { StateLookerClient, StateLookerResult } from "@/lib/state-looker";
import { US_STATES } from "@/lib/us-states";

type LifecycleFilter = "active" | "all";

function passesFilters(
  client: StateLookerClient,
  lifecycleFilter: LifecycleFilter,
  offerFilter: ReportingType | "all",
  liveOnly: boolean,
): boolean {
  if (lifecycleFilter === "active" && client.lifecycle_status !== "active") return false;
  if (offerFilter !== "all" && normalizeReportingType(client.reporting_type) !== offerFilter) return false;
  if (liveOnly && !client.is_live) return false;
  return true;
}

function StatesCell({ codes, highlight }: { codes: string[]; highlight?: string }) {
  if (!codes.length) {
    return <span style={{ color: "#475569" }}>—</span>;
  }

  return (
    <span className="text-xs" style={{ color: "#94a3b8" }}>
      {codes.map((code, i) => (
        <span key={code}>
          {i > 0 && ", "}
          <span
            style={{
              color: code === highlight ? "#f59e0b" : "#94a3b8",
              fontWeight: code === highlight ? 600 : 400,
            }}
          >
            {code}
          </span>
        </span>
      ))}
    </span>
  );
}

function ClientTable({
  clients,
  selectedState,
  emptyMessage,
}: {
  clients: StateLookerClient[];
  selectedState?: string;
  emptyMessage: string;
}) {
  if (!clients.length) {
    return (
      <div
        className="rounded-xl px-6 py-12 text-center text-sm"
        style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {["Client", "Account / LO", "Offer", "Licensed states", "Status"].map((label, i) => (
                <th
                  key={label}
                  className={`px-4 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap ${
                    i === 0 ? "text-left" : "text-left"
                  }`}
                  style={{ color: "#475569", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clients.map((client, idx) => (
              <tr
                key={client.id}
                style={{
                  borderBottom: idx < clients.length - 1 ? "1px solid rgba(255,255,255,0.04)" : undefined,
                }}
              >
                <td className="px-4 py-3 font-medium" style={{ color: "#e2e8f0" }}>
                  {client.name}
                </td>
                <td className="px-4 py-3" style={{ color: client.account_display_name ? "#cbd5e1" : "#334155" }}>
                  {client.account_display_name ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <ReportingTypeBadge value={client.reporting_type} />
                </td>
                <td className="px-4 py-3">
                  <StatesCell codes={client.states_licensed} highlight={selectedState} />
                </td>
                <td className="px-4 py-3 capitalize" style={{ color: "#94a3b8" }}>
                  {lifecycleStatusLabel(client.lifecycle_status)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function StateLooker() {
  const [data, setData] = useState<StateLookerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [stateQuery, setStateQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("active");
  const [offerFilter, setOfferFilter] = useState<ReportingType | "all">("all");
  const [liveOnly, setLiveOnly] = useState(false);
  const [browseAllOpen, setBrowseAllOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch("/api/state-looker")
      .then(async res => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Request failed (${res.status})`);
        }
        return res.json() as Promise<StateLookerResult>;
      })
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch(err => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load state data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const clientById = useMemo(() => {
    const map = new Map<string, StateLookerClient>();
    for (const client of data?.clients ?? []) map.set(client.id, client);
    return map;
  }, [data]);

  const filteredClients = useMemo(() => {
    return (data?.clients ?? []).filter(c =>
      passesFilters(c, lifecycleFilter, offerFilter, liveOnly),
    );
  }, [data, lifecycleFilter, offerFilter, liveOnly]);

  const filteredIds = useMemo(() => new Set(filteredClients.map(c => c.id)), [filteredClients]);

  const stateRows = useMemo(() => {
    const q = stateQuery.trim().toLowerCase();
    return US_STATES.map(state => {
      const ids = (data?.by_state[state.code] ?? []).filter(id => filteredIds.has(id));
      return { ...state, count: ids.length, clientIds: ids };
    }).filter(state => {
      if (!q) return true;
      return state.name.toLowerCase().includes(q) || state.code.toLowerCase().includes(q);
    });
  }, [data, filteredIds, stateQuery]);

  const selectedStateMeta = selectedState
    ? US_STATES.find(s => s.code === selectedState)
    : undefined;

  const selectedClients = useMemo(() => {
    if (!selectedState) return [];
    const ids = data?.by_state[selectedState] ?? [];
    return ids
      .map(id => clientById.get(id))
      .filter((c): c is StateLookerClient => !!c && passesFilters(c, lifecycleFilter, offerFilter, liveOnly))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedState, data, clientById, lifecycleFilter, offerFilter, liveOnly]);

  const browseClients = useMemo(() => {
    return [...filteredClients].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredClients]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: "#64748b" }}>
        Loading state coverage…
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl px-6 py-8 text-sm text-center"
        style={{ border: "1px solid rgba(248,113,113,0.25)", color: "#f87171" }}
      >
        {error}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      <div
        className="rounded-xl px-4 py-3 flex flex-col gap-3"
        style={{ border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
            Lifecycle
          </span>
          {([
            { key: "active" as const, label: "Active only" },
            { key: "all" as const, label: "All clients" },
          ]).map(opt => {
            const active = lifecycleFilter === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setLifecycleFilter(opt.key)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors"
                style={{
                  color: active ? "#e2e8f0" : "#64748b",
                  background: active ? "rgba(255,255,255,0.07)" : "transparent",
                  border: `1px solid ${active ? "rgba(255,255,255,0.14)" : "transparent"}`,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
            Offer
          </span>
          <button
            onClick={() => setOfferFilter("all")}
            className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors"
            style={{
              color: offerFilter === "all" ? "#e2e8f0" : "#64748b",
              background: offerFilter === "all" ? "rgba(255,255,255,0.07)" : "transparent",
              border: `1px solid ${offerFilter === "all" ? "rgba(255,255,255,0.14)" : "transparent"}`,
            }}
          >
            All verticals
          </button>
          {REPORTING_TYPES.map(type => {
            const active = offerFilter === type;
            const meta = REPORTING_TYPE_META[type];
            const count = filteredClients.filter(
              c => normalizeReportingType(c.reporting_type) === type,
            ).length;
            return (
              <button
                key={type}
                onClick={() => setOfferFilter(type)}
                className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors flex items-center gap-1.5"
                style={{
                  color: active ? meta.color : "#64748b",
                  background: active ? meta.background : "transparent",
                  border: `1px solid ${active ? `${meta.color}55` : "transparent"}`,
                }}
                title={meta.description}
              >
                {meta.shortLabel}
                <span style={{ color: active ? meta.color : "#475569" }}>{count}</span>
              </button>
            );
          })}
        </div>

        <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "#94a3b8" }}>
          <input
            type="checkbox"
            checked={liveOnly}
            onChange={e => setLiveOnly(e.target.checked)}
            className="rounded"
          />
          Live clients only
        </label>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        <div
          className="lg:w-72 shrink-0 flex flex-col rounded-xl overflow-hidden min-h-[280px] lg:min-h-0"
          style={{ border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="px-3 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <input
              type="search"
              value={stateQuery}
              onChange={e => setStateQuery(e.target.value)}
              placeholder="Search states…"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                background: "#0f2040",
                border: "1px solid rgba(255,255,255,0.1)",
                color: "#e2e8f0",
              }}
            />
            <p className="mt-2 text-[11px]" style={{ color: "#64748b" }}>
              {data?.summary.states_covered ?? 0} states covered · {filteredClients.length} clients
            </p>
          </div>
          <div className="overflow-y-auto flex-1">
            {stateRows.map(state => {
              const active = selectedState === state.code;
              const dimmed = state.count === 0;
              return (
                <button
                  key={state.code}
                  type="button"
                  onClick={() => setSelectedState(state.code)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors"
                  style={{
                    background: active ? "rgba(245,158,11,0.1)" : "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    opacity: dimmed ? 0.45 : 1,
                  }}
                >
                  <span className="text-sm truncate" style={{ color: active ? "#f59e0b" : "#e2e8f0" }}>
                    <span className="font-semibold mr-2" style={{ color: active ? "#fbbf24" : "#64748b" }}>
                      {state.code}
                    </span>
                    {state.name}
                  </span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                    style={{
                      color: state.count > 0 ? "#34d399" : "#475569",
                      background: state.count > 0 ? "rgba(52,211,153,0.12)" : "rgba(255,255,255,0.04)",
                    }}
                  >
                    {state.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col gap-3 min-h-0 overflow-y-auto">
          {selectedState ? (
            <>
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "#e2e8f0" }}>
                  {selectedStateMeta?.name ?? selectedState}
                </h2>
                <p className="text-sm mt-0.5" style={{ color: "#64748b" }}>
                  {selectedClients.length} client{selectedClients.length === 1 ? "" : "s"} licensed in{" "}
                  {selectedStateMeta?.code ?? selectedState}
                </p>
              </div>
              <ClientTable
                clients={selectedClients}
                selectedState={selectedState}
                emptyMessage={`No clients licensed in ${selectedStateMeta?.name ?? selectedState} with the current filters.`}
              />
            </>
          ) : (
            <div
              className="rounded-xl px-6 py-12 text-center text-sm flex-1 flex items-center justify-center"
              style={{ border: "1px solid rgba(255,255,255,0.06)", color: "#64748b" }}
            >
              Select a state to see which clients are licensed there.
            </div>
          )}
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => setBrowseAllOpen(v => !v)}
          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: "#94a3b8" }}
        >
          <span style={{ transform: browseAllOpen ? "rotate(90deg)" : "none", display: "inline-block" }}>▶</span>
          Browse all clients
          <span style={{ color: "#475569" }}>({browseClients.length})</span>
        </button>
        {browseAllOpen && (
          <div className="mt-3">
            <ClientTable
              clients={browseClients}
              emptyMessage="No clients match the current filters."
            />
          </div>
        )}
      </div>
    </div>
  );
}
