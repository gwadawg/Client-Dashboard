import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { canViewClientRevenue } from '@/lib/client-revenue-access';
import {
  findClientConflicts,
  formatClientConflictMessage,
} from '@/lib/client-duplicate-check';
import { createOfferForAccount } from '@/lib/client-account-groups';
import { replayPendingForClientId } from '@/lib/pending-events';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const subject = { isOwner: ctx.isOwner, allowedPermissions: ctx.allowedPermissions };
  if (!canViewClientRevenue(subject)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: originClientId } = await params;
  const body = await req.json();

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name (sub-account name) is required' }, { status: 400 });
  }
  if (!body.reporting_type) {
    return NextResponse.json({ error: 'reporting_type is required' }, { status: 400 });
  }

  try {
    const conflicts = await findClientConflicts(ctx.service, {
      name: String(body.name).trim(),
      ghl_location_id: body.ghl_location_id ?? null,
    });
    if (conflicts.blocked) {
      return NextResponse.json(
        { error: formatClientConflictMessage(conflicts.conflicts), conflicts: conflicts.conflicts },
        { status: 409 },
      );
    }

    const lifecycle = body.lifecycle_status ?? 'new_account';
    const { client, engagement_kind } = await createOfferForAccount(ctx.service, {
      origin_client_id: originClientId,
      name: String(body.name).trim(),
      reporting_type: body.reporting_type,
      engagement_kind: body.engagement_kind,
      sales_package: body.sales_package,
      ghl_location_id: body.ghl_location_id,
      mrr: body.mrr === '' || body.mrr == null ? null : Number(body.mrr),
      billing_type: body.billing_type,
      billing_day: body.billing_day === '' || body.billing_day == null ? null : Number(body.billing_day),
      lifecycle_status: lifecycle,
      launch_date: body.launch_date || null,
      date_signed: body.date_signed || null,
      logged_by: ctx.userId,
      acquisition_close_id: body.acquisition_close_id ?? null,
    });

    let pending_replay = { replayed: 0, skipped: 0, failed: 0, errors: [] as string[] };
    try {
      pending_replay = await replayPendingForClientId(ctx.service, client.id as string);
    } catch (e) {
      console.error('[add-offer] pending replay failed', e);
    }

    return NextResponse.json({ client, engagement_kind, pending_replay });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
