"use client";

import Image from "next/image";
import { Suspense, useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ClientSelect from "./ClientSelect";
import AgentAdmin from "./AgentAdmin";
import OfferCatalogManager from "./OfferCatalogManager";
import ClientCallsBrowser from "./ClientCallsBrowser";
import SetterSchedule from "./SetterSchedule";
import HeatMapsHub from "./hubs/HeatMapsHub";
import DataExplorerHub from "./hubs/DataExplorerHub";
import AcquisitionHub from "./hubs/AcquisitionHub";
import AcquisitionKpiHub from "./hubs/AcquisitionKpiHub";
import AcquisitionDataExplorerHub from "./hubs/AcquisitionDataExplorerHub";
import AgentsHub from "./hubs/AgentsHub";
import ClientRoster from "./ClientRoster";
import BillingManager from "./BillingManager";
import AgentPayrollReport from "./AgentPayrollReport";
import UserManager from "./UserManager";
import AgentCreditQueue from "./AgentCreditQueue";
import CostTrendCharts from "./CostTrendCharts";
import RateTrendCharts from "./RateTrendCharts";
import ShowQualityBar from "./ShowQualityBar";
import ConversionFunnel from "./ConversionFunnel";
import ClientConversionsView from "./ClientConversionsView";
import FunnelSimulatorView from "./FunnelSimulatorView";
import ClientHealthDashboard from "./ClientHealthDashboard";
import StateLooker from "./StateLooker";
import DialAnalytics from "./DialAnalytics";
import MediaBuyer from "./MediaBuyer";
import AcquisitionMarketing from "./AcquisitionMarketing";
import CeoDashboard from "./CeoDashboard";
import AcquisitionSalesReps from "./AcquisitionSalesReps";
import ResourcesLibrary from "./ResourcesLibrary";
import CallLibrary from "./CallLibrary";
import AutomationsManager from "./AutomationsManager";
import KpiSections, { type SparkMap } from "./kpi/KpiSections";
import KpiSection from "./kpi/KpiSection";
import KpiCard from "./kpi/KpiCard";
import type { KpiTimelineBucket, MetricsResult } from "@/lib/metrics";
import {
  DEFAULT_REPORTING_TYPE,
  formatKpiValue,
  normalizeReportingType,
  type ReportingType,
} from "@/lib/kpi-layouts";
import { REPORTING_TYPES } from "@/lib/reporting-types";
import {
  NAV,
  NAV_GROUPS,
  LEGACY_VIEW_REDIRECTS,
  defaultTabForHub,
  isHubView,
  tabLabelForHub,
  type View,
  type HubView,
  type HeatmapTab,
  type DataExplorerTab,
  type AcquisitionTab,
  type AcquisitionDataExplorerTab,
  type AcquisitionKpiTab,
  type AgentsTab,
  resolveViewFromParams,
} from "@/lib/nav";
import { hasPermission, canViewClientRevenue, canAccessAutomations, type AllowedPermissions } from "@/lib/permissions";
import DateRangeFilter from "./DateRangeFilter";
import { type DatePreset, getDateRange } from "@/lib/date-presets";

type Client = { id: string; name: string; is_live?: boolean; reporting_type?: ReportingType };

const LEGACY_VIEW_KEYS = new Set(Object.keys(LEGACY_VIEW_REDIRECTS));

function parseUrlView(searchParams: URLSearchParams): { view: View; tab: string | null } {
  const viewParam = searchParams.get("view");
  const tabParam = searchParams.get("tab");

  if (viewParam && LEGACY_VIEW_KEYS.has(viewParam)) {
    return resolveViewFromParams(viewParam, tabParam);
  }

  return resolveViewFromParams(viewParam, tabParam);
}

const NAV_ICONS: Record<View, string> = {
  dashboard:     "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  kpi_simulator: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
  ceo:           "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  ceo_raw:       "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  dial_analytics:   "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  media_buyer:      "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
  client_health:    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  heatmaps:      "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  data_explorer: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  state_looker:  "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
  acquisition_kpis: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  acquisition_marketing: "M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z",
  acquisition:   "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6",
  acquisition_data_explorer: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  agents:        "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  resources:        "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  call_library:     "M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z",
  admin_agents:     "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
  admin_clients:    "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  admin_billing:    "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  admin_agent_payroll: "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z",
  admin_share:      "M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z",
  admin_automations: "M13 10V3L4 14h7v7l9-11h-7z",
  admin_users:      "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  admin_offers:     "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
  schedule:         "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  client_calls:     "M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z",
  acquisition_sales_reps:"M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z",
};

const DEFAULT_COLLAPSED_GROUPS = new Set<string>(["Admin"]);

function ymd(d: Date): string {
  return d.toISOString().split("T")[0];
}

/** Map the KPI timeline buckets onto the metric keys their cards use, for sparklines. */
function buildSparkMap(series: KpiTimelineBucket[]): SparkMap {
  if (!series.length) return {};
  return {
    new_leads: series.map(b => b.leads),
    qualified_leads: series.map(b => b.qualified_leads),
    qualified_rate: series.map(b => b.lead_to_qual),
    booked_appointments: series.map(b => b.booked),
    shows: series.map(b => b.shows),
    no_shows: series.map(b => b.no_shows),
    show_pct: series.map(b => b.show_rate),
    net_show_pct: series.map(b => b.net_show_rate),
    appt_booking_rate: series.map(b => b.booking_rate),
    hand_raise_rate: series.map(b => b.hand_raise_rate),
    lead_booking_rate: series.map(b => b.lead_booking_rate),
    conversation_rate: series.map(b => b.conversation_rate),
    ad_spend: series.map(b => b.spend),
    cpl: series.map(b => b.cpl),
    cp_qualified: series.map(b => b.cpql),
    cp_conversation: series.map(b => b.cpconv),
  };
}

/** Equal-length window immediately before [start, end]. Returns null for unbounded ranges. */
function previousRange(start: string, end: string): { start: string; end: string } | null {
  if (!start || !end) return null;
  const startMs = new Date(`${start}T00:00:00.000Z`).getTime();
  const endMs = new Date(`${end}T00:00:00.000Z`).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) return null;
  const lengthDays = Math.floor((endMs - startMs) / 86400000) + 1;
  const prevEnd = new Date(startMs - 86400000);
  const prevStart = new Date(prevEnd.getTime() - (lengthDays - 1) * 86400000);
  return { start: ymd(prevStart), end: ymd(prevEnd) };
}

