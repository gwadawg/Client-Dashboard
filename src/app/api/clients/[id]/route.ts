import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError } from '@/lib/api-auth';
import { normalizeReportingType } from '@/lib/kpi-layouts';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;

  const { id } = await params;
  const body = await req.json();
  const allowed = ['name', 'is_live', 'reporting_type'];
  const updates: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) updates[k] = k === 'reporting_type' ? normalizeReportingType(body[k]) : body[k];

  const { data, error } = await ctx.service
    .from('clients')
    .update(updates)
    .eq('id', id)
    .select('id, name, is_live, reporting_type, share_token, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ client: data });
}
