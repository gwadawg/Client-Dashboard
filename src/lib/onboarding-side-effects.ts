/**
 * Onboarding complete side effects — GHL tag + ClickUp task update.
 * Fire-and-forget: failures are logged, never block the client thank-you screen.
 */

import {
  formatOnboardingCompleteSlackMessage,
  formatOnboardingUnmappedSlackMessage,
  getSlackOpsChannelSlug,
  isSlackConfigured,
  postToTeamChannel,
} from '@/lib/slack-notify';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  addClickUpTaskComment,
  getClickUpToken,
  parseClickUpObFieldMap,
  setClickUpCustomField,
  updateClickUpTask,
} from '@/lib/clickup';
import { contactTypeLabel } from '@/lib/client-contacts';
import { GHL_OB_FORM_FILLED_TAG, getGhlApiToken, getGhlCsLocationId, ghlAddContactTags } from '@/lib/ghl-api';
import type { OnboardingFormInput } from '@/lib/onboarding-form';
import { obRoleToContactRole } from '@/lib/onboarding-form';
import { formatStatesLicensed } from '@/lib/us-states';
import { timezoneLabel } from '@/lib/us-timezones';

export type OnboardingSideEffectClient = {
  id: string;
  name: string;
  clickup_task_id: string | null;
  ghl_contact_id: string | null;
};

function line(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  return `${label}: ${v || '—'}`;
}

export function formatOnboardingClickUpComment(
  input: OnboardingFormInput,
  client: Pick<OnboardingSideEffectClient, 'name' | 'id'>,
): string {
  const lines = [
    '✅ Onboarding form submitted',
    '',
    line('Client (Mr. Waiz)', client.name),
    line('Mr. Waiz ID', client.id),
    line('Role', obRoleToContactRole(input.ob_role)),
    line('Account management', input.account_management),
    '',
    '— Contact —',
    line('Email', input.email),
    line('Phone', input.phone),
    line('NMLS', input.nmls),
    line('States licensed', formatStatesLicensed(input.states_licensed)),
    line('Location', [input.city, input.state, input.zip_code].filter(Boolean).join(', ') || input.street_address),
    line('Timezone', timezoneLabel(input.timezone)),
    '',
    '— Company —',
    line('Brokerage / company', input.brokerage_name || input.legal_business_name),
  ];

  if (input.ob_role === 'owner') {
    lines.push(
      line('Legal name', input.legal_business_name),
      line('Website', input.website),
      line('Company NMLS', input.company_nmls),
      line(
        'Company address',
        [
          input.company_address.street,
          input.company_address.city,
          input.company_address.state,
          input.company_address.zip,
        ]
          .filter(Boolean)
          .join(', '),
      ),
      line('Company states', formatStatesLicensed(input.company_states_licensed)),
    );
  }

  lines.push(
    '',
    '— Landing page / creative —',
    line('Review URL', input.review_url),
    line('Bio', input.biography?.slice(0, 500) + (input.biography.length > 500 ? '…' : '')),
    line('Headshot', input.headshot_url),
  );

  if (input.additional_members.length) {
    lines.push('', '— Team members —');
    for (const m of input.additional_members) {
      lines.push(
        `• ${m.name} (${contactTypeLabel(m.contact_type)}) — ${m.email ?? ''} ${m.phone ?? ''}`.trim(),
      );
      if (m.nmls) lines.push(`  NMLS: ${m.nmls}`);
      if (m.states_licensed?.length) {
        lines.push(`  States: ${formatStatesLicensed(m.states_licensed)}`);
      }
    }
  }

  return lines.join('\n');
}

function fieldMapValues(input: OnboardingFormInput): Record<string, string> {
  const companyAddr = [
    input.company_address.street,
    input.company_address.city,
    input.company_address.state,
    input.company_address.zip,
  ]
    .filter(Boolean)
    .join(', ');

  return {
    email: input.email,
    phone: input.phone,
    nmls: input.nmls,
    brokerage_name: input.brokerage_name || input.legal_business_name,
    legal_business_name: input.legal_business_name,
    website: input.website,
    company_nmls: input.company_nmls,
    states_licensed: formatStatesLicensed(input.states_licensed),
    company_states_licensed: formatStatesLicensed(input.company_states_licensed),
    timezone: timezoneLabel(input.timezone),
    city: input.city,
    state: input.state,
    biography: input.biography,
    review_url: input.review_url ?? '',
    company_address: companyAddr,
    ob_role: obRoleToContactRole(input.ob_role),
  };
}

