import { NextResponse } from 'next/server';
import { validateWebhookSecret } from '@/lib/api-auth';
import { createServiceClient } from '@/lib/supabase';

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

// PATCH /api/admin/clients/[id] — integration updates from Make (slack_id, onboarding task id).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json();
  const updates: Record<string, unknown> = {};

  const slackId = optionalText(body.slack_id) ?? optionalText(body.slackId);
  if (slackId) updates.slack_id = slackId;

  const onboardingClickUpId =
    optionalText(body.onboarding_clickup_task_id) ??
    optionalText(body.clickup_task_id) ??
    optionalText(body.clickup_id);
  if (onboardingClickUpId) updates.onboarding_clickup_task_id = onboardingClickUpId;

  const ghlLocationId =
    optionalText(body.ghl_location_id) ??
    optionalText(body.location_id);
  if (ghlLocationId) updates.ghl_location_id = ghlLocationId;

  const subAccountName =
    optionalText(body.sub_account_name) ??
    optionalText(body.ghl_subaccount_name) ??
    optionalText(body.name);
  if (subAccountName) updates.name = subAccountName;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No integration fields provided' }, { status: 400 });
  }

  const service = createServiceClient();
  const { data, error } = await service
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select('id, name, slack_id, onboarding_clickup_task_id, clickup_task_id, ghl_location_id')
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ client: data });
}
