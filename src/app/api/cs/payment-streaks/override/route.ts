import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  isOverrideDisposition,
  isYearMonth,
} from '@/lib/payment-streak';

const PERMS = ['client_health', 'admin_clients', 'admin_billing'] as const;

export async function PUT(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...PERMS]);
  if (denied) return denied;

  let body: {
    client_id?: string;
    year_month?: string;
    disposition?: string;
    note?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const clientId = body.client_id;
  const yearMonth = body.year_month;
  const disposition = body.disposition;
  const note =
    body.note === undefined || body.note === null
      ? null
      : String(body.note).trim() || null;

  if (!clientId || typeof clientId !== 'string') {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }
  if (!yearMonth || !isYearMonth(yearMonth)) {
    return NextResponse.json({ error: 'year_month must be YYYY-MM' }, { status: 400 });
  }
  if (!isOverrideDisposition(disposition)) {
    return NextResponse.json(
      {
        error:
          'disposition must be paid | short | extension | unpaid | paused | churned',
      },
      { status: 400 },
    );
  }

  const { data: client, error: clientErr } = await ctx.service
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) {
    return NextResponse.json({ error: clientErr.message }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { data: existing } = await ctx.service
    .from('client_month_disposition_overrides')
    .select('id')
    .eq('client_id', clientId)
    .eq('year_month', yearMonth)
    .maybeSingle();

  let data;
  let error;
  if (existing?.id) {
    const res = await ctx.service
      .from('client_month_disposition_overrides')
      .update({
        disposition,
        note,
        updated_by: ctx.userId,
        updated_at: now,
      })
      .eq('id', existing.id)
      .select('id, client_id, year_month, disposition, note, updated_at')
      .single();
    data = res.data;
    error = res.error;
  } else {
    const res = await ctx.service
      .from('client_month_disposition_overrides')
      .insert({
        client_id: clientId,
        year_month: yearMonth,
        disposition,
        note,
        created_by: ctx.userId,
        updated_by: ctx.userId,
        updated_at: now,
      })
      .select('id, client_id, year_month, disposition, note, updated_at')
      .single();
    data = res.data;
    error = res.error;
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ override: data });
}

export async function DELETE(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, [...PERMS]);
  if (denied) return denied;

  const { searchParams } = new URL(req.url);
  let clientId = searchParams.get('client_id');
  let yearMonth = searchParams.get('year_month');

  if (!clientId || !yearMonth) {
    try {
      const body = await req.json();
      clientId = clientId ?? body.client_id ?? null;
      yearMonth = yearMonth ?? body.year_month ?? null;
    } catch {
      // body optional
    }
  }

  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }
  if (!yearMonth || !isYearMonth(yearMonth)) {
    return NextResponse.json({ error: 'year_month must be YYYY-MM' }, { status: 400 });
  }

  const { error } = await ctx.service
    .from('client_month_disposition_overrides')
    .delete()
    .eq('client_id', clientId)
    .eq('year_month', yearMonth);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
