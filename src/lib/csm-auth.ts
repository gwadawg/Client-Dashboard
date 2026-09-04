import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { createServiceClient } from './supabase';
import { getAuthContext, isAuthError, type AuthContext } from './api-auth';
import { requireCsmApiAccess } from './csm-api';

/** SHA-256 hex of the plaintext Bearer token. */
export function hashCsmApiToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateCsmApiToken(): string {
  return `csm_${randomBytes(32).toString('base64url')}`;
}

/**
 * Auth for /api/csm/* —
 * 1) Authorization: Bearer <csm_…> matched to profiles.csm_api_token_hash
 * 2) else normal session cookie via getAuthContext
 */
export async function getCsmAuthContext(req: Request): Promise<AuthContext | NextResponse> {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith('csm_') && token.length > 20) {
      const hash = hashCsmApiToken(token);
      const service = createServiceClient();
      const { data: profile, error } = await service
        .from('profiles')
        .select('id, is_owner, is_admin, allowed_permissions')
        .eq('csm_api_token_hash', hash)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: 'Auth lookup failed' }, { status: 500 });
      }
      if (!profile) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      return {
        userId: profile.id,
        isOwner: profile.is_owner ?? false,
        isAdmin: profile.is_admin ?? false,
        allowedPermissions: (profile.allowed_permissions ?? null) as AuthContext['allowedPermissions'],
        service,
      };
    }
  }

  return getAuthContext();
}

/** @deprecated use requireCsmApiAccess from csm-api */
export function requireCsmBriefAccess(ctx: AuthContext): NextResponse | null {
  return requireCsmApiAccess(ctx);
}

export function assertCsmAuth(ctx: AuthContext | NextResponse): ctx is AuthContext {
  return !isAuthError(ctx);
}
