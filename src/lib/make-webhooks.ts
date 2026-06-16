/** Outbound Make.com webhooks for onboarding orchestration (emails, Slack). */

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

export async function notifyOnboardingComplete(payload: {
  client_id: string;
  client_name: string;
  email: string | null;
  phone: string | null;
  primary_contact_name: string | null;
}): Promise<void> {
  await postMakeWebhook('MAKE_ONBOARDING_COMPLETE_WEBHOOK_URL', {
    event: 'onboarding_complete',
    ...payload,
  });
}

export async function notifyLaunchComplete(payload: {
  client_id: string;
  client_name: string;
  launch_date: string;
  slack_id: string | null;
  submitted_by: string | null;
  checklist: Record<string, unknown>;
}): Promise<void> {
  await postMakeWebhook('MAKE_LAUNCH_COMPLETE_WEBHOOK_URL', {
    event: 'launch_complete',
    ...payload,
  });
}
