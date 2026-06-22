/** Slack channel registry helpers (workspace channels + validation). */

export type SlackChannelRow = {
  id: string;
  slug: string;
  label: string;
  channel_id: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
};

export type NotificationAutomationRow = {
  id: string;
  name: string;
  event_key: string;
  target_type: 'workspace_channel' | 'client_channel';
  slack_channel_id: string | null;
  is_enabled: boolean;
  config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type ClientChannelRow = {
  client_id: string;
  client_name: string;
  slack_id: string | null;
  lifecycle_status: string | null;
};

export const SLACK_CHANNEL_SELECT =
  'id, slug, label, channel_id, description, is_active, created_at, updated_at, created_by, updated_by';

export const NOTIFICATION_AUTOMATION_SELECT =
  'id, name, event_key, target_type, slack_channel_id, is_enabled, config, created_at, updated_at';

/** Suggested workspace channel slugs for the Automations UI. */
export const SUGGESTED_TEAM_CHANNEL_SLUGS = [
  'ops_alerts',
  'client_success',
  'billing',
  'setters',
  'ceo',
] as const;

export function normalizeSlug(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
  return trimmed.length > 0 && trimmed.length <= 64 ? trimmed : null;
}

export function isValidSlackChannelId(id: unknown): boolean {
  if (typeof id !== 'string') return false;
  const trimmed = id.trim();
  return /^[CG][A-Z0-9]{8,}$/i.test(trimmed);
}

export function normalizeSlackChannelId(id: unknown): string | null {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return isValidSlackChannelId(trimmed) ? trimmed.toUpperCase() : null;
}

export function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}
