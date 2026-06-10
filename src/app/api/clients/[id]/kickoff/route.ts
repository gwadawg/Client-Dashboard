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
  KICKOFF_CLIENT_FIELDS,
  isKickoffIncomplete,
  type KickoffClient,
} from '@/lib/kickoff';
import { normalizeStatesLicensed } from '@/lib/us-states';

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

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id } = await params;
  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  const includeRevenue = canViewClientRevenue(subject);

  const [clientRes, onboardingCall] = await Promise.all([
    ctx.service.from('clients').select(KICKOFF_CLIENT_FIELDS).eq('id', id).single(),
    findOnboardingCall(ctx.service, id),
  ]);

  if (clientRes.error) {
    const status = clientRes.error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientRes.error.message }, { status });
  }

  const client = includeRevenue
    ? (clientRes.data as KickoffClient)
    : (redactClientMoneyFields(clientRes.data) as KickoffClient);

  return NextResponse.json({
    client,
    onboarding_call: onboardingCall,
    kickoff_complete: !isKickoffIncomplete(client, onboardingCall),
    can_view_revenue: includeRevenue,
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
  let ghlLocationId = optionalText(body.ghl_location_id);
  let recordingUrl = optionalText(body.recording_url);

  if (!includeRevenue && body.daily_adspend != null && body.daily_adspend !== '') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: existingClient, error: clientError } = await ctx.service
    .from('clients')
    .select('id, lifecycle_status, ghl_location_id')
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
    if (!ghlLocationId) {
      return NextResponse.json({ error: 'Client GHL Location ID is required' }, { status: 400 });
    }
    if (!recordingUrl) {
      return NextResponse.json({ error: 'OB call recording link is required' }, { status: 400 });
    }
  }

  const updates: Record<string, unknown> = {
    phone: optionalText(body.phone),
    contact_role: optionalText(body.contact_role),
    states_licensed: normalizeStatesLicensed(body.states_licensed),
    nmls: optionalText(body.nmls),
    brokerage_name: optionalText(body.brokerage_name),
    timezone: optionalText(body.timezone),
    appointment_settings: optionalText(body.appointment_settings),
    facebook_page_name: optionalText(body.facebook_page_name),
    phone_notifications: optionalText(body.phone_notifications),
    phone_live_transfer: optionalText(body.phone_live_transfer),
    live_transfer_approved: parseLiveTransferApproved(body.live_transfer_approved),
  };

  if (ghlLocationId) updates.ghl_location_id = ghlLocationId;

  if (includeRevenue) {
    updates.daily_adspend = parseDailyAdspend(body.daily_adspend);
  }

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

  return NextResponse.json({
    client: redactedClient,
    onboarding_call: onboardingCall,
    kickoff_complete: !isKickoffIncomplete(kickoffClient, onboardingCall),
    saved_mode: saveMode,
  });
}
