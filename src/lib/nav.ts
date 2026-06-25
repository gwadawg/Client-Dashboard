// Shared navigation/tab definitions used by the dashboard and the per-user
// permission editor. Hub views appear in the sidebar; sub-tabs live in-page.

export type HeatmapTab = "show_rate" | "pickup_rate" | "new_leads";
export type DataExplorerTab = "leads" | "dials" | "appointments" | "speed_to_lead" | "meta_ads";
export type AcquisitionTab = "appointments" | "credit_queue" | "sales_calls" | "pending_closes" | "log_close";
export type AcquisitionDataExplorerTab = "leads" | "appointments" | "offers" | "dials" | "closes" | "ads";
export type AcquisitionKpiTab = "overview" | "setters" | "closers" | "costs";
export type AgentsTab = "performance" | "goals" | "credit_queue" | "recordings";

export type HubView = "heatmaps" | "data_explorer" | "acquisition" | "acquisition_data_explorer" | "acquisition_kpis" | "agents";

export type View =
  | "dashboard"
  | "kpi_simulator"
  | "ceo"
  | "dial_analytics"
  | "media_buyer"
  | "client_health"
  | "state_looker"
  | HubView
  | "resources"
  | "admin_agents"
  | "admin_clients"
  | "admin_billing"
  | "admin_agent_payroll"
  | "admin_share"
  | "admin_users"
  | "admin_offers"
  | "admin_automations"
  | "schedule"
  | "client_calls"
  | "acquisition_sales_reps"
  | "acquisition_marketing";

/** @deprecated Legacy view keys — URL redirects map these to hub + tab. */
export type LegacyView =
  | "leads"
  | "dials"
  | "appointments"
  | "speed_to_lead"
  | "ad_spend"
  | "meta_ad_insights"
  | "heatmap_show"
  | "heatmap_pickup"
  | "heatmap_leads"
  | "agent_stats"
  | "agent_credit_queue"
  | "agent_scorecards"
  | "recordings"
  | "goals"
  | "acquisition_funnel"
  | "acquisition_team"
  | "acquisition_setter_credit_queue"
  | "acquisition_leads"
  | "acquisition_appointments"
  | "acquisition_offers"
  | "acquisition_ads";

export type AnyView = View | LegacyView;

export type NavItem = { view: View; label: string; group: string };

export type HubTabDef<T extends string> = { key: T; label: string };

export const HEATMAP_TABS: HubTabDef<HeatmapTab>[] = [
  { key: "show_rate", label: "Show Rate" },
  { key: "pickup_rate", label: "Pick Up Rate" },
  { key: "new_leads", label: "New Leads" },
];

export const DATA_EXPLORER_TABS: HubTabDef<DataExplorerTab>[] = [
  { key: "leads", label: "Leads" },
  { key: "dials", label: "Dials" },
  { key: "appointments", label: "Appointments" },
  { key: "speed_to_lead", label: "Speed to Lead" },
  { key: "meta_ads", label: "Meta Ads" },
];

export const ACQUISITION_TABS: HubTabDef<AcquisitionTab>[] = [
  { key: "appointments", label: "Appointments" },
  { key: "sales_calls", label: "Sales Calls" },
  { key: "credit_queue", label: "Credit Queue" },
  { key: "log_close", label: "Log Close" },
  { key: "pending_closes", label: "Pending Closes" },
];

export const ACQUISITION_KPI_TABS: HubTabDef<AcquisitionKpiTab>[] = [
  { key: "overview", label: "Overview" },
  { key: "setters", label: "Setters" },
  { key: "closers", label: "Closers" },
  { key: "costs", label: "Costs" },
];

export const ACQUISITION_DATA_EXPLORER_TABS: HubTabDef<AcquisitionDataExplorerTab>[] = [
  { key: "leads", label: "Leads" },
  { key: "appointments", label: "Appointments" },
  { key: "offers", label: "Offers" },
  { key: "dials", label: "Dials" },
  { key: "closes", label: "Closes" },
  { key: "ads", label: "Ad Spend" },
];

