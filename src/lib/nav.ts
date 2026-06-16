// Shared navigation/tab definitions used by the dashboard and the per-user
// permission editor. Each NAV item is one "tab" a user can be granted access to.

export type View =
  | "dashboard"
  | "ceo"
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
  | "dial_analytics"
  | "media_buyer"
  | "client_health"
  | "admin_agents"
  | "admin_clients"
  | "admin_billing"
  | "admin_agent_payroll"
  | "admin_share"
  | "admin_users"
  | "admin_automations"
  | "schedule"
  | "client_calls"
  | "resources";

export type NavItem = { view: View; label: string; group: string };

// Sidebar group ordering.
export const NAV_GROUPS = [
  "Overview",
  "Resources",
  "Raw Data",
  "Heat Maps",
  "Agent Credit",
  "Agent Stats",
  "Admin",
] as const;

export const NAV: NavItem[] = [
  { view: "dashboard",          label: "Dashboard",             group: "Overview"     },
  { view: "ceo",                label: "Business",              group: "Overview"     },
  { view: "dial_analytics",     label: "Dial Analytics",        group: "Overview"     },
  { view: "media_buyer",        label: "Media Buyer",           group: "Overview"     },
  { view: "leads",              label: "New Leads",             group: "Raw Data"     },
  { view: "dials",              label: "All Dials",             group: "Raw Data"     },
  { view: "appointments",       label: "Appointments",          group: "Raw Data"     },
  { view: "speed_to_lead",      label: "Speed to Lead",         group: "Raw Data"     },
  { view: "meta_ad_insights",   label: "Meta Ads",              group: "Raw Data"     },
  { view: "ad_spend",           label: "Other Ad Spend",        group: "Raw Data"     },
  { view: "heatmap_show",       label: "Show Rate",             group: "Heat Maps"    },
  { view: "heatmap_pickup",     label: "Pick Up Rate",          group: "Heat Maps"    },
  { view: "heatmap_leads",      label: "New Leads",             group: "Heat Maps"    },
  { view: "agent_stats",        label: "Agent Stats",           group: "Agent Stats"  },
  { view: "agent_credit_queue", label: "Credit Queue",          group: "Agent Credit" },
  { view: "agent_scorecards",   label: "Scorecards",            group: "Agent Stats"  },
  { view: "recordings",         label: "Call Recordings",       group: "Agent Stats"  },
  { view: "goals",              label: "Goal Tracker",          group: "Overview"     },
  { view: "client_health",      label: "Client Success",        group: "Overview"     },
  { view: "resources",          label: "Resource Library",      group: "Resources"    },
  { view: "admin_agents",       label: "Agent Roster",          group: "Admin"        },
  { view: "admin_clients",      label: "Client Roster",         group: "Admin"        },
  { view: "client_calls",       label: "Client Calls",          group: "Admin"        },
  { view: "admin_billing",      label: "Client Billing",        group: "Admin"        },
  { view: "admin_agent_payroll", label: "Agent Payroll",        group: "Admin"        },
  { view: "schedule",           label: "Power Dialer Schedule", group: "Admin"        },
  { view: "admin_share",        label: "Share Reports",         group: "Admin"        },
  { view: "admin_automations",  label: "Automations",           group: "Admin"        },
  { view: "admin_users",        label: "Users",                 group: "Admin"        },
];

export const ALL_VIEWS: View[] = NAV.map(item => item.view);

// Permission resolution lives in src/lib/permissions.ts, which builds on this
// structural registry. nav.ts intentionally stays free of permission logic to
// avoid a circular dependency.
