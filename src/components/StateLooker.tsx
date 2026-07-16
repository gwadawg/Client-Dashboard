"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import ReportingTypeBadge from "@/components/ReportingTypeBadge";
import { lifecycleStatusLabel } from "@/lib/client-feedback";
import { normalizeReportingType, type ReportingType } from "@/lib/kpi-layouts";
import { REPORTING_TYPE_META, REPORTING_TYPES } from "@/lib/reporting-types";
import type { StateLookerClient, StateLookerResult } from "@/lib/state-looker";
import { US_STATES } from "@/lib/us-states";

type LifecycleFilter = "active" | "all";
type ViewMode = "by_state" | "directory";

function passesFilters(
  client: StateLookerClient,
  lifecycleFilter: LifecycleFilter,
  offerFilter: ReportingType | "all",
  liveOnly: boolean,
  liveTransferOnly: boolean,
  clientQuery: string,
): boolean {
  if (lifecycleFilter === "active" && client.lifecycle_status !== "active") return false;
  if (offerFilter !== "all" && normalizeReportingType(client.reporting_type) !== offerFilter) return false;
  if (liveOnly && !client.is_live) return false;
  if (liveTransferOnly && !client.live_transfer_approved) return false;
  const q = clientQuery.trim().toLowerCase();
  if (q) {
    const haystack = [
      client.name,
      client.account_display_name,
      client.company_name,
      client.brokerage_name,
      client.city,
      client.state,
      client.offer_blurb,
      client.website,
      client.phone_live_transfer,
      ...client.states_licensed,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function formatLocation(client: StateLookerClient): string {
  if (client.city && client.state) return `${client.city}, ${client.state}`;
  return client.city || client.state || "—";
}

function websiteHref(url: string): string {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
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

function CompanyCell({ client }: { client: StateLookerClient }) {
  if (!client.company_name && !client.brokerage_name) {
    return <span style={{ color: "#334155" }}>—</span>;
  }

  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      {client.company_name && (
        <span className="font-medium truncate" style={{ color: "#e2e8f0" }} title={client.company_name}>
          {client.company_name}
        </span>
      )}
      {client.brokerage_name && (
        <span className="text-xs truncate" style={{ color: "#94a3b8" }} title={client.brokerage_name}>
          {client.company_name ? `Brokerage: ${client.brokerage_name}` : client.brokerage_name}
        </span>
      )}
    </div>
  );
}

function ClientDirectoryTable({
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

  const headers = [
    "Client",
    "Company",
    "Live transfers",
    "Offer",
    "Website",
    "Location",
    "LT phone",
    "Licensed states",
    "Status",
  ];

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "rgba(255,255,255,0.02)" }}>
              {headers.map(label => (
                <th
                  key={label}
                  className="px-3 py-3 text-xs font-semibold uppercase tracking-wider whitespace-nowrap text-left"
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
                <td className="px-3 py-3 align-top">
                  <div className="flex flex-col gap-1 min-w-[140px]">
                    <span className="font-medium" style={{ color: "#e2e8f0" }}>
                      {client.name}
                    </span>
                    {client.account_display_name &&
                      client.account_display_name !== client.company_name && (
                        <span className="text-xs" style={{ color: "#64748b" }}>
                          {client.account_display_name}
                        </span>
                      )}
                    <ReportingTypeBadge value={client.reporting_type} />
                  </div>
                </td>
                <td className="px-3 py-3 align-top min-w-[140px]">
                  <CompanyCell client={client} />
                </td>
                <td className="px-3 py-3 align-top whitespace-nowrap">
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      color: client.live_transfer_approved ? "#34d399" : "#94a3b8",
                      background: client.live_transfer_approved
                        ? "rgba(52,211,153,0.12)"
                        : "rgba(255,255,255,0.04)",
                    }}
                  >
                    {client.live_transfer_approved ? "Yes" : "No"}
                  </span>
                </td>
                <td className="px-3 py-3 align-top max-w-[220px]">
                  <span className="text-xs leading-snug" style={{ color: "#cbd5e1" }} title={client.offer_blurb}>
                    {client.offer_blurb}
                  </span>
                </td>
                <td className="px-3 py-3 align-top whitespace-nowrap">
                  {client.website ? (
                    <a
                      href={websiteHref(client.website)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs underline-offset-2 hover:underline"
                      style={{ color: "#38bdf8" }}
                    >
                      {client.website.replace(/^https?:\/\//i, "")}
                    </a>
                  ) : (
                    <span style={{ color: "#334155" }}>—</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top whitespace-nowrap" style={{ color: "#94a3b8" }}>
                  {formatLocation(client)}
                </td>
                <td className="px-3 py-3 align-top whitespace-nowrap" style={{ color: "#e2e8f0" }}>
                  {client.live_transfer_approved && client.phone_live_transfer ? (
                    <a href={`tel:${client.phone_live_transfer}`} style={{ color: "#e2e8f0" }}>
                      {client.phone_live_transfer}
                    </a>
                  ) : client.phone_live_transfer ? (
                    <span style={{ color: "#64748b" }} title="Live transfers not approved">
                      {client.phone_live_transfer}
                    </span>
                  ) : (
                    <span style={{ color: "#334155" }}>—</span>
                  )}
                </td>
                <td className="px-3 py-3 align-top max-w-[180px]">
                  <StatesCell codes={client.states_licensed} highlight={selectedState} />
                </td>
                <td className="px-3 py-3 align-top capitalize whitespace-nowrap" style={{ color: "#94a3b8" }}>
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

function FilterChip({
  active,
  onClick,
  children,
  activeColor,
  activeBackground,
  activeBorder,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  activeColor?: string;
  activeBackground?: string;
  activeBorder?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap transition-colors"
      style={{
        color: active ? (activeColor ?? "#e2e8f0") : "#64748b",
        background: active ? (activeBackground ?? "rgba(255,255,255,0.07)") : "transparent",
        border: `1px solid ${active ? (activeBorder ?? "rgba(255,255,255,0.14)") : "transparent"}`,
      }}
    >
      {children}
    </button>
  );
}

export default function StateLooker() {
  const [data, setData] = useState<StateLookerResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("by_state");
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [stateQuery, setStateQuery] = useState("");
  const [clientQuery, setClientQuery] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>("active");
  const [offerFilter, setOfferFilter] = useState<ReportingType | "all">("all");
  const [liveOnly, setLiveOnly] = useState(false);
  const [liveTransferOnly, setLiveTransferOnly] = useState(false);

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
      passesFilters(c, lifecycleFilter, offerFilter, liveOnly, liveTransferOnly, clientQuery),
    );
  }, [data, lifecycleFilter, offerFilter, liveOnly, liveTransferOnly, clientQuery]);

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
      .filter((c): c is StateLookerClient =>
        !!c && passesFilters(c, lifecycleFilter, offerFilter, liveOnly, liveTransferOnly, clientQuery),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedState, data, clientById, lifecycleFilter, offerFilter, liveOnly, liveTransferOnly, clientQuery]);

  const directoryClients = useMemo(() => {
    return [...filteredClients].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredClients]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-sm" style={{ color: "#64748b" }}>
        Loading client directory…
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-base font-semibold" style={{ color: "#e2e8f0" }}>
              Client directory
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "#64748b" }}>
              Team-safe lookup — company, offer, website, location, and live-transfer details. No billing or
              confidential CRM fields.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <FilterChip
              active={viewMode === "by_state"}
              onClick={() => setViewMode("by_state")}
              activeColor="#fbbf24"
              activeBackground="rgba(245,158,11,0.12)"
              activeBorder="rgba(245,158,11,0.35)"
            >
              By state
            </FilterChip>
            <FilterChip active={viewMode === "directory"} onClick={() => setViewMode("directory")}>
              All clients
            </FilterChip>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={clientQuery}
            onChange={e => setClientQuery(e.target.value)}
            placeholder="Search clients, company, city, phone…"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg text-sm outline-none"
            style={{
              background: "#0f2040",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "#e2e8f0",
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
            Lifecycle
          </span>
          <FilterChip active={lifecycleFilter === "active"} onClick={() => setLifecycleFilter("active")}>
            Active only
          </FilterChip>
          <FilterChip active={lifecycleFilter === "all"} onClick={() => setLifecycleFilter("all")}>
            All clients
          </FilterChip>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#64748b" }}>
            Offer
          </span>
          <FilterChip active={offerFilter === "all"} onClick={() => setOfferFilter("all")}>
            All verticals
          </FilterChip>
          {REPORTING_TYPES.map(type => {
            const active = offerFilter === type;
            const meta = REPORTING_TYPE_META[type];
            const count = filteredClients.filter(
              c => normalizeReportingType(c.reporting_type) === type,
            ).length;
            return (
              <button
                key={type}
                type="button"
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

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "#94a3b8" }}>
            <input
              type="checkbox"
              checked={liveOnly}
              onChange={e => setLiveOnly(e.target.checked)}
              className="rounded"
            />
            Live clients only
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer select-none" style={{ color: "#94a3b8" }}>
            <input
              type="checkbox"
              checked={liveTransferOnly}
              onChange={e => setLiveTransferOnly(e.target.checked)}
              className="rounded"
            />
            Accepts live transfers
          </label>
        </div>
      </div>

      {viewMode === "by_state" ? (
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
                <ClientDirectoryTable
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
                Select a state to see which clients are licensed there — including company, offer, website, and
                live-transfer details.
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3 flex-1 min-h-0 overflow-y-auto">
          <p className="text-sm" style={{ color: "#64748b" }}>
            {directoryClients.length} client{directoryClients.length === 1 ? "" : "s"}
          </p>
          <ClientDirectoryTable
            clients={directoryClients}
            emptyMessage="No clients match the current filters."
          />
        </div>
      )}
    </div>
  );
}
