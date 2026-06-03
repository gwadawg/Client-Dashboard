import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requirePermission, requireAnyPermission } from '@/lib/api-auth';
import { normalizeReportingType } from '@/lib/kpi-layouts';

const DETAIL_FIELDS =
  'id, name, is_live, reporting_type, share_token, created_at, lifecycle_status, mrr, billing_type, launch_date, date_signed, contract_term_months, contract_end_date, performance_terms, billing_email, primary_contact';

// GET is intentionally open to any authenticated user: the client list powers
// the global client-filter dropdown on nearly every tab, so it is a shared
// lookup rather than admin-only data. Mutations below are gated to the admin tab.
//
// ?detail=1 returns the full client record plus a computed total_paid, for the
// Client Roster manager; that richer shape is gated to the admin tabs.
export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const detail = new URL(req.url).searchParams.get('detail');
  if (!detail) {
    const { data, error } = await ctx.service
      .from('clients')
      .select('id, name, is_live, reporting_type, share_token, created_at')
      .order('name');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ clients: data });
  }

  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const [clientsRes, paidRes] = await Promise.all([
    ctx.service.from('clients').select(DETAIL_FIELDS).order('name'),
    ctx.service.from('client_billings').select('client_id, amount_paid'),
  ]);
  if (clientsRes.error) return NextResponse.json({ error: clientsRes.error.message }, { status: 500 });
  if (paidRes.error) return NextResponse.json({ error: paidRes.error.message }, { status: 500 });

  const paidByClient = new Map<string, number>();
  for (const b of paidRes.data ?? []) {
    paidByClient.set(b.client_id, (paidByClient.get(b.client_id) ?? 0) + (Number(b.amount_paid) || 0));
  }

  const clients = (clientsRes.data ?? []).map(c => ({ ...c, total_paid: paidByClient.get(c.id) ?? 0 }));
  return NextResponse.json({ clients });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  // Allowed from the Client Roster (admin_clients) and the billing onboarding
  // flow (admin_billing).
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const body = await req.json();
  const { name, reporting_type } = body;
  if (!name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });

  const insert: Record<string, unknown> = {
    name: name.trim(),
    reporting_type: normalizeReportingType(reporting_type),
  };
  const numericFields = new Set(['mrr', 'contract_term_months', 'daily_adspend']);
  const optional = [
    'is_live', 'lifecycle_status', 'mrr', 'billing_type', 'launch_date',
    'date_signed', 'contract_end_date', 'contract_term_months', 'daily_adspend',
    'performance_terms', 'billing_email', 'primary_contact',
  ] as const;
  for (const k of optional) {
    if (!(k in body)) continue;
    if (numericFields.has(k)) insert[k] = body[k] === '' || body[k] === null ? null : Number(body[k]);
    else insert[k] = body[k] === '' ? null : body[k];
  }

  const { data, error } = await ctx.service
    .from('clients')
    .insert(insert)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}

export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requirePermission(ctx, 'admin_clients');
  if (denied) return denied;

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await ctx.service.from('clients').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
