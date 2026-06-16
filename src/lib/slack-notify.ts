import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeSlackChannelId } from '@/lib/slack-channels';

export type SlackPostResult =
  | { ok: true; ts: string; channel: string }
  | { ok: false; error: string };

type SlackApiResponse = {
  ok: boolean;
  error?: string;
  ts?: string;
  channel?: string;
};

export function getSlackBotToken(): string | null {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  return token || null;
}

export function isSlackConfigured(): boolean {
  return !!getSlackBotToken();
}

/** Default team channel slug for internal ops alerts (onboarding, etc.). */
export function getSlackOpsChannelSlug(): string {
  return process.env.SLACK_OPS_CHANNEL_SLUG?.trim() || 'ops_alerts';
}

export async function postSlackMessage(params: {
  channel: string;
  text: string;
  blocks?: unknown[];
}): Promise<SlackPostResult> {
  const token = getSlackBotToken();
  if (!token) {
    return { ok: false, error: 'SLACK_BOT_TOKEN is not configured' };
  }

  const channel = normalizeSlackChannelId(params.channel) ?? params.channel.trim();
  if (!channel) {
    return { ok: false, error: 'Invalid channel ID' };
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({
        channel,
        text: params.text,
        blocks: params.blocks,
        unfurl_links: false,
        unfurl_media: false,
      }),
    });

    const data = (await res.json()) as SlackApiResponse;
    if (!data.ok) {
      const hint =
        data.error === 'not_in_channel'
          ? ' — invite the bot to this private channel with /invite @YourBot'
          : data.error === 'channel_not_found'
            ? ' — check the channel ID'
            : '';
      return { ok: false, error: `${data.error ?? 'Slack API error'}${hint}` };
    }

    return { ok: true, ts: data.ts ?? '', channel: data.channel ?? channel };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Slack request failed';
    return { ok: false, error: message };
  }
}

export async function getTeamChannelIdBySlug(
  service: SupabaseClient,
  slug: string,
): Promise<string | null> {
  const { data, error } = await service
    .from('slack_channels')
    .select('channel_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    console.error('[slack] team channel lookup failed', slug, error.message);
    return null;
  }
  return data?.channel_id ?? null;
}

export function formatLaunchClientSlackMessage(payload: {
  client_name: string;
  launch_date: string;
  completed_by: string | null;
}): string {
  const lines = [
    `🚀 *${payload.client_name}* is now live!`,
    '',
    `Launch date: ${payload.launch_date}`,
  ];
  if (payload.completed_by) {
    lines.push(`Completed by: ${payload.completed_by}`);
  }
  lines.push('', '_Posted by Mr. Waiz_');
  return lines.join('\n');
}

export function formatLaunchOpsSlackMessage(payload: {
  client_name: string;
  launch_date: string;
  completed_by: string | null;
  checklist_text: string;
  notes: string | null;
}): string {
  const lines = [
    `🚀 Launch complete: *${payload.client_name}*`,
    `Completed by: ${payload.completed_by ?? '—'}`,
    `Launch date: ${payload.launch_date}`,
    '',
    payload.checklist_text,
  ];
  if (payload.notes) {
    lines.push('', `Notes: ${payload.notes}`);
  }
  return lines.join('\n');
}

/** @deprecated Use formatLaunchClientSlackMessage */
export function formatLaunchCompleteSlackMessage(payload: {
  client_name: string;
  launch_date: string;
  completed_by?: string | null;
}): string {
  return formatLaunchClientSlackMessage({
    client_name: payload.client_name,
    launch_date: payload.launch_date,
    completed_by: payload.completed_by ?? null,
  });
}

export function formatOnboardingCompleteSlackMessage(payload: {
  client_name: string;
  email: string | null;
  phone: string | null;
  primary_contact_name: string | null;
  has_ghl_contact: boolean;
  ghl_tagged: boolean;
  has_clickup_task: boolean;
  clickup_updated: boolean;
}): string {
  const contact = payload.primary_contact_name?.trim() || payload.client_name;

  const ghlLine = !payload.has_ghl_contact
    ? '• GHL tag "OB form Filled" _(skipped — no ghl_contact_id on client)_'
    : payload.ghl_tagged
      ? '• GHL tag "OB form Filled" ✓'
      : '• GHL tag "OB form Filled" _(failed — check logs)_';

  const clickupLine = !payload.has_clickup_task
    ? '• ClickUp task comment _(skipped — no clickup_task_id on client)_'
    : payload.clickup_updated
      ? '• ClickUp task comment ✓'
      : '• ClickUp task comment _(failed — check logs)_';

  const lines = [
    `✅ *Onboarding form completed* — matched to client file`,
    '',
    `Client: *${payload.client_name}*`,
    `Contact: ${contact}`,
    payload.email ? `Email: ${payload.email}` : null,
    payload.phone ? `Phone: ${payload.phone}` : null,
    '',
    'Next steps triggered:',
    ghlLine,
    clickupLine,
    '',
    '_Posted by Mr. Waiz_',
  ];
  return lines.filter((line): line is string => line != null).join('\n');
}

export function formatOnboardingUnmappedSlackMessage(payload: {
  email: string;
  phone: string;
  match_count: number;
  submission_id: string;
  brokerage_name?: string | null;
  nmls?: string | null;
}): string {
  const matchReason =
    payload.match_count === 0
      ? 'No client file found for this email + phone'
      : `${payload.match_count} possible client files found — needs manual review`;

  return [
    `⚠️ *Onboarding form submitted* — could not match client file`,
    '',
    `Email: ${payload.email}`,
    `Phone: ${payload.phone}`,
    payload.brokerage_name ? `Brokerage: ${payload.brokerage_name}` : null,
    payload.nmls ? `NMLS: ${payload.nmls}` : null,
    '',
    `*Match result:* ${matchReason}`,
    '',
    'GHL tag and ClickUp were *not* updated. Resolve in Mr. Waiz → *Unmapped onboarding forms*, then link to the correct client.',
    `Submission ID: \`${payload.submission_id}\``,
    '',
    '_Posted by Mr. Waiz_',
  ]
    .filter((line): line is string => line != null)
    .join('\n');
}

/** Post to a team channel by slug, or skip if not configured. */
export async function postToTeamChannel(
  service: SupabaseClient,
  slug: string,
  text: string,
): Promise<SlackPostResult | null> {
  if (!isSlackConfigured()) return null;
  const channelId = await getTeamChannelIdBySlug(service, slug);
  if (!channelId) {
    console.warn(`[slack] no active team channel for slug "${slug}"`);
    return null;
  }
  return postSlackMessage({ channel: channelId, text });
}