export const AGENTS_TABS: HubTabDef<AgentsTab>[] = [
  { key: "performance", label: "Performance" },
  { key: "goals", label: "Goals" },
  { key: "credit_queue", label: "Credit Queue" },
  { key: "recordings", label: "Recordings" },
];

/** Hub view → legacy permission keys that grant access. */
export const HUB_LEGACY_CHILDREN: Record<HubView, string[]> = {
  heatmaps: ["heatmap_show", "heatmap_pickup", "heatmap_leads"],
  data_explorer: ["leads", "dials", "appointments", "speed_to_lead", "meta_ad_insights"],
  acquisition: [
    "acquisition",
    "acquisition_marketing",
    "acquisition_funnel",
    "acquisition_team",
    "acquisition_setter_credit_queue",
    "acquisition_leads",
    "acquisition_appointments",
    "acquisition_offers",
    "acquisition_ads",
  ],
  acquisition_kpis: [
    "acquisition",
  ],
  acquisition_data_explorer: [
    "acquisition",
    "acquisition_leads",
    "acquisition_appointments",
    "acquisition_offers",
    "acquisition_ads",
  ],
  agents: ["agent_stats", "agent_scorecards", "agent_credit_queue", "recordings", "goals"],
};

/** All legacy keys still honored in stored permissions (soft deprecation). */
export const LEGACY_PERMISSION_KEYS: string[] = [
  ...HUB_LEGACY_CHILDREN.heatmaps,
  ...HUB_LEGACY_CHILDREN.data_explorer,
  "ad_spend",
  ...HUB_LEGACY_CHILDREN.acquisition.filter(k => k !== "acquisition"),
  ...HUB_LEGACY_CHILDREN.agents,
];

export const LEGACY_VIEW_REDIRECTS: Record<LegacyView, { view: View; tab: string }> = {
  leads: { view: "data_explorer", tab: "leads" },
  dials: { view: "data_explorer", tab: "dials" },
  appointments: { view: "data_explorer", tab: "appointments" },
  speed_to_lead: { view: "data_explorer", tab: "speed_to_lead" },
  ad_spend: { view: "data_explorer", tab: "meta_ads" },
  meta_ad_insights: { view: "data_explorer", tab: "meta_ads" },
  heatmap_show: { view: "heatmaps", tab: "show_rate" },
  heatmap_pickup: { view: "heatmaps", tab: "pickup_rate" },
  heatmap_leads: { view: "heatmaps", tab: "new_leads" },
  agent_stats: { view: "agents", tab: "performance" },
  agent_credit_queue: { view: "agents", tab: "credit_queue" },
  agent_scorecards: { view: "agents", tab: "performance" },
  recordings: { view: "agents", tab: "recordings" },
  goals: { view: "agents", tab: "goals" },
  acquisition_funnel: { view: "acquisition_kpis", tab: "overview" },
  acquisition_team: { view: "acquisition_kpis", tab: "setters" },
  acquisition_setter_credit_queue: { view: "acquisition", tab: "credit_queue" },
  acquisition_leads: { view: "acquisition_data_explorer", tab: "leads" },
  acquisition_appointments: { view: "acquisition_data_explorer", tab: "appointments" },
  acquisition_offers: { view: "acquisition_data_explorer", tab: "offers" },
  acquisition_ads: { view: "acquisition_data_explorer", tab: "ads" },
};

export const HUB_VIEWS: HubView[] = [
  "heatmaps",
  "data_explorer",
  "acquisition",
  "acquisition_data_explorer",
  "acquisition_kpis",
  "agents",
];

export const HUB_TAB_LABELS: Record<HubView, HubTabDef<string>[]> = {
  heatmaps: HEATMAP_TABS,
  data_explorer: DATA_EXPLORER_TABS,
  acquisition: ACQUISITION_TABS,
  acquisition_data_explorer: ACQUISITION_DATA_EXPLORER_TABS,
  acquisition_kpis: ACQUISITION_KPI_TABS,
  agents: AGENTS_TABS,
};