function Select({ value, onChange, children, className = "" }: {
  value: string | number;
  onChange: (v: string) => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`px-4 py-2 rounded-lg text-sm font-medium outline-none cursor-pointer transition-colors ${className}`}
      style={{ background: "#0f2040", border: "1px solid rgba(255,255,255,0.12)", color: "#e2e8f0" }}
    >
      {children}
    </select>
  );
}

function getDashboardScopeClients(clients: Client[], selectedClientId: string): Client[] {
  if (selectedClientId === "__live__") return clients.filter(c => c.is_live !== false);
  if (selectedClientId) return clients.filter(c => c.id === selectedClientId);
  return clients;
}

function resolveDashboardReportingType(clients: Client[], selectedClientId: string): ReportingType {
  const scopedClients = getDashboardScopeClients(clients, selectedClientId);
  const reportingTypes = new Set(scopedClients.map(c => normalizeReportingType(c.reporting_type)));
  return reportingTypes.size === 1 ? Array.from(reportingTypes)[0] : DEFAULT_REPORTING_TYPE;
}

type ClientWithToken = Client & { share_token?: string };

function ShareReports({ clients }: { clients: Client[] }) {
  const [enriched, setEnriched] = useState<ClientWithToken[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/clients")
      .then(r => r.json())
      .then(d => setEnriched(d.clients ?? []));
  }, []);

  function getUrl(token: string) {
    return `${window.location.origin}/report/${token}`;
  }

  function handleCopy(token: string) {
    navigator.clipboard.writeText(getUrl(token));
    setCopied(token);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-semibold" style={{ color: "#e2e8f0" }}>Share Reports</h2>
        <p className="text-sm mt-0.5" style={{ color: "#475569" }}>
          Each client has a unique read-only report link — no login required
        </p>
      </div>
      <div className="space-y-3">
        {(enriched.length ? enriched : clients).map((c: ClientWithToken) => (
          <div key={c.id} className="rounded-xl px-5 py-4 flex items-center justify-between gap-4"
            style={{ background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "#e2e8f0" }}>{c.name}</p>
              {c.share_token && (
                <p className="text-xs mt-0.5 font-mono truncate max-w-xs" style={{ color: "#334155" }}>
                  {getUrl(c.share_token)}
                </p>
              )}
            </div>
            {c.share_token && (
              <button onClick={() => handleCopy(c.share_token!)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold flex-shrink-0 transition-colors"
                style={copied === c.share_token
                  ? { background: "rgba(52,211,153,0.15)", color: "#34d399" }
                  : { background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>
                {copied === c.share_token ? "✓ Copied!" : "Copy Link"}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type DashboardViewProps = {
  isOwner?: boolean;
  isAdmin?: boolean;
  allowedPermissions?: AllowedPermissions;
};

export default function DashboardView({ isOwner = false, isAdmin = false, allowedPermissions = null }: DashboardViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const canSee = (v: View) => {
    if (v === "client_calls") {
      return (
        hasPermission("client_calls", { isOwner, allowedPermissions })
        || hasPermission("admin_clients", { isOwner, allowedPermissions })
        || hasPermission("admin_billing", { isOwner, allowedPermissions })
      );
    }
    if (v === "admin_automations") {
      return canAccessAutomations({ isOwner, allowedPermissions });
    }
    return hasPermission(v, { isOwner, allowedPermissions });
  };
  const canViewRevenue = canViewClientRevenue({ isOwner, allowedPermissions });
  const visibleNav = NAV.filter(item => canSee(item.view));
  const firstVisibleView: View | undefined = visibleNav[0]?.view;

  const resolveAllowedView = (requested: View): View => {
    if (canSee(requested)) return requested;
    return firstVisibleView ?? requested;
  };

  const [view, setView] = useState<View>(() => {
    const parsed = parseUrlView(searchParams);
    return resolveAllowedView(parsed.view);
  });
  const [hubTab, setHubTab] = useState<string | null>(() => parseUrlView(searchParams).tab);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [offerScope, setOfferScope] = useState("");
  const [preset, setPreset] = useState<DatePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [metrics, setMetrics] = useState<MetricsResult | null>(null);
  const [prevMetrics, setPrevMetrics] = useState<MetricsResult | null>(null);
  const [compare, setCompare] = useState(false);
  const [sparkMap, setSparkMap] = useState<SparkMap | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [overduePending, setOverduePending] = useState<number | null>(null);
  const [heatmapDays, setHeatmapDays] = useState(0);
  const [heatmapClientId, setHeatmapClientId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(DEFAULT_COLLAPSED_GROUPS));
  const [dashboardSubView, setDashboardSubView] = useState<"main" | "conversions">("main");
  const [renderDate] = useState(() => new Date());

  const goToView = (next: View, tab?: string | null) => {
    const target = resolveAllowedView(next);
    setView(target);
    setSidebarOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (target === "dashboard") {
      params.delete("view");
      params.delete("tab");
      setHubTab(null);
    } else {
      params.set("view", target);
      if (isHubView(target)) {
        const nextTab = tab ?? hubTab ?? defaultTabForHub(target);
        setHubTab(nextTab);
        params.set("tab", nextTab);
      } else {
        setHubTab(null);
        params.delete("tab");
      }
    }
    params.delete("appointment_id");
    params.delete("call_id");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const setHubTabAndUrl = (tab: string) => {
    setHubTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    // Tab-bar navigation is not a deep link — drop stale highlight targets so
    // revisiting Appointments / Sales Calls does not re-scroll to an old row.
    params.delete("appointment_id");
    params.delete("call_id");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  useEffect(() => {
    const viewParam = searchParams.get("view");
    if (viewParam && LEGACY_VIEW_KEYS.has(viewParam)) {
      const redirect = LEGACY_VIEW_REDIRECTS[viewParam as keyof typeof LEGACY_VIEW_REDIRECTS];
      const params = new URLSearchParams(searchParams.toString());
      params.set("view", redirect.view);
      params.set("tab", redirect.tab);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
      return;
    }
    const parsed = parseUrlView(searchParams);
    const fromUrl = resolveAllowedView(parsed.view);
    setView(current => (current === fromUrl ? current : fromUrl));
    setHubTab(parsed.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/clients").then(r => r.json()).then(d => setClients(d.clients ?? []));
  }, []);

  useEffect(() => {
    if (view !== "dashboard") {
      setDashboardSubView("main");
      return;
    }
    const sub = searchParams.get("sub");
    if (sub === "conversions") {
      setDashboardSubView("conversions");
      const params = new URLSearchParams(searchParams.toString());
      params.delete("sub");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [view, searchParams, pathname, router]);

  useEffect(() => {
    setDashboardSubView("main");
  }, [selectedClientId, offerScope, preset, customStart, customEnd]);

  const appendDashboardMetricsParams = (params: URLSearchParams) => {
    if (selectedClientId === "__live__") params.set("live_only", "true");
    else if (selectedClientId) params.set("client_id", selectedClientId);
    else if (offerScope) params.set("reporting_type", offerScope);
  };

  useEffect(() => {
    if (view !== "dashboard" && view !== "kpi_simulator") return;
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getDateRange(preset);
    queueMicrotask(() => setMetricsLoading(true));
    const params = new URLSearchParams();
    appendDashboardMetricsParams(params);
    if (start) params.set("start_date", start);
    if (end) params.set("end_date", end);
    fetch(`/api/metrics?${params}`)
      .then(r => r.json())
      .then(d => { setMetrics(d); setMetricsLoading(false); })
      .catch(() => setMetricsLoading(false));
  }, [view, selectedClientId, offerScope, preset, customStart, customEnd]);

  // Previous-period comparison: fetch the equal-length window immediately before
  // the current range so each KPI card can show a vs-prev delta.
  useEffect(() => {
    if (view !== "dashboard" || !compare) { setPrevMetrics(null); return; }
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getDateRange(preset);
    const prev = previousRange(start, end);
    if (!prev) { setPrevMetrics(null); return; }
    const params = new URLSearchParams();
    appendDashboardMetricsParams(params);
    params.set("start_date", prev.start);
    params.set("end_date", prev.end);
    fetch(`/api/metrics?${params}`)
      .then(r => r.json())
      .then(d => setPrevMetrics(d))
      .catch(() => setPrevMetrics(null));
  }, [view, compare, selectedClientId, offerScope, preset, customStart, customEnd]);

  // Per-card sparklines: pull the daily/weekly KPI timeline and map each series
  // onto the metric key its card uses. Skipped for unbounded (all-time) ranges.
  useEffect(() => {
    if (view !== "dashboard") { setSparkMap(null); return; }
    const { start, end } = preset === "custom" ? { start: customStart, end: customEnd } : getDateRange(preset);
    if (!start || !end) { setSparkMap(null); return; }
    const params = new URLSearchParams({ start_date: start, end_date: end });
    appendDashboardMetricsParams(params);
    fetch(`/api/metrics/trends?${params}`)
      .then(r => r.json())
      .then(d => setSparkMap(buildSparkMap(d.kpiSeries ?? [])))
      .catch(() => setSparkMap(null));
  }, [view, selectedClientId, offerScope, preset, customStart, customEnd]);

  // Past-due, un-dispositioned appointment backlog. Deliberately keyed only on
  // the client selection (not the date preset) so it stays a running total.
  useEffect(() => {
    if (view !== "dashboard") return;
    const params = new URLSearchParams();
    if (selectedClientId === "__live__") params.set("live_only", "true");
    else if (selectedClientId) params.set("client_id", selectedClientId);
    setOverduePending(null);
    fetch(`/api/metrics/overdue-appointments?${params}`)
      .then(r => r.json())
      .then(d => setOverduePending(typeof d.count === "number" ? d.count : null))
      .catch(() => setOverduePending(null));
  }, [view, selectedClientId]);

  async function handleSignOut() {
    const supabase = createBrowserSupabaseClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const { start: dateStart, end: dateEnd } =
    preset === "custom" ? { start: customStart, end: customEnd } : getDateRange(preset);

  const today = renderDate.toISOString().split("T")[0];
  const heatmapStart = heatmapDays > 0
    ? new Date(renderDate.getTime() - heatmapDays * 86400000).toISOString().split("T")[0]
    : undefined;
  const heatmapEnd = heatmapDays > 0 ? today : undefined;

  const isHeatmap = view === "heatmaps";
  const isDataExplorer = view === "data_explorer";
  const isAcquisition = view === "acquisition";
  const isAcquisitionDataExplorer = view === "acquisition_data_explorer";
  const isAgents = view === "agents";
  const showDateFilters =
    view === "dashboard"
    || view === "kpi_simulator"
    || isDataExplorer
    || isAcquisition
    || isAcquisitionDataExplorer
    || isAgents
    || view === "dial_analytics"
    || view === "media_buyer"
    || view === "acquisition_marketing"
    || view === "client_calls"
    || view === "call_library";

  const navItem = NAV.find(n => n.view === view);
  const hubTabLabel = isHubView(view) && hubTab ? tabLabelForHub(view, hubTab) : null;

  const toggleGroup = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };
  const groups = NAV_GROUPS.filter(group => visibleNav.some(n => n.group === group));
  const dashboardScopeClients = getDashboardScopeClients(clients, selectedClientId);
  const dashboardReportingType = resolveDashboardReportingType(clients, selectedClientId);
  const dashboardHasMixedReportingTypes =
    new Set(dashboardScopeClients.map(c => normalizeReportingType(c.reporting_type))).size > 1;
  const dashboardClientLabel =
    selectedClientId === "__live__"
      ? "Live clients"
      : selectedClientId
        ? clients.find(c => c.id === selectedClientId)?.name
        : "All clients";
  const simulatorClientIsRm =
    dashboardReportingType === "RM"
    && !!selectedClientId
    && selectedClientId !== "__live__"
    && !dashboardHasMixedReportingTypes;
  const dateRangeLabel =
    preset === "custom" && customStart && customEnd
      ? `${customStart} – ${customEnd}`
      : preset.replace(/_/g, " ");

  const updateSimulatorUrl = useCallback((encoded: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("view", "kpi_simulator");
    params.set("sim", encoded);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [searchParams, pathname, router]);

  const goToConversionsActuals = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("view");
    params.delete("sim");
    params.set("sub", "conversions");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    setView("dashboard");
    setDashboardSubView("conversions");
    setSidebarOpen(false);
  }, [searchParams, pathname, router]);

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "#080f1e" }}>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-60 z-30 flex flex-col
        transition-transform duration-300
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        md:translate-x-0 md:static md:z-auto
      `} style={{ background: "#050c18", borderRight: "1px solid rgba(255,255,255,0.06)" }}>

        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-6" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden bg-white">
            <Image
              src="/mr-waiz-logo.png"
              alt="Mr. Waiz logo"
              width={32}
              height={32}
              className="h-8 w-8 object-contain"
            />
          </div>
          <div>
            <p className="text-sm font-bold tracking-wide" style={{ color: "#f1f5f9" }}>Mr. Waiz</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-5 px-3 space-y-4">
          {groups.map(group => {
            const items = visibleNav.filter(n => n.group === group);
            const collapsed = collapsedGroups.has(group);
            return (
              <div key={group}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className="w-full flex items-center justify-between px-3 mb-2 group"
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#334155" }}>
                    {group}
                  </p>
                  <span
                    className="text-[10px] transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]"
                    style={{
                      color: "#334155",
                      transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    }}
                  >
                    ▾
                  </span>
                </button>
                {!collapsed && items.map(item => {
                  const active = view === item.view;
                  return (
                    <button
                      key={item.view}
                      onClick={() => goToView(item.view)}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 mb-0.5 transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
                      style={active
                        ? { background: "rgba(245,158,11,0.12)", color: "#f59e0b", borderLeft: "2px solid #f59e0b" }
                        : { color: "#475569", borderLeft: "2px solid transparent" }}
                      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#94a3b8"; }}
                      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "#475569"; }}
                    >
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={NAV_ICONS[item.view]} />
                      </svg>
                      {item.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* Sign out */}
        <div className="px-3 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <button
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors"
            style={{ color: "#334155" }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#64748b"}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = "#334155"}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">

        {/* Header */}
        <header className="flex items-center gap-3 px-6 py-4 flex-wrap"
          style={{ background: "#050c18", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>

          <button className="md:hidden mr-1" onClick={() => setSidebarOpen(true)}
            style={{ color: "#475569" }}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <h1 className="text-base font-semibold mr-auto" style={{ color: "#e2e8f0" }}>
            {navItem?.group
              ? <span style={{ color: "#334155" }}>{navItem.group} / </span>
              : null}
            {navItem?.label ?? "Dashboard"}
            {hubTabLabel ? <span style={{ color: "#334155" }}> / {hubTabLabel}</span> : null}
          </h1>

          {showDateFilters && !view.startsWith("admin_") && (
            <>
              {(view === "dashboard" || view === "kpi_simulator" || view === "dial_analytics" || view === "media_buyer") && (
                <>
                <ClientSelect value={selectedClientId} onChange={setSelectedClientId} clients={clients} />
                {view === "dashboard" && !selectedClientId && (
                  <select
                    value={offerScope}
                    onChange={e => setOfferScope(e.target.value)}
                    className="px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "#0f2040", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)" }}
                    title="Filter metrics by product vertical"
                  >
                    <option value="">All offers</option>
                    {REPORTING_TYPES.map(rt => (
                      <option key={rt} value={rt}>{rt}</option>
                    ))}
                  </select>
                )}
                </>
              )}

              {view === "dashboard" && preset !== "all_time" && (
                <button
                  type="button"
                  onClick={() => setCompare(c => !c)}
                  className="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={compare
                    ? { background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.4)" }
                    : { background: "#0f2040", color: "#94a3b8", border: "1px solid rgba(255,255,255,0.12)" }}
                  title="Show change vs. the previous equal-length period"
                >
                  {compare ? "✓ Compare" : "Compare"}
                </button>
              )}

              <DateRangeFilter
                preset={preset}
                customStart={customStart}
                customEnd={customEnd}
                onPresetChange={setPreset}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
              />
            </>
          )}

          {/* Heat map controls */}
          {isHeatmap && (
            <>
              <ClientSelect value={heatmapClientId} onChange={setHeatmapClientId} clients={clients} />
              <Select value={heatmapDays} onChange={v => setHeatmapDays(Number(v))}>
                <option value={0}>All Time</option>
                <option value={7}>Last 7 days</option>
                <option value={14}>Last 14 days</option>
                <option value={30}>Last 30 days</option>
                <option value={60}>Last 60 days</option>
                <option value={90}>Last 90 days</option>
              </Select>
            </>
          )}
        </header>

        {/* Content */}
        <main
          className={`flex-1 min-h-0 flex flex-col ${
            view === "admin_billing"
              ? "overflow-hidden p-6 md:p-8"
              : view === "admin_clients"
                ? "overflow-auto px-6 md:px-8 pb-6 md:pb-8 pt-0"
                : "overflow-auto p-6 md:p-8"
          }`}
          style={{ background: "#080f1e" }}
        >

          {!firstVisibleView && (
            <div className="flex items-center justify-center py-24">
              <div className="text-center max-w-sm">
                <p className="text-sm font-medium" style={{ color: "#94a3b8" }}>No access</p>
                <p className="text-xs mt-1" style={{ color: "#475569" }}>
                  You don&apos;t have permission to view any tabs yet. Ask an admin to grant you access.
                </p>
              </div>
            </div>
          )}

          {/* ── Dashboard KPIs ── */}
          {firstVisibleView && view === "dashboard" && (
            <div className="space-y-8 max-w-7xl">
            {overduePending != null && overduePending > 0 && (
              <button
                type="button"
                onClick={() => goToView("data_explorer", "appointments")}
                className="w-full flex items-center gap-4 text-left rounded-xl px-5 py-4 transition-colors"
                style={{ background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.45)" }}
              >
                <div className="flex items-center justify-center rounded-lg shrink-0" style={{ width: "2.75rem", height: "2.75rem", background: "rgba(245,158,11,0.16)" }}>
                  <span className="text-xl font-bold" style={{ color: "#fbbf24" }}>{overduePending}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold" style={{ color: "#fbbf24" }}>
                    {overduePending} past-due appointment{overduePending === 1 ? "" : "s"} awaiting disposition
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "#a16207" }}>
                    Their scheduled date has passed but they aren&apos;t marked show, no-show, cancelled, or LO bailed — this drags down show rate. Click to review. (All-time total, ignores the date filter.)
                  </p>
                </div>
                <span className="ml-auto text-sm font-medium shrink-0 hidden sm:inline" style={{ color: "#fbbf24" }}>Review →</span>
              </button>
            )}
            {metricsLoading ? (
              <div className="flex items-center justify-center py-24">
                <div className="flex items-center gap-3" style={{ color: "#334155" }}>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  <span className="text-sm font-medium">Loading metrics…</span>
                </div>
              </div>
            ) : metrics ? (
              dashboardSubView === "conversions" && dashboardReportingType === "RM" ? (
                <ClientConversionsView
                  metrics={metrics}
                  clientLabel={dashboardClientLabel}
                  onBack={() => setDashboardSubView("main")}
                />
              ) : (
              <div className="space-y-8">
                {dashboardReportingType === "RM" && dashboardSubView === "main" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setDashboardSubView("conversions")}
                      className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors"
                      style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.4)" }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                      </svg>
                      Conversions &amp; ROI
                    </button>
                  </div>
                )}

                {dashboardHasMixedReportingTypes && (
                  <p className="text-xs rounded-lg px-3 py-2" style={{ color: "#64748b", background: "#0a1628", border: "1px solid rgba(255,255,255,0.06)" }}>
                    Mixed offer types (RM / HE / DSCR) in this selection. Showing the full RM dashboard for this combined view.
                  </p>
                )}

                <KpiSections metrics={metrics} reportingType={dashboardReportingType} previous={compare ? prevMetrics : null} spark={sparkMap} />

                <KpiSection title="Appointment Breakdown" showDivider>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <ShowQualityBar metrics={metrics} />
                    <ConversionFunnel metrics={metrics} />
                  </div>
                </KpiSection>

                {dashboardReportingType === "RM" && (
                  <KpiSection
                    title="Conversions"
                    showDivider
                    footnote="Counts use unique leads per stage in the selected date range. Cost metrics are total spend divided by each conversion-stage unique lead count."
                  >
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                      <KpiCard label="Proposals Made" value={formatKpiValue(metrics.proposals_made, "int")} hint="Unique leads that reached the proposal stage or beyond (submitted/funded count too)." />
                      <KpiCard label="Submissions" value={formatKpiValue(metrics.submissions_made, "int")} hint="Unique leads that reached the submission stage or beyond (funded count too)." />
                      <KpiCard label="Funded Loans" value={formatKpiValue(metrics.funded_loans, "int")} accent hint="Unique leads with a funded loan — the deal closed." />
                      <KpiCard label="Cost per Proposal" value={formatKpiValue(metrics.cp_proposal_made, "money")} hint="Total Spend ÷ Proposals Made." />
                      <KpiCard label="Cost per Submission" value={formatKpiValue(metrics.cp_submission_made, "money")} hint="Total Spend ÷ Submissions." />
                      <KpiCard label="Cost per Funded" value={formatKpiValue(metrics.cp_loan_funded, "money")} hint="Total Spend ÷ Funded Loans." />
                    </div>
                  </KpiSection>
                )}

                <KpiSection title="Rate Trends" showDivider>
                  <RateTrendCharts
                    clientId={selectedClientId === "__live__" ? "" : selectedClientId}
                    liveOnly={selectedClientId === "__live__"}
                    startDate={dateStart}
                    endDate={dateEnd}
                    reportingType={dashboardReportingType}
                  />
                </KpiSection>

                {dashboardReportingType === "RM" && (
                  <KpiSection title="Cost Trends" showDivider>
                    <CostTrendCharts
                      clientId={selectedClientId === "__live__" ? "" : selectedClientId}
                      liveOnly={selectedClientId === "__live__"}
                      startDate={dateStart}
                      endDate={dateEnd}
                    />
                  </KpiSection>
                )}
              </div>
              )
            ) : null}
            </div>
          )}

          {/* ── Heat Maps hub ── */}
          {view === "heatmaps" && hubTab && (
            <HeatMapsHub
              tab={hubTab as HeatmapTab}
              onTabChange={setHubTabAndUrl}
              heatmapClientId={heatmapClientId}
              heatmapStart={heatmapStart}
              heatmapEnd={heatmapEnd}
            />
          )}

          {/* ── Data Explorer hub ── */}
          {view === "data_explorer" && hubTab && (
            <DataExplorerHub
              tab={hubTab as DataExplorerTab}
              onTabChange={setHubTabAndUrl}
              clients={clients}
              preset={preset}
              startDate={dateStart}
              endDate={dateEnd}
            />
          )}

          {/* ── Acquisition KPI hub (new) ── */}
          {view === "acquisition_kpis" && hubTab && (
            <AcquisitionKpiHub
              tab={hubTab as AcquisitionKpiTab}
              onTabChange={setHubTabAndUrl}
              startDate={dateStart}
              endDate={dateEnd}
              isOwner={isOwner}
              preset={preset}
              customStart={customStart}
              customEnd={customEnd}
              onPresetChange={setPreset}
              onCustomStartChange={setCustomStart}
              onCustomEndChange={setCustomEnd}
            />
          )}

          {/* ── Acquisition hub ── */}
          {view === "acquisition" && hubTab && (
            <AcquisitionHub
              tab={hubTab as AcquisitionTab}
              onTabChange={setHubTabAndUrl}
              startDate={dateStart}
              endDate={dateEnd}
            />
          )}

          {view === "acquisition_data_explorer" && hubTab && (
            <AcquisitionDataExplorerHub
              tab={hubTab as AcquisitionDataExplorerTab}
              onTabChange={setHubTabAndUrl}
              startDate={dateStart}
              endDate={dateEnd}
            />
          )}

          {/* ── Agents hub ── */}
          {view === "agents" && hubTab && (
            <AgentsHub
              tab={hubTab as AgentsTab}
              onTabChange={setHubTabAndUrl}
              clients={clients}
              preset={preset}
              startDate={dateStart}
              endDate={dateEnd}
            />
          )}

          {view === "dial_analytics" && (
            <DialAnalytics
              startDate={dateStart}
              endDate={dateEnd}
              clientId={selectedClientId === "__live__" ? undefined : selectedClientId || undefined}
              liveOnly={selectedClientId === "__live__"}
            />
          )}

          {view === "media_buyer" && (
            <MediaBuyer
              startDate={dateStart}
              endDate={dateEnd}
              clientId={selectedClientId === "__live__" ? undefined : selectedClientId || undefined}
            />
          )}

          {view === "acquisition_marketing" && (
            <AcquisitionMarketing startDate={dateStart} endDate={dateEnd} />
          )}

          {view === "client_calls" && (
            <ClientCallsBrowser clients={clients} startDate={dateStart} endDate={dateEnd} />
          )}

          {view === "acquisition_sales_reps" && <AcquisitionSalesReps />}

          {view === "resources" && (
            <Suspense fallback={<p className="text-sm text-slate-500 py-12">Loading library…</p>}>
              <ResourcesLibrary canManage={isOwner || isAdmin} />
            </Suspense>
          )}

          {view === "call_library" && (
            <CallLibrary canManage={isOwner || isAdmin} startDate={dateStart} endDate={dateEnd} />
          )}

          {view === "client_health" && <ClientHealthDashboard />}

          {view === "state_looker" && <StateLooker />}

          {firstVisibleView && view === "kpi_simulator" && (
            <FunnelSimulatorView
              metrics={metrics}
              metricsLoading={metricsLoading}
              clientLabel={dashboardClientLabel}
              clientIsRm={simulatorClientIsRm}
              dateRangeLabel={dateRangeLabel}
              onViewActuals={simulatorClientIsRm ? goToConversionsActuals : undefined}
              initialEncoded={searchParams.get("sim")}
              onStateChange={updateSimulatorUrl}
            />
          )}

          {view === "ceo" && <CeoDashboard canViewRevenue={canViewRevenue} mode="dashboard" />}
          {view === "ceo_raw" && <CeoDashboard canViewRevenue={canViewRevenue} mode="raw" />}

          {/* ── Admin ── */}
          {view === "admin_agents"  && <AgentAdmin />}
          {view === "admin_clients" && (
              <ClientRoster canViewRevenue={canViewRevenue} />
          )}
          {view === "admin_billing" && (
            <div className="flex-1 min-h-0 flex flex-col overflow-auto">
              <BillingManager canViewRevenue={canViewRevenue} />
            </div>
          )}
          {view === "admin_agent_payroll" && (
            <AgentPayrollReport
              onGoToCreditQueue={() => goToView("agents", "credit_queue")}
              onGoToAcquisitionCreditQueue={() => goToView("acquisition", "credit_queue")}
            />
          )}
          {view === "schedule"      && <SetterSchedule clients={clients} />}
          {view === "admin_share"   && <ShareReports clients={clients} />}
          {view === "admin_automations" && <AutomationsManager />}
          {view === "admin_users"   && <UserManager />}
          {view === "admin_offers"  && <OfferCatalogManager />}

        </main>
      </div>
    </div>
  );
}
