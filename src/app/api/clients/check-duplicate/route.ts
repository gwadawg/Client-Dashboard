import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  findClientConflicts,
  formatClientConflictMessage,
} from '@/lib/client-duplicate-check';

// GET /api/clients/check-duplicate?name=&email=&ghl_location_id=&primary_contact_name=&exclude_id=
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const params = new URL(req.url).searchParams;
  try {
    const result = await findClientConflicts(ctx.service, {
      name: params.get('name'),
      email: params.get('email'),
      ghl_location_id: params.get('ghl_location_id'),
      primary_contact_name: params.get('primary_contact_name'),
      excludeId: params.get('exclude_id'),
    });
    return NextResponse.json({
      blocked: result.blocked,
      conflicts: result.conflicts,
      message: result.blocked ? formatClientConflictMessage(result.conflicts) : null,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
