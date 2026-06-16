/**
 * Outbound notifications — Slack direct (preferred) with optional Make.com fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  formatLaunchCompleteSlackMessage,
  formatOnboardingCompleteSlackMessage,
  getSlackOpsChannelSlug,
  isSlackConfigured,
  postSlackMessage,
  postToTeamChannel,
} from '@/lib/slack-notify';

type WebhookPayload = Record<string, unknown>;

async function postMakeWebhook(envKey: string, payload: WebhookPayload): Promise<void> {
  const url = process.env[envKey]?.trim();
  if (!url) return;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`[make-webhook] ${envKey} failed`, res.status, await res.text().catch(() => ''));
    }
  } catch (e) {
    console.error(`[make-webhook] ${envKey} error`, e);
  }
}

export async function notifyOnboardingComplete(
  service: SupabaseClient,
  payload: {
    client_id: string;
    client_name: string;
    email: string | null;
    phone: string | null;
    primary_contact_name: string | null;
  },
): Promise<void> {
  const text = formatOnboardingCompleteSlackMessage({
    ...payload,
    has_ghl_contact: true,
    ghl_tagged: true,
    has_clickup_task: true,
    clickup_updated: true,
  });
  let sentViaSlack = false;

  if (isSlackConfigured()) {
    const opsSlug = getSlackOpsChannelSlug();
    const result = await postToTeamChannel(service, opsSlug, text);
    if (result?.ok) {
      sentViaSlack = true;
    } else if (result && !result.ok) {
      console.error('[notifications] onboarding Slack failed', result.error);
    }
  }

  if (!sentViaSlack) {
    await postMakeWebhook('MAKE_ONBOARDING_COMPLETE_WEBHOOK_URL', {
      event: 'onboarding_complete',
      ...payload,
    });
  }
}

export async function notifyLaunchComplete(payload: {
  client_id: string;
  client_name: string;
  launch_date: string;
  slack_id: string | null;
  submitted_by: string | null;
  checklist: Record<string, unknown>;
}): Promise<void> {
  const text = formatLaunchCompleteSlackMessage(payload);
  let sentViaSlack = false;

  if (isSlackConfigured() && payload.slack_id) {
    const result = await postSlackMessage({ channel: payload.slack_id, text });
    if (result.ok) {
      sentViaSlack = true;
    } else {
      console.error('[notifications] launch Slack failed', result.error);
    }
  } else if (isSlackConfigured() && !payload.slack_id) {
    console.warn('[notifications] launch Slack skipped — client has no slack_id', payload.client_id);
  }

  if (!sentViaSlack) {
    await postMakeWebhook('MAKE_LAUNCH_COMPLETE_WEBHOOK_URL', {
      event: 'launch_complete',
      ...payload,
    });
  }
}