export function isHubView(view: string): view is HubView {
  return (HUB_VIEWS as string[]).includes(view);
}

export function defaultTabForHub(hub: HubView): string {
  return HUB_TAB_LABELS[hub][0].key;
}

export function tabLabelForHub(hub: HubView, tab: string): string | undefined {
  return HUB_TAB_LABELS[hub].find(t => t.key === tab)?.label;
}

// Sidebar group ordering.
export const NAV_GROUPS = [
  "Clients",
  "Executive",
  "Acquisition",
  "Team",
  "Admin",
] as const;

export const NAV: NavItem[] = [
  { view: "dashboard",          label: "Client KPIs",           group: "Clients"      },
  { view: "kpi_simulator",      label: "Funnel Simulator",      group: "Clients"      },
  { view: "dial_analytics",     label: "Dial Analytics",        group: "Clients"      },
  { view: "media_buyer",        label: "Media Buyer",           group: "Clients"      },
  { view: "client_health",      label: "Client Success",        group: "Clients"      },
  { view: "heatmaps",           label: "Heat Maps",             group: "Clients"      },
  { view: "data_explorer",      label: "Data Explorer",         group: "Clients"      },
  { view: "state_looker",       label: "State Looker",          group: "Clients"      },
  { view: "ceo",                label: "Business",              group: "Executive"    },
  { view: "acquisition_kpis",          label: "Acquisition KPIs",      group: "Acquisition"  },
  { view: "acquisition_marketing",     label: "Marketing",             group: "Acquisition"  },
  { view: "acquisition",               label: "Acquisition",           group: "Acquisition"  },
  { view: "acquisition_data_explorer", label: "Acquisition Data",      group: "Acquisition"  },
  { view: "agents",             label: "Call Center Hub",       group: "Team"         },
  { view: "resources",          label: "Resource Library",      group: "Team"         },
  { view: "schedule",           label: "Power Dialer Schedule", group: "Team"         },
  { view: "admin_agents",       label: "Agent Roster",          group: "Admin"        },
  { view: "admin_clients",      label: "Client Roster",         group: "Admin"        },
  { view: "client_calls",       label: "Client Calls",          group: "Admin"        },
  { view: "admin_billing",      label: "Client Billing",        group: "Admin"        },
  { view: "admin_agent_payroll", label: "Agent Payroll",        group: "Admin"        },
  { view: "admin_share",        label: "Share Reports",         group: "Admin"        },
  { view: "admin_automations",  label: "Automations",           group: "Admin"        },
  { view: "admin_users",        label: "Users",                 group: "Admin"        },
  { view: "admin_offers",       label: "Offer Catalog",         group: "Admin"        },
  { view: "acquisition_sales_reps", label: "Sales Reps",        group: "Admin"        },
];

export const ALL_VIEWS: View[] = NAV.map(item => item.view);

export function resolveViewFromParams(
  viewParam: string | null,
  tabParam: string | null,
): { view: View; tab: string | null } {
  if (!viewParam || viewParam === "dashboard") {
    return { view: "dashboard", tab: null };
  }

  if (viewParam in LEGACY_VIEW_REDIRECTS) {
    const redirect = LEGACY_VIEW_REDIRECTS[viewParam as LegacyView];
    return { view: redirect.view, tab: redirect.tab };
  }

  if (ALL_VIEWS.includes(viewParam as View)) {
    const view = viewParam as View;
    if (isHubView(view)) {
      const tabs = HUB_TAB_LABELS[view];
      const valid = tabs.some(t => t.key === tabParam);
      return { view, tab: valid ? tabParam : defaultTabForHub(view) };
    }
    return { view, tab: null };
  }

  return { view: "dashboard", tab: null };
}