async function syncGhlOnboardingComplete(client: OnboardingSideEffectClient): Promise<boolean> {
  const contactId = client.ghl_contact_id?.trim();
  if (!contactId) {
    console.warn('[onboarding-side-effects] skip GHL — no ghl_contact_id on client', client.id);
    return false;
  }
  if (!getGhlApiToken()) {
    console.warn('[onboarding-side-effects] skip GHL — GHL_CS_API_TOKEN / GHL_API_TOKEN not set');
    return false;
  }

  const locationId = getGhlCsLocationId();
  if (!locationId) {
    console.warn('[onboarding-side-effects] skip GHL — GHL_CS_LOCATION_ID not set');
    return false;
  }

  await ghlAddContactTags(contactId, locationId, [GHL_OB_FORM_FILLED_TAG]);
  console.info('[onboarding-side-effects] GHL tag added:', GHL_OB_FORM_FILLED_TAG, contactId);
  return true;
}

async function syncClickUpOnboardingComplete(
  client: OnboardingSideEffectClient,
  input: OnboardingFormInput,
): Promise<boolean> {
  const taskId = client.clickup_task_id?.trim();
  if (!taskId) {
    console.warn('[onboarding-side-effects] skip ClickUp — no clickup_task_id on client', client.id);
    return false;
  }

  const token = getClickUpToken();
  if (!token) {
    console.warn('[onboarding-side-effects] skip ClickUp — CLICKUP_API_TOKEN not set');
    return false;
  }

  const status = process.env.CLICKUP_OB_TASK_STATUS?.trim();
  if (status) {
    await updateClickUpTask(taskId, token, { status });
  }

  const fieldMap = parseClickUpObFieldMap();
  const values = fieldMapValues(input);
  for (const [key, fieldId] of Object.entries(fieldMap)) {
    const val = values[key];
    if (val == null || val === '' || val === '—') continue;
    try {
      await setClickUpCustomField(taskId, fieldId, token, val);
    } catch (e) {
      console.error(`[onboarding-side-effects] ClickUp field ${key} failed`, e);
    }
  }

  const comment = formatOnboardingClickUpComment(input, client);
  await addClickUpTaskComment(taskId, token, comment);
  console.info('[onboarding-side-effects] ClickUp updated for task', taskId);
  return true;
}

async function notifyOpsSlack(
  service: SupabaseClient,
  text: string,
): Promise<void> {
  const slug = getSlackOpsChannelSlug();
  if (!isSlackConfigured()) {
    console.warn('[onboarding-side-effects] skip Slack — SLACK_BOT_TOKEN not set');
    return;
  }
  try {
    const result = await postToTeamChannel(service, slug, text);
    if (!result) {
      console.warn(`[onboarding-side-effects] skip Slack — no channel for slug "${slug}" (check Admin → Automations)`);
      return;
    }
    if (!result.ok) {
      console.error('[onboarding-side-effects] Slack failed', result.error);
      return;
    }
    console.info('[onboarding-side-effects] Slack ops alert sent to', slug);
  } catch (e) {
    console.error('[onboarding-side-effects] Slack failed', e);
  }
}

/** Slack ops alert when OB form cannot be matched to a client. GHL + ClickUp are not touched. */
export async function runOnboardingUnmappedNotification(
  service: SupabaseClient,
  input: OnboardingFormInput,
  params: { submission_id: string; match_count: number },
): Promise<void> {
  const text = formatOnboardingUnmappedSlackMessage({
    email: input.email,
    phone: input.phone,
    match_count: params.match_count,
    submission_id: params.submission_id,
    brokerage_name: input.brokerage_name || input.legal_business_name,
    nmls: input.nmls,
  });
  await notifyOpsSlack(service, text);
}

/** GHL tag + ClickUp — only after a matched client file. Slack ops alert included. Never throws. */
export async function runOnboardingSideEffects(
  client: OnboardingSideEffectClient,
  input: OnboardingFormInput,
  service?: SupabaseClient,
): Promise<void> {
  let ghlTagged = false;
  let clickupUpdated = false;

  try {
    ghlTagged = await syncGhlOnboardingComplete(client);
  } catch (e) {
    console.error('[onboarding-side-effects] GHL failed', e);
  }

  try {
    clickupUpdated = await syncClickUpOnboardingComplete(client, input);
  } catch (e) {
    console.error('[onboarding-side-effects] ClickUp failed', e);
  }

  if (service) {
    const text = formatOnboardingCompleteSlackMessage({
      client_name: client.name,
      email: input.email,
      phone: input.phone,
      primary_contact_name: input.legal_business_name || client.name,
      has_ghl_contact: !!client.ghl_contact_id?.trim(),
      ghl_tagged: ghlTagged,
      has_clickup_task: !!client.clickup_task_id?.trim(),
      clickup_updated: clickupUpdated,
    });
    await notifyOpsSlack(service, text);
  }
}
