import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { CLIENT_CALL_FIELDS } from '@/lib/client-calls';
import {
  canViewClientRevenue,
  redactClientMoneyFields,
} from '@/lib/client-revenue-access';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import {
  getOnboardingFormProfile,
  isClientVerticalConfirmed,
  resolveServiceProgramForSave,
  validateKickoffClassification,
} from '@/lib/onboarding-form-profile';
import {
  KICKOFF_CLIENT_FIELDS,
  getKickoffConfig,
  isKickoffFieldVisible,
  isKickoffIncomplete,
  kickoffDraftFromClient,
  kickoffExtraFieldsFromDraft,
  type KickoffClient,
  type KickoffDraft,
} from '@/lib/kickoff';
import { insertFormSubmission } from '@/lib/form-submissions';
import { normalizeReportingType } from '@/lib/reporting-types';
import { normalizeStatesLicensed } from '@/lib/us-states';
import {
  findClientConflicts,
  formatClientConflictMessage,
} from '@/lib/client-duplicate-check';
import { replayPendingForClientId } from '@/lib/pending-events';
import { clientNeedsGhlMapping } from '@/lib/client-ghl-mapping';

function optionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function parseDailyAdspend(value: unknown): number | null {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(n) ? n : null;
}

function parseLiveTransferApproved(value: unknown): boolean | null {
  if (value === true || value === 'yes') return true;
  if (value === false || value === 'no') return false;
  return null;
}

