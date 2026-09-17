import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import { getLatestChurnReasonsByClient } from '@/lib/form-submissions';
import { ReinstateClientError, reinstateClient } from '@/lib/reinstate-client';
import { parseReinstateDraftFromBody, reinstateValidationError } from '@/lib/reinstate-form';

const CHURNED_PICKER_FIELDS = 'id, name, email, offer, churned_at, mrr';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const q = new URL(req.url).searchParams.get('q')?.trim() ?? '';
  let query = ctx.service
    .from('clients')
    .select(CHURNED_PICKER_FIELDS)
    .eq('lifecycle_status', 'churned')
    .order('name');

  if (q) {
    const safe = q.replace(/[%_,()]/g, ' ').trim();
    if (safe) {
      query = query.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const clients = data ?? [];
  const clientIds = clients.map(c => c.id as string);
  let latestChurnReasons: Record<string, string> = {};
  if (clientIds.length > 0) {
    try {
      latestChurnReasons = await getLatestChurnReasonsByClient(ctx.service, clientIds);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  return NextResponse.json({
    clients: clients.map(c => ({
      ...c,
      latest_churn_reason: latestChurnReasons[c.id as string] ?? null,
    })),
  });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const draft = parseReinstateDraftFromBody(body as Record<string, unknown>);
  const error = reinstateValidationError(draft);
  if (error) return NextResponse.json({ error }, { status: 400 });

  try {
    const result = await reinstateClient(ctx.service, {
      draft,
      submittedBy: ctx.userId,
      appOrigin: process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin,
    });
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof ReinstateClientError) {
      return NextResponse.json({ error: e.message, ...(e.payload ?? {}) }, { status: e.status });
    }
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
