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
];

export function getBuiltInAutomation(eventKey: string): BuiltInAutomation | undefined {
  return BUILT_IN_AUTOMATIONS.find(a => a.event_key === eventKey);
}
