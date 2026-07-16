import { hasPermission } from '../../permissions';

/** Locked conversation scopes — expand only when a new tool surface is ready. */
export type DataChatScope = 'fulfillment_kpis' | 'setter_performance';

export type DataChatFilters = {
  start_date: string;
  end_date: string;
  client_id?: string | null;
  live_only?: boolean;
};

export type DataChatScopeDef = {
  id: DataChatScope;
  label: string;
  description: string;
  /** Permission keys — user needs any one. Mirrors the APIs each scope wraps. */
  permissions: string[];
  /** Allowlisted tool names for this scope (tool-set minimization). */
  tools: readonly string[];
};

/**
 * Single registry for scopes. Adding a scope requires:
 * 1. entry here + tool names
 * 2. Anthropic schemas in tool-defs.ts
 * 3. executors in tools.ts
 * 4. note in docs/DATA_CHAT.md
 * Do not dump new tables into an existing scope — that defeats token control.
 */
export const DATA_CHAT_SCOPES: DataChatScopeDef[] = [
  {
    id: 'fulfillment_kpis',
    label: 'Client fulfillment KPIs',
    description:
      'Leads, bookings, shows, transfers, CPL/CPConv, and funnel rates for live clients.',
    permissions: ['dashboard', 'agents'],
    tools: ['get_fulfillment_metrics', 'list_clients'],
  },
  {
    id: 'setter_performance',
    label: 'Setter / dialer performance',
    description:
      'Dials, pickups, conversations, bookings, speed-to-lead, and agent scorecards.',
    permissions: ['dial_analytics', 'agents', 'agent_scorecards'],
    tools: ['get_dial_performance', 'get_agent_scorecards'],
  },
];

export const TOOLS_BY_SCOPE: Record<DataChatScope, ReadonlySet<string>> = {
  fulfillment_kpis: new Set(
    DATA_CHAT_SCOPES.find(s => s.id === 'fulfillment_kpis')!.tools,
  ),
  setter_performance: new Set(
    DATA_CHAT_SCOPES.find(s => s.id === 'setter_performance')!.tools,
  ),
};

export function canAccessScope(
  scope: DataChatScope,
  subject: { isOwner: boolean; allowedPermissions: string[] | null },
): boolean {
  const def = DATA_CHAT_SCOPES.find(s => s.id === scope);
  if (!def) return false;
  return def.permissions.some(key => hasPermission(key, subject));
}

export function listAccessibleScopes(subject: {
  isOwner: boolean;
  allowedPermissions: string[] | null;
}): DataChatScopeDef[] {
  return DATA_CHAT_SCOPES.filter(s => canAccessScope(s.id, subject));
}

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};
