/**
 * Churn offboarding side effects — GHL tag + ClickUp task update + Slack ops alert.
 * Fire-and-forget: failures are logged, never block the wizard response.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addClickUpTaskComment,
  getClickUpToken,
  updateClickUpTask,
} from '@/lib/clickup';
import {
  CHURN_CHECKLIST_ITEMS,
  churnReasonDisplay,
  formatChurnChecklistLine,
  formatChurnSlackChecklist,
  wouldRejoinLabel,
  type ChurnFormDraft,
} from '@/lib/churn-form';
import { reasonLabel } from '@/lib/client-feedback';
import {
  getGhlApiToken,
  getGhlClientChurnedTag,
  getGhlCsLocationId,
  ghlAddContactTags,
} from '@/lib/ghl-api';
import {
  getSlackOpsChannelSlug,
  isSlackConfigured,
  postToTeamChannel,
} from '@/lib/slack-notify';

export type ChurnSideEffectClient = {
  id: string;
  name: string;
  clickup_task_id: string | null;
  ghl_contact_id: string | null;
  mrr: number | null;
};

function line(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  return `${label}: ${v || '—'}`;
}

export function formatChurnClickUpComment(
  client: Pick<ChurnSideEffectClient, 'name' | 'id' | 'mrr'>,
  draft: ChurnFormDraft,
): string {
  const lines = [
    '🔴 Client churned — offboarding complete',
    '',
    line('Client (Mr. Waiz)', client.name),
    line('Mr. Waiz ID', client.id),
    line('Effective churn date', draft.effective_churn_date),
    line('Reason', reasonLabel(draft.reason_code)),
    line('Lost MRR', client.mrr != null ? `$${client.mrr}` : null),
    '',
    '— Client feedback —',
    draft.client_feedback.trim(),
  ];

  if (draft.internal_notes.trim()) {
    lines.push('', '— Internal notes —', draft.internal_notes.trim());
  }

  if (draft.would_rejoin) {
    lines.push('', line('Would rejoin', wouldRejoinLabel(draft.would_rejoin)));
  }

  if (draft.recording_url.trim()) {
    lines.push('', line('Exit call recording', draft.recording_url.trim()));
  }

  lines.push('', '— Offboarding checklist —');
  for (const item of CHURN_CHECKLIST_ITEMS) {
    lines.push(formatChurnChecklistLine(draft, item, { plainText: true }).trimStart());
  }

  return lines.join('\n');
}

export function formatChurnCompleteSlackMessage(payload: {
  client_name: string;
  client_id: string;
  effective_churn_date: string;
  reason_code: string;
  lost_mrr: number | null;
  client_feedback: string;
  has_ghl_contact: boolean;
  ghl_tagged: boolean;
  has_clickup_task: boolean;
  clickup_updated: boolean;
  responses: Record<string, unknown>;
}): string {
  const ghlTag = getGhlClientChurnedTag();
  const ghlLine = !payload.has_ghl_contact
    ? `• GHL tag "${ghlTag}" _(skipped — no ghl_contact_id)_`
    : payload.ghl_tagged
      ? `• GHL tag "${ghlTag}" ✓`
      : `• GHL tag "${ghlTag}" _(failed — check logs)_`;

  const clickupLine = !payload.has_clickup_task
    ? '• ClickUp task update _(skipped — no clickup_task_id)_'
    : payload.clickup_updated
      ? '• ClickUp task status + comment ✓'
      : '• ClickUp task update _(failed — check logs)_';

  const lines = [
    `🔴 *Client churned* — offboarding complete`,
    '',
    `Client: *${payload.client_name}*`,
    `Effective date: ${payload.effective_churn_date}`,
    `Reason: ${churnReasonDisplay(payload.reason_code)}`,
    payload.lost_mrr != null ? `Lost MRR: $${payload.lost_mrr}` : null,
    '',
    `*Client feedback:* ${payload.client_feedback.slice(0, 500)}${payload.client_feedback.length > 500 ? '…' : ''}`,
    '',
    'Offboarding checklist:',
    formatChurnSlackChecklist(payload.responses),
    '',
    'Sync status:',
    ghlLine,
    clickupLine,
    '',
    '_Posted by Mr. Waiz_',
  ];
  return lines.filter((line): line is string => line != null).join('\n');
}

async function syncGhlChurn(client: ChurnSideEffectClient): Promise<boolean> {
  const contactId = client.ghl_contact_id?.trim();
  if (!contactId) {
    console.warn('[churn-side-effects] skip GHL — no ghl_contact_id on client', client.id);
    return false;
  }
  if (!getGhlApiToken()) {
    console.warn('[churn-side-effects] skip GHL — GHL_CS_API_TOKEN / GHL_API_TOKEN not set');
    return false;
  }
  const locationId = getGhlCsLocationId();
  if (!locationId) {
    console.warn('[churn-side-effects] skip GHL — GHL_CS_LOCATION_ID not set');
    return false;
  }

  await ghlAddContactTags(contactId, locationId, [getGhlClientChurnedTag()]);
  console.info('[churn-side-effects] GHL churn tag added:', contactId);
  return true;
}

async function syncClickUpChurn(
  client: ChurnSideEffectClient,
  draft: ChurnFormDraft,
): Promise<boolean> {
  const taskId = client.clickup_task_id?.trim();
  if (!taskId) {
    console.warn('[churn-side-effects] skip ClickUp — no clickup_task_id on client', client.id);
    return false;
  }
  const token = getClickUpToken();
  if (!token) {
    console.warn('[churn-side-effects] skip ClickUp — CLICKUP_API_TOKEN not set');
    return false;
  }

  const status = process.env.CLICKUP_CHURN_TASK_STATUS?.trim();
  if (status) {
    await updateClickUpTask(taskId, token, { status });
  }

  const comment = formatChurnClickUpComment(client, draft);
  await addClickUpTaskComment(taskId, token, comment);
  console.info('[churn-side-effects] ClickUp updated for task', taskId);
  return true;
}

async function notifyOpsSlack(service: SupabaseClient, text: string): Promise<void> {
  const slug = getSlackOpsChannelSlug();
  if (!isSlackConfigured()) {
    console.warn('[churn-side-effects] skip Slack — SLACK_BOT_TOKEN not set');
    return;
  }
  try {
    const result = await postToTeamChannel(service, slug, text);
    if (!result) {
      console.warn(`[churn-side-effects] skip Slack — no channel for slug "${slug}"`);
      return;
    }
    if (!result.ok) {
      console.error('[churn-side-effects] Slack failed', result.error);
      return;
    }
    console.info('[churn-side-effects] Slack ops alert sent to', slug);
  } catch (e) {
    console.error('[churn-side-effects] Slack failed', e);
  }
}

/** GHL tag + ClickUp + Slack ops alert. Never throws. */
export async function runChurnSideEffects(
  client: ChurnSideEffectClient,
  draft: ChurnFormDraft,
  responses: Record<string, unknown>,
  service?: SupabaseClient,
): Promise<void> {
  let ghlTagged = false;
  let clickupUpdated = false;

  try {
    ghlTagged = await syncGhlChurn(client);
  } catch (e) {
    console.error('[churn-side-effects] GHL failed', e);
  }

  try {
    clickupUpdated = await syncClickUpChurn(client, draft);
  } catch (e) {
    console.error('[churn-side-effects] ClickUp failed', e);
  }

  if (service) {
    const text = formatChurnCompleteSlackMessage({
      client_name: client.name,
      client_id: client.id,
      effective_churn_date: draft.effective_churn_date,
      reason_code: draft.reason_code,
      lost_mrr: client.mrr,
      client_feedback: draft.client_feedback,
      has_ghl_contact: !!client.ghl_contact_id?.trim(),
      ghl_tagged: ghlTagged,
      has_clickup_task: !!client.clickup_task_id?.trim(),
      clickup_updated: clickupUpdated,
      responses,
    });
    await notifyOpsSlack(service, text);
  }
}