async function findOnboardingCall(service: SupabaseClient, clientId: string) {
  const { data } = await service
    .from('client_calls')
    .select('id, recording_url, called_at')
    .eq('client_id', clientId)
    .eq('call_type', 'onboarding')
    .is('deleted_at', null)
    .order('called_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

async function findLatestKickoffVerticalConfirmed(
  service: SupabaseClient,
  clientId: string,
): Promise<boolean> {
  const { data } = await service
    .from('client_form_submissions')
    .select('responses')
    .eq('client_id', clientId)
    .eq('form_type', 'kickoff')
    .eq('status', 'applied')
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const responses = data?.responses as Record<string, unknown> | undefined;
  return responses?.vertical_confirmed === true;
}

function draftFromBody(body: Record<string, unknown>): KickoffDraft {
  return {
    reporting_type: normalizeReportingType(body.reporting_type),
    service_program: (optionalText(body.service_program) as KickoffDraft['service_program']) || '',
    vertical_confirmed: body.vertical_confirmed === true,
    sub_account_name: optionalText(body.sub_account_name) ?? '',
    phone: optionalText(body.phone) ?? '',
    contact_role: optionalText(body.contact_role) ?? '',
    states_licensed: normalizeStatesLicensed(body.states_licensed) ?? [],
    nmls: optionalText(body.nmls) ?? '',
    brokerage_name: optionalText(body.brokerage_name) ?? '',
    timezone: optionalText(body.timezone) ?? '',
    appointment_settings: optionalText(body.appointment_settings) ?? '',
    daily_adspend: body.daily_adspend != null ? String(body.daily_adspend) : '',
    facebook_page_name: optionalText(body.facebook_page_name) ?? '',
    phone_notifications: optionalText(body.phone_notifications) ?? '',
    phone_live_transfer: optionalText(body.phone_live_transfer) ?? '',
    live_transfer_approved:
      body.live_transfer_approved === true || body.live_transfer_approved === 'yes'
        ? 'yes'
        : body.live_transfer_approved === false || body.live_transfer_approved === 'no'
          ? 'no'
          : '',
    ghl_location_id: optionalText(body.ghl_location_id) ?? '',
    recording_url: optionalText(body.recording_url) ?? '',
    advance_lifecycle: body.advance_lifecycle !== false,
    pm_landing_copy: optionalText(body.pm_landing_copy) ?? '',
    pm_brand_assets: optionalText(body.pm_brand_assets) ?? '',
    pm_compliance_notes: optionalText(body.pm_compliance_notes) ?? '',
    pm_competitor_refs: optionalText(body.pm_competitor_refs) ?? '',
    pm_funnel_requirements: optionalText(body.pm_funnel_requirements) ?? '',
    cc_lead_source: optionalText(body.cc_lead_source) ?? '',
    cc_qualification_criteria: optionalText(body.cc_qualification_criteria) ?? '',
    cc_hp_tag_user: optionalText(body.cc_hp_tag_user) ?? '',
    cc_setter_notes: optionalText(body.cc_setter_notes) ?? '',
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);

  const [clientRes, onboardingCall, priorKickoffConfirmed] = await Promise.all([
    ctx.service.from('clients').select(KICKOFF_CLIENT_FIELDS).eq('id', id).single(),
    findOnboardingCall(ctx.service, id),
    findLatestKickoffVerticalConfirmed(ctx.service, id),
  ]);

  if (clientRes.error) {
    const status = clientRes.error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientRes.error.message }, { status });
  }

  const rawClient = clientRes.data as KickoffClient;
  const verticalConfirmed = isClientVerticalConfirmed({
    reporting_type: rawClient.reporting_type,
    offer: rawClient.offer,
    service_program: rawClient.service_program,
    vertical_confirmed: priorKickoffConfirmed,
  });

  const client = includeRevenue
    ? rawClient
    : (redactClientMoneyFields(rawClient) as KickoffClient);

  const formProfile = getOnboardingFormProfile(client.reporting_type, client.service_program);

  return NextResponse.json({
    client,
    onboarding_call: onboardingCall,
    kickoff_complete: !isKickoffIncomplete(client, onboardingCall),
    can_view_revenue: includeRevenue,
    vertical_confirmed: verticalConfirmed,
    form_profile: formProfile,
    kickoff_config: getKickoffConfig(formProfile, includeRevenue),
  });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json();
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);

  const saveMode = body.save_mode === 'progress' ? 'progress' : 'complete';
  const draft = draftFromBody(body);
  const formProfile = getOnboardingFormProfile(draft.reporting_type, draft.service_program);

  const classificationError = validateKickoffClassification(
    draft.reporting_type,
    draft.service_program,
    saveMode,
  );
  if (classificationError) {
    return NextResponse.json({ error: classificationError }, { status: 400 });
  }

  if (saveMode === 'complete' && !draft.vertical_confirmed) {
    return NextResponse.json(
      { error: 'Confirm client vertical before completing kick-off' },
      { status: 400 },
    );
  }

  let ghlLocationId = optionalText(body.ghl_location_id);
  let recordingUrl = optionalText(body.recording_url);
  const subAccountName = optionalText(body.sub_account_name);

  if (!includeRevenue && body.daily_adspend != null && body.daily_adspend !== '') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: existingClient, error: clientError } = await ctx.service
    .from('clients')
    .select('id, name, primary_contact_name, lifecycle_status, ghl_location_id')
    .eq('id', clientId)
    .single();

  if (clientError) {
    const status = clientError.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientError.message }, { status });
  }
  if (!existingClient) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const existingOnboardingCall = await findOnboardingCall(ctx.service, clientId);

  if (saveMode === 'complete') {
    ghlLocationId = ghlLocationId ?? optionalText(existingClient.ghl_location_id);
    recordingUrl = recordingUrl ?? optionalText(existingOnboardingCall?.recording_url);
    const effectiveSubName = subAccountName ?? optionalText(existingClient.name);
    if (!effectiveSubName || clientNeedsGhlMapping({ ...existingClient, name: effectiveSubName })) {
      return NextResponse.json(
        { error: 'GHL sub-account name is required (copy exact name from GHL — not the person name).' },
        { status: 400 },
      );
    }
    if (!ghlLocationId) {
      return NextResponse.json({ error: 'Client GHL Location ID is required' }, { status: 400 });
    }
    if (!recordingUrl) {
      return NextResponse.json({ error: 'OB call recording link is required' }, { status: 400 });
    }
  }

  if (subAccountName) {
    const conflicts = await findClientConflicts(ctx.service, {
      name: subAccountName,
      excludeId: clientId,
    });
    if (conflicts.blocked) {
      return NextResponse.json(
        { error: formatClientConflictMessage(conflicts.conflicts), conflicts: conflicts.conflicts },
        { status: 409 },
      );
    }
  }

  const updates: Record<string, unknown> = {
    reporting_type: draft.reporting_type,
    service_program: resolveServiceProgramForSave(draft.reporting_type, draft.service_program),
    phone: optionalText(body.phone),
    contact_role: optionalText(body.contact_role),
    states_licensed: normalizeStatesLicensed(body.states_licensed),
    nmls: optionalText(body.nmls),
    brokerage_name: optionalText(body.brokerage_name),
    timezone: optionalText(body.timezone),
  };

  if (isKickoffFieldVisible('appointment_settings', formProfile, includeRevenue)) {
    updates.appointment_settings = optionalText(body.appointment_settings);
  }
  if (isKickoffFieldVisible('facebook_page_name', formProfile, includeRevenue)) {
    updates.facebook_page_name = optionalText(body.facebook_page_name);
  }
  if (isKickoffFieldVisible('phone_notifications', formProfile, includeRevenue)) {
    updates.phone_notifications = optionalText(body.phone_notifications);
  }
  if (isKickoffFieldVisible('phone_live_transfer', formProfile, includeRevenue)) {
    updates.phone_live_transfer = optionalText(body.phone_live_transfer);
    updates.live_transfer_approved = parseLiveTransferApproved(body.live_transfer_approved);
  }
  if (includeRevenue && isKickoffFieldVisible('daily_adspend', formProfile, includeRevenue)) {
    updates.daily_adspend = parseDailyAdspend(body.daily_adspend);
  }

  if (ghlLocationId) updates.ghl_location_id = ghlLocationId;
  if (subAccountName) updates.name = subAccountName;

  if (saveMode === 'complete') {
    const advanceLifecycle = body.advance_lifecycle !== false;
    if (advanceLifecycle && existingClient.lifecycle_status === 'new_account') {
      updates.lifecycle_status = 'onboarding';
      const syncedLive = syncIsLiveWithLifecycle('onboarding', undefined);
      if (syncedLive !== undefined) updates.is_live = syncedLive;
    }
  }

  const { data: client, error: updateError } = await ctx.service
    .from('clients')
    .update(updates)
    .eq('id', clientId)
    .select(KICKOFF_CLIENT_FIELDS)
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  let onboardingCall = existingOnboardingCall;

  if (saveMode === 'complete' && recordingUrl) {
    const now = new Date().toISOString();
    const calledAt =
      typeof body.called_at === 'string' && body.called_at.trim()
        ? new Date(body.called_at).toISOString()
        : now;

    if (existingOnboardingCall) {
      const { data, error } = await ctx.service
        .from('client_calls')
        .update({
          recording_url: recordingUrl,
          disposition: 'completed',
          updated_by: ctx.userId,
          updated_at: now,
        })
        .eq('id', existingOnboardingCall.id)
        .select(CLIENT_CALL_FIELDS)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      onboardingCall = data;
    } else {
      const { data, error } = await ctx.service
        .from('client_calls')
        .insert({
          client_id: clientId,
          call_type: 'onboarding',
          called_at: calledAt,
          recording_url: recordingUrl,
          disposition: 'completed',
          created_by: ctx.userId,
          updated_by: ctx.userId,
          updated_at: now,
        })
        .select(CLIENT_CALL_FIELDS)
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      onboardingCall = data;
    }
  }

  const redactedClient = includeRevenue ? client : redactClientMoneyFields(client);
  const kickoffClient = redactedClient as KickoffClient;

  let pending_replay = { replayed: 0, skipped: 0, failed: 0, errors: [] as string[] };
  if (subAccountName || ghlLocationId) {
    try {
      pending_replay = await replayPendingForClientId(ctx.service, clientId);
    } catch (e) {
      console.error('[kickoff] pending replay failed', e);
    }
  }

  if (saveMode === 'complete') {
    try {
      const extraFields = kickoffExtraFieldsFromDraft(formProfile, draft);
      await insertFormSubmission(ctx.service, {
        client_id: clientId,
        form_type: 'kickoff',
        status: 'applied',
        submitted_by: ctx.userId,
        responses: {
          ...extraFields,
          reporting_type: draft.reporting_type,
          service_program: resolveServiceProgramForSave(draft.reporting_type, draft.service_program),
          form_profile: formProfile,
          vertical_confirmed: draft.vertical_confirmed,
          sub_account_name: subAccountName,
          ghl_location_id: ghlLocationId,
          recording_url: recordingUrl,
        },
        applied_patch: updates,
      });
    } catch (e) {
      console.error('[kickoff] form submission log failed', e);
    }
  }

  const verticalConfirmed = isClientVerticalConfirmed({
    reporting_type: kickoffClient.reporting_type,
    offer: kickoffClient.offer,
    service_program: kickoffClient.service_program,
    vertical_confirmed: draft.vertical_confirmed,
  });

  return NextResponse.json({
    client: redactedClient,
    onboarding_call: onboardingCall,
    kickoff_complete: !isKickoffIncomplete(kickoffClient, onboardingCall),
    saved_mode: saveMode,
    pending_replay,
    vertical_confirmed: verticalConfirmed,
    form_profile: formProfile,
    kickoff_config: getKickoffConfig(formProfile, includeRevenue),
  });
}
