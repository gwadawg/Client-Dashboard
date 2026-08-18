"use client";

import ClientSelect from "../ClientSelect";
import DateRangeFilter from "../DateRangeFilter";
import { REPORTING_TYPES } from "@/lib/reporting-types";
import { describeClientTenure } from "@/lib/client-tenure";
import type { DashboardClient, DashboardFilters } from "@/lib/use-dashboard-filters";

type Props = {
  filters: DashboardFilters;
  clients: DashboardClient[];
  /** Compare only makes sense against an equal-length previous window. */
  showCompare: boolean;
  railOpen: boolean;
  onToggleRail: () => void;
  onLogWork?: () => void;
};

/**
 * The workspace's one scope control. Sticky so the client and date range stay
 * visible while you scroll a long KPI page, and shared by every sub-tab so
 * moving between KPIs, dials and raw rows never means re-picking a client.
 */
export default function WorkspaceFilterBar({
  filters,
  clients,
  showCompare,
  railOpen,
  onToggleRail,
  onLogWork,
}: Props) {
  const { selectedClient } = filters;
  const tenure = selectedClient ? describeClientTenure(selectedClient, filters.todayYmd) : null;

  const scopeLabel = selectedClient
    ? selectedClient.name
    : filters.liveOnly
      ? "Live clients"
      : "All clients";

  return (
    <div
      className="sticky top-0 z-30 -mx-6 md:-mx-8 px-6 md:px-8 py-3 backdrop-blur-md"
      style={{
        background: "color-mix(in oklab, var(--color-ws-base) 82%, transparent)",
        borderBottom: "1px solid var(--color-ws-hairline)",
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <ClientSelect value={filters.clientId} onChange={filters.setClientId} clients={clients} />

        {/* Vertical scope only disambiguates aggregates — a single client has one offer. */}
        {!filters.clientId && (
          <select
            value={filters.offerScope}
            onChange={e => filters.setOfferScope(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm font-medium"
            style={{
              background: "var(--color-ws-input)",
              color: "var(--color-ws-text-muted)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            title="Filter metrics by product vertical"
          >
            <option value="">All offers</option>
            {REPORTING_TYPES.map(rt => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
          </select>
        )}

        {showCompare && (
          <button
            type="button"
            onClick={filters.toggleCompare}
            className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            style={
              filters.compare
                ? {
                    background: "var(--color-ws-accent-wash)",
                    color: "var(--color-ws-accent)",
                    border: "1px solid rgba(245,158,11,0.4)",
                  }
                : {
                    background: "var(--color-ws-input)",
                    color: "var(--color-ws-text-muted)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }
            }
            title="Show change vs. the previous equal-length period"
          >
            {filters.compare ? "✓ Compare" : "Compare"}
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          {onLogWork && (
            <button
              type="button"
              onClick={onLogWork}
              className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: "rgba(52,211,153,0.12)",
                color: "#34d399",
                border: "1px solid rgba(52,211,153,0.35)",
              }}
            >
              Log work
            </button>
          )}
          <DateRangeFilter
            preset={filters.preset}
            customStart={filters.customStart}
            customEnd={filters.customEnd}
            onPresetChange={filters.setPreset}
            onCustomStartChange={filters.setCustomStart}
            onCustomEndChange={filters.setCustomEnd}
            includeSinceLaunch={filters.sinceLaunchAvailable}
          />

          <button
            type="button"
            onClick={onToggleRail}
            aria-pressed={railOpen}
            className="hidden lg:inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ease-ws"
            style={
              railOpen
                ? {
                    background: "var(--color-ws-accent-wash)",
                    color: "var(--color-ws-accent)",
                    border: "1px solid rgba(245,158,11,0.4)",
                  }
                : {
                    background: "var(--color-ws-input)",
                    color: "var(--color-ws-text-muted)",
                    border: "1px solid rgba(255,255,255,0.12)",
                  }
            }
            title={railOpen ? "Hide account history" : "Show account history"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            History
          </button>
        </div>
      </div>

      {/* Restates the scope as a sentence — the controls above show labels, not
          the concrete window the numbers actually cover. */}
      <p className="mt-1.5 text-[11px] font-data" style={{ color: "var(--color-ws-text-faint)" }}>
        <span style={{ color: "var(--color-ws-text-dim)" }}>{scopeLabel}</span>
        {" · "}
        {filters.dateRangeLabel}
        {filters.dateStart && filters.dateEnd ? ` · ${filters.dateStart} → ${filters.dateEnd}` : null}
        {tenure?.engagementMonth ? ` · engagement month ${tenure.engagementMonth}` : null}
      </p>
    </div>
  );
}
