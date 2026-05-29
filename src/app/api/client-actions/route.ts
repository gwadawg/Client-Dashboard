import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';

const SELECT = '*';

export async function GET(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get('client_id');
  if (!clientId) {
    return NextResponse.json({ error: 'client_id is required' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('client_action_logs')
    .select(SELECT)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ actions: data ?? [] });
}

export async function POST(req: Request) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const body = await req.json();
  const {
    client_id,
    title,
    layer = null,
    constraint_label = null,
    change_description = null,
    hypothesis = null,
    baseline_snapshot_id = null,
    success_metric = null,
    baseline_value = null,
    target_value = null,
    status = 'planned',
    review_date = null,
    ai_generated = false,
  } = body ?? {};

  if (!client_id || !title) {
    return NextResponse.json({ error: 'client_id and title are required' }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('client_action_logs')
    .insert({
      client_id,
      created_by: ctx.userId,
      title,
      layer,
      constraint_label,
      change_description,
      hypothesis,
      baseline_snapshot_id,
      success_metric,
      baseline_value: baseline_value != null ? Number(baseline_value) : null,
      target_value: target_value != null ? Number(target_value) : null,
      status,
      review_date,
      ai_generated: Boolean(ai_generated),
    })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ action: data });
}
