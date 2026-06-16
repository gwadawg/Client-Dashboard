/**
 * Outbound notifications — Slack direct (preferred) with optional Make.com fallback.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatLaunchSlackChecklist } from '@/lib/launch-form';
import {
  formatLaunchClientSlackMessage,
  formatLaunchOpsSlackMessage,
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

export async function notifyLaunchComplete(
  service: SupabaseClient,
  payload: {
    client_id: string;
    client_name: string;
    launch_date: string;
    slack_id: string | null;
    completed_by: string | null;
    responses: Record<string, unknown>;
  },
): Promise<void> {
  const notes = typeof payload.responses.notes === 'string' ? payload.responses.notes : null;
  const checklistText = formatLaunchSlackChecklist(payload.responses);

  const opsText = formatLaunchOpsSlackMessage({
    client_name: payload.client_name,
    launch_date: payload.launch_date,
    completed_by: payload.completed_by,
    checklist_text: checklistText,
    notes,
  });

  const clientText = formatLaunchClientSlackMessage({
    client_name: payload.client_name,
    launch_date: payload.launch_date,
    completed_by: payload.completed_by,
  });

  let sentAnySlack = false;

  if (isSlackConfigured()) {
    const opsSlug = getSlackOpsChannelSlug();
    const opsResult = await postToTeamChannel(service, opsSlug, opsText);
    if (opsResult?.ok) {
      sentAnySlack = true;
    } else if (opsResult && !opsResult.ok) {
      console.error('[notifications] launch ops Slack failed', opsResult.error);
    }

    if (payload.slack_id) {
      const clientResult = await postSlackMessage({ channel: payload.slack_id, text: clientText });
      if (clientResult.ok) {
        sentAnySlack = true;
      } else {
        console.error('[notifications] launch client Slack failed', clientResult.error);
      }
    } else {
      console.warn('[notifications] launch client Slack skipped — no slack_id', payload.client_id);
    }
  }

  if (!sentAnySlack) {
    await postMakeWebhook('MAKE_LAUNCH_COMPLETE_WEBHOOK_URL', {
      event: 'launch_complete',
      client_id: payload.client_id,
      client_name: payload.client_name,
      launch_date: payload.launch_date,
      slack_id: payload.slack_id,
      completed_by: payload.completed_by,
      checklist: payload.responses,
    });
  }
}
