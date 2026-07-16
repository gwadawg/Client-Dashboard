import type Anthropic from '@anthropic-ai/sdk';
import type { DataChatScope } from './scopes';

/** Anthropic tool schemas only — no DB access. Keep descriptions short. */
const FULFILLMENT_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_fulfillment_metrics',
    description:
      'Aggregated fulfillment KPIs for the locked date range. Optional client_id. Field meanings match docs/KPIS.md (show_pct, net_show_pct, cps=CPConv, etc.).',
    input_schema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Optional client UUID. Omit for session client filter.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_clients',
    description: 'Resolve a client name to id before get_fulfillment_metrics.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional name substring.' },
      },
      additionalProperties: false,
    },
  },
];

const SETTER_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_dial_performance',
    description:
      'Team dial analytics: summary, top agents, flagged clients, short trend. Optional client_id.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: {
          type: 'string',
          description: 'Optional client UUID.',
        },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_agent_scorecards',
    description:
      'Per-agent dial/booking/show scorecards plus team totals for the locked date range.',
    input_schema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
  },
];

export function toolDefsForScope(scope: DataChatScope): Anthropic.Tool[] {
  return scope === 'fulfillment_kpis' ? FULFILLMENT_TOOLS : SETTER_TOOLS;
}
