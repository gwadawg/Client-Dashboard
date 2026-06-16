import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { CLIENT_CALL_FIELDS } from '@/lib/client-calls';
import { insertFormSubmission } from '@/lib/form-submissions';
import { isKickoffIncomplete } from '@/lib/kickoff';
import {
  getLaunchChecklistConfig,
  getFirstIncompleteItemKey,
  isLaunchChecklistComplete,
  isLaunchItemSatisfied,
  LAUNCH_CHECKLIST_ITEMS,
  LAUNCH_FINAL_CONFIRMATION,
  launchDraftToResponses,
  type LaunchFormDraft,
} from '@/lib/launch-form';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import { hasPermission } from '@/lib/permissions';
import { notifyLaunchComplete } from '@/lib/notifications';

const LAUNCH_PERMISSION_KEYS = ['admin_clients', 'admin_billing'];
const LAUNCH_LIFECYCLE_STATUSES = new Set(['new_account', 'onboarding']);

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function canUserCompleteLaunch(profile: {
  is_owner: boolean;
  allowed_permissions: string[] | null;
}): boolean {
  if (profile.is_owner) return true;
  if (profile.allowed_permissions === null) return true;
  return LAUNCH_PERMISSION_KEYS.some(key =>
    hasPermission(key, { isOwner: false, allowedPermissions: profile.allowed_permissions }),
  );
}

