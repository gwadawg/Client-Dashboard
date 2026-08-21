/**
 * Built-in automations — run in Mr. Waiz code on lifecycle events.
 * Shown read-only in Admin → Automations. Edit behavior via env vars or GHL workflows.
 */

export type BuiltInAutomation = {
  id: string;
  name: string;
  event_key: string;
  trigger: string;
  actions: string[];
  enabled: true;
};

export const BUILT_IN_AUTOMATIONS: BuiltInAutomation[] = [
  {
    id: 'onboarding-complete',
    name: 'Onboarding form complete (matched)',
    event_key: 'onboarding.complete',
    trigger: 'Client submits /onboard and email + phone match exactly one client',
    actions: [
      'GHL — add tag "OB form Filled" on ghl_contact_id (triggers GHL automations)',
      'ClickUp — comment on clickup_task_id with all form answers',
      'ClickUp — optional status (CLICKUP_OB_TASK_STATUS) and custom fields (CLICKUP_OB_FIELD_MAP)',
      'Slack — ops channel alert (team channel slug in Automations tab)',
    ],
    enabled: true,
  },
  {
    id: 'onboarding-unmapped',
    name: 'Onboarding form unmapped',
    event_key: 'onboarding.unmapped',
    trigger: 'Client submits /onboard but email + phone match zero or multiple clients',
    actions: [
      'Slack — ops channel alert with match failure reason and submission ID',
      'GHL + ClickUp — skipped until manually linked in Unmapped onboarding forms',
    ],
    enabled: true,
  },
  {
    id: 'acquisition-closer-form-ghl',
    name: 'Closer form submitted — GHL disposition tags',
    event_key: 'acquisition.closer_form_submitted',
    trigger: 'Closer submits the closer form (offer presented and/or closed on call)',
    actions: [
      'GHL acquisition subaccount — add tag "Offer made" when offer presented',
      'GHL acquisition subaccount — add tag "closed" when deal closed on call',
    ],
    enabled: true,
  },
  {
    id: 'cpl-threshold-media-buyer',
    name: 'CPL over $35 (past 4 days)',
    event_key: 'kpi.cpl.threshold_breached',
    trigger:
      'Daily cron: active + live paid-ads clients whose CPL (ad spend ÷ leads) over the past 4 calendar days exceeds $35',
    actions: [
      'Slack — media_buyer team channel digest (add slug media_buyer in Automations → Team channels)',
      'Endpoint — GET/POST /api/alerts/cpl-threshold (CRON_SECRET or ADMIN_WEBHOOK_SECRET)',
    ],
    enabled: true,
  },
];

export function getBuiltInAutomation(eventKey: string): BuiltInAutomation | undefined {
  return BUILT_IN_AUTOMATIONS.find(a => a.event_key === eventKey);
}
