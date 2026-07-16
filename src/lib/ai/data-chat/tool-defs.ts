import type Anthropic from '@anthropic-ai/sdk';
import type { DataChatScope } from './scopes';

const CLIENT_QUESTIONS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_clients',
    description: 'Resolve a client name to id (id, name, is_live).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Optional name substring.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_client_profile',
    description:
      'Safe client profile: company/brokerage, location, licensed states, timezone, contacts, offer — never billing/payroll.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Client UUID (required unless session has one).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_fulfillment_metrics',
    description:
      'Fulfillment KPIs for the locked date range. Optional client_id. Fields match docs/KPIS.md.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string', description: 'Optional client UUID.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_client_calls',
    description:
      'List recent account calls (onboarding/launch/checkin/churn) with short transcript snippets. Prefer this before get_client_call.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        call_type: {
          type: 'string',
          description: 'Optional: onboarding | launch | checkin | churn | other',
        },
        limit: { type: 'number', description: 'Max rows (default 10, max 20).' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_client_call',
    description: 'Full call detail + transcript by call id. Only when the user needs the full conversation.',
    input_schema: {
      type: 'object',
      properties: {
        call_id: { type: 'string', description: 'client_calls.id UUID' },
      },
      required: ['call_id'],
      additionalProperties: false,
    },
  },
];

const CALL_REP_TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_dial_performance',
    description:
      'Team dial analytics: summary, top agents, flagged clients, short trend. Optional client_id.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
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

const CLIENT_SUCCESS_TOOLS: Anthropic.Tool[] = [
  {
    name: 'list_clients',
    description: 'Resolve a client name to id.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_client_profile',
    description: 'Safe operational profile (no billing/payroll).',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_fulfillment_metrics',
    description: 'Fulfillment KPIs for coaching context.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_client_health_summary',
    description:
      'Latest health snapshot + open interventions for a client (CPConv/CPQL tiers, constraint — no dollars beyond ad-spend KPIs already in metrics).',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_client_notes',
    description: 'Recent CRM notes for a client (no billing notes content filtering — still no money fields).',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'get_client_interventions',
    description: 'Action log / interventions planned or in progress for a client.',
    input_schema: {
      type: 'object',
      properties: {
        client_id: { type: 'string' },
        limit: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'search_playbooks',
    description:
      'Search Mr. Waiz library playbooks/SOPs by keyword (title/description). Returns metadata only — then get_playbook for body.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search text' },
        department: {
          type: 'string',
          description: 'Optional: client-success | call-center | sales | operations | media-buying',
        },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_playbook',
    description: 'Load one playbook/SOP body by slug (truncated). Use after search_playbooks.',
    input_schema: {
      type: 'object',
      properties: {
        slug: { type: 'string' },
      },
      required: ['slug'],
      additionalProperties: false,
    },
  },
];

export function toolDefsForScope(scope: DataChatScope): Anthropic.Tool[] {
  switch (scope) {
    case 'client_questions':
      return CLIENT_QUESTIONS_TOOLS;
    case 'call_rep_questions':
      return CALL_REP_TOOLS;
    case 'client_success':
      return CLIENT_SUCCESS_TOOLS;
  }
}