export async function listAssignableLaunchUsers(
  service: SupabaseClient,
): Promise<{ id: string; email: string }[]> {
  const { data: authData, error } = await service.auth.admin.listUsers();
  if (error || !authData?.users) return [];

  const { data: profiles } = await service
    .from('profiles')
    .select('id, is_owner, allowed_permissions');

  const profileMap = Object.fromEntries((profiles ?? []).map(p => [p.id, p]));

  return authData.users
    .filter(u => {
      const profile = profileMap[u.id];
      if (!profile) return false;
      return canUserCompleteLaunch(profile);
    })
    .map(u => ({ id: u.id, email: u.email ?? u.id }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

function parseLaunchDraft(body: Record<string, unknown>): LaunchFormDraft {
  const confirmations: Record<string, string> = {};
  const rawConfirmations = body.confirmations;
  if (rawConfirmations && typeof rawConfirmations === 'object') {
    for (const item of LAUNCH_CHECKLIST_ITEMS) {
      if (item.confirmType === 'type_yes') {
        const val = (rawConfirmations as Record<string, unknown>)[item.key];
        confirmations[item.key] = typeof val === 'string' ? val : '';
      }
    }
  } else {
    for (const item of LAUNCH_CHECKLIST_ITEMS) {
      if (item.confirmType === 'type_yes') confirmations[item.key] = '';
    }
  }

  const checklist: Record<string, boolean> = {};
  const rawChecklist = body.checklist;
  for (const item of LAUNCH_CHECKLIST_ITEMS) {
    checklist[item.key] =
      rawChecklist && typeof rawChecklist === 'object'
        ? !!(rawChecklist as Record<string, boolean>)[item.key]
        : false;
  }

  return {
    launch_date: optionalText(body.launch_date) ?? new Date().toISOString().slice(0, 10),
    completed_by_user_id: optionalText(body.completed_by_user_id) ?? '',
    completed_by_label: optionalText(body.completed_by_label) ?? '',
    notes: optionalText(body.notes) ?? '',
    checklist,
    confirmations,
    final_confirmation: typeof body.final_confirmation === 'string' ? body.final_confirmation : '',
  };
}

function validateLaunchDraft(
  draft: LaunchFormDraft,
  assignableUsers: { id: string; email: string }[],
): NextResponse | null {
  if (!draft.completed_by_user_id) {
    return NextResponse.json({ error: 'Select who completed this launch checklist' }, { status: 400 });
  }

  const assignable = assignableUsers.find(u => u.id === draft.completed_by_user_id);
  if (!assignable) {
    return NextResponse.json({ error: 'Invalid completed-by user' }, { status: 400 });
  }

  if (!draft.completed_by_label.trim()) {
    draft.completed_by_label = assignable.email;
  }

  if (draft.final_confirmation.trim().toUpperCase() !== LAUNCH_FINAL_CONFIRMATION) {
    return NextResponse.json(
      { error: `Type ${LAUNCH_FINAL_CONFIRMATION} to confirm go-live` },
      { status: 400 },
    );
  }

  if (!isLaunchChecklistComplete(draft)) {
    const incompleteKey = getFirstIncompleteItemKey(draft);
    const incompleteItem = LAUNCH_CHECKLIST_ITEMS.find(item => item.key === incompleteKey);
    const hint = incompleteItem
      ? incompleteItem.confirmType === 'type_yes'
        ? `"${incompleteItem.label}" requires typing yes and checking the box`
        : `"${incompleteItem.label}" must be confirmed`
      : 'All launch checklist items must be confirmed before going live';
    return NextResponse.json({ error: hint }, { status: 400 });
  }

  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, LAUNCH_PERMISSION_KEYS);
  if (denied) return denied;

  const { id: clientId } = await params;

  const [clientRes, launchSubRes, onboardingCallRes, assignableUsers] = await Promise.all([
    ctx.service
      .from('clients')
      .select('id, name, lifecycle_status, ghl_location_id, primary_contact_name, launch_date, slack_id')
      .eq('id', clientId)
      .single(),
    ctx.service
      .from('client_form_submissions')
      .select('id, submitted_at, responses')
      .eq('client_id', clientId)
      .eq('form_type', 'launch')
      .eq('status', 'applied')
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    ctx.service
      .from('client_calls')
      .select('id, recording_url')
      .eq('client_id', clientId)
      .eq('call_type', 'onboarding')
      .is('deleted_at', null)
      .order('called_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    listAssignableLaunchUsers(ctx.service),
  ]);

  if (clientRes.error) {
    const status = clientRes.error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientRes.error.message }, { status });
  }

  const kickoffIncomplete = isKickoffIncomplete(clientRes.data, onboardingCallRes.data);
  const defaultUser = assignableUsers.find(u => u.id === ctx.userId);

  return NextResponse.json({
    client: clientRes.data,
    kickoff_complete: !kickoffIncomplete,
    already_launched: !!launchSubRes.data,
    default_launch_date: clientRes.data.launch_date ?? new Date().toISOString().slice(0, 10),
    checklist_config: getLaunchChecklistConfig(),
    assignable_users: assignableUsers,
    default_completed_by: ctx.userId,
    default_completed_by_label: defaultUser?.email ?? ctx.userId,
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, LAUNCH_PERMISSION_KEYS);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json();
  const draft = parseLaunchDraft(body);

  const assignableUsers = await listAssignableLaunchUsers(ctx.service);
  const validationError = validateLaunchDraft(draft, assignableUsers);
  if (validationError) return validationError;

  const [clientRes, launchSubRes, onboardingCallRes] = await Promise.all([
    ctx.service
      .from('clients')
      .select('id, name, lifecycle_status, slack_id, launch_date, ghl_location_id, primary_contact_name')
      .eq('id', clientId)
      .single(),
    ctx.service
      .from('client_form_submissions')
      .select('id')
      .eq('client_id', clientId)
      .eq('form_type', 'launch')
      .eq('status', 'applied')
      .limit(1)
      .maybeSingle(),
    ctx.service
      .from('client_calls')
      .select('id, recording_url')
      .eq('client_id', clientId)
      .eq('call_type', 'onboarding')
      .is('deleted_at', null)
      .order('called_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (clientRes.error || !clientRes.data) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const client = clientRes.data;

  if (launchSubRes.data) {
    return NextResponse.json({ error: 'This client already has a completed launch checklist' }, { status: 409 });
  }

  if (!LAUNCH_LIFECYCLE_STATUSES.has(client.lifecycle_status)) {
    return NextResponse.json(
      { error: 'Launch is only available for clients in onboarding or new account status' },
      { status: 400 },
    );
  }

  if (isKickoffIncomplete(client, onboardingCallRes.data)) {
    return NextResponse.json(
      { error: 'Complete the kick-off call before launching (GHL mapping + OB recording required)' },
      { status: 400 },
    );
  }

  // Belt-and-suspenders: re-validate each item explicitly
  for (const item of LAUNCH_CHECKLIST_ITEMS) {
    if (!isLaunchItemSatisfied(item, draft)) {
      return NextResponse.json(
        { error: `Checklist item not satisfied: ${item.label}` },
        { status: 400 },
      );
    }
  }

  const responses = launchDraftToResponses(draft);
  const lifecycleStatus = 'active';
  const syncedLive = syncIsLiveWithLifecycle(lifecycleStatus, undefined);

  const { error: updateErr } = await ctx.service
    .from('clients')
    .update({
      lifecycle_status: lifecycleStatus,
      launch_date: draft.launch_date,
      ...(syncedLive !== undefined ? { is_live: syncedLive } : {}),
    })
    .eq('id', clientId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const now = new Date().toISOString();
  const { data: launchCall, error: callErr } = await ctx.service
    .from('client_calls')
    .insert({
      client_id: clientId,
      call_type: 'launch',
      called_at: now,
      disposition: 'completed',
      notes: draft.notes || 'Launch checklist completed',
      created_by: ctx.userId,
      updated_by: ctx.userId,
      updated_at: now,
    })
    .select(CLIENT_CALL_FIELDS)
    .single();
  if (callErr) return NextResponse.json({ error: callErr.message }, { status: 500 });

  const submission = await insertFormSubmission(ctx.service, {
    client_id: clientId,
    form_type: 'launch',
    status: 'applied',
    submitted_by: draft.completed_by_user_id,
    responses,
    applied_patch: {
      lifecycle_status: lifecycleStatus,
      launch_date: draft.launch_date,
    },
  });

  await notifyLaunchComplete(ctx.service, {
    client_id: clientId,
    client_name: client.name,
    launch_date: draft.launch_date,
    slack_id: client.slack_id,
    completed_by: draft.completed_by_label,
    responses,
  });

  return NextResponse.json({
    client_id: clientId,
    launch_call: launchCall,
    submission,
  });
}
