import { hasPermission } from '../../permissions';

/**
 * Locked conversation scopes.
 * Expand by adding a scope + tools — never dump the warehouse into one chat.
 */
export type DataChatScope =
  | 'client_questions'
  | 'call_rep_questions'
  | 'client_success';

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
  /** Permission keys — user needs any one. */
  permissions: string[];
  /** Allowlisted tool names (tool-set minimization). */
  tools: readonly string[];
  /** Show client picker in UI. */
  usesClientFilter: boolean;
};

/**
 * Confidential surfaces NEVER exposed by any tool:
 * billing amounts, MRR, payroll, expenses, Stripe IDs, invoices.
 */
export const DATA_CHAT_SCOPES: DataChatScopeDef[] = [
  {
    id: 'client_questions',
    label: 'Client Questions',
    description:
      'Client profile, licensed states, location, contacts, fulfillment KPIs, and past account calls.',
    permissions: ['dashboard', 'admin_clients', 'client_calls', 'agents'],
    tools: [
      'list_clients',
      'get_client_profile',
      'get_fulfillment_metrics',
      'search_client_calls',
      'get_client_call',
    ],
    usesClientFilter: true,
  },
  {
    id: 'call_rep_questions',
    label: 'Call Rep Questions',
    description:
      'High-level setter/dialer KPIs: dials, pickups, conversations, bookings, show rate, speed-to-lead.',
    permissions: ['dial_analytics', 'agents', 'agent_scorecards'],
    tools: ['get_dial_performance', 'get_agent_scorecards'],
    usesClientFilter: true,
  },
  {
    id: 'client_success',
    label: 'Client Success',
    description:
      'How to respond to clients: health signals, notes, interventions, and success playbooks (on-demand).',
    permissions: ['client_health', 'admin_clients', 'resources'],
    tools: [
      'list_clients',
      'get_client_profile',
      'get_fulfillment_metrics',
      'get_client_health_summary',
      'get_client_notes',
      'get_client_interventions',
      'search_playbooks',
      'get_playbook',
    ],
    usesClientFilter: true,
  },
];

export const TOOLS_BY_SCOPE = Object.fromEntries(
  DATA_CHAT_SCOPES.map(s => [s.id, new Set(s.tools)]),
) as unknown as Record<DataChatScope, ReadonlySet<string>>;

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
