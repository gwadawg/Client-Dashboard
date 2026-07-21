import { randomBytes } from 'crypto';
import { getAppBaseUrl } from '@/lib/app-url';
import type { createServiceClient } from '@/lib/supabase';

type Service = ReturnType<typeof createServiceClient>;

export function generateTeamInviteToken(): string {
  return randomBytes(24).toString('base64url');
}

export function buildTeamInviteUrl(token: string, baseUrl = getAppBaseUrl()): string {
  const base = baseUrl.replace(/\/$/, '');
  return `${base}/onboard/team/${encodeURIComponent(token)}`;
}

export async function ensureTeamInviteToken(
  service: Service,
  clientId: string,
): Promise<{ token: string; url: string; created: boolean }> {
  const { data: existing, error: readError } = await service
    .from('clients')
    .select('id, team_invite_token')
    .eq('id', clientId)
    .single();

  if (readError) {
    const status = readError.code === 'PGRST116' ? 404 : 500;
    throw Object.assign(new Error(readError.message), { status });
  }
  if (!existing) {
    throw Object.assign(new Error('Client not found'), { status: 404 });
  }

  if (existing.team_invite_token) {
    return {
      token: existing.team_invite_token,
      url: buildTeamInviteUrl(existing.team_invite_token),
      created: false,
    };
  }

  const token = generateTeamInviteToken();
  const { error: writeError } = await service
    .from('clients')
    .update({ team_invite_token: token })
    .eq('id', clientId)
    .is('team_invite_token', null);

  if (writeError) {
    // Race: another request may have set the token — re-read.
    const { data: again } = await service
      .from('clients')
      .select('team_invite_token')
      .eq('id', clientId)
      .single();
    if (again?.team_invite_token) {
      return {
        token: again.team_invite_token,
        url: buildTeamInviteUrl(again.team_invite_token),
        created: false,
      };
    }
    throw Object.assign(new Error(writeError.message), { status: 500 });
  }

  return { token, url: buildTeamInviteUrl(token), created: true };
}

export async function rotateTeamInviteToken(
  service: Service,
  clientId: string,
): Promise<{ token: string; url: string }> {
  const token = generateTeamInviteToken();
  const { data, error } = await service
    .from('clients')
    .update({ team_invite_token: token })
    .eq('id', clientId)
    .select('id')
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    throw Object.assign(new Error(error.message), { status });
  }
  if (!data) {
    throw Object.assign(new Error('Client not found'), { status: 404 });
  }

  return { token, url: buildTeamInviteUrl(token) };
}

export async function resolveTeamInvite(
  service: Service,
  token: string,
): Promise<{ client_id: string; client_name: string; primary_contact_name: string | null } | null> {
  const trimmed = token.trim();
  if (!trimmed) return null;

  const { data, error } = await service
    .from('clients')
    .select('id, name, primary_contact_name, primary_contact')
    .eq('team_invite_token', trimmed)
    .maybeSingle();

  if (error || !data) return null;

  return {
    client_id: data.id,
    client_name: data.name,
    primary_contact_name: data.primary_contact_name || data.primary_contact || null,
  };
}
