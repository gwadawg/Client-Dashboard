import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  CLIENT_CONTACT_FIELDS,
  validateContactInput,
} from '@/lib/client-contacts';

// GET /api/clients/[id]/contacts — list additional contacts for a client.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;

  const { data, error } = await ctx.service
    .from('client_contacts')
    .select(CLIENT_CONTACT_FIELDS)
    .eq('client_id', clientId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contacts: data ?? [] });
}

// POST /api/clients/[id]/contacts — add an additional contact.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId } = await params;
  const body = await req.json();
  const validated = validateContactInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { data: client, error: clientError } = await ctx.service
    .from('clients')
    .select('id')
    .eq('id', clientId)
    .single();

  if (clientError) {
    const status = clientError.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: clientError.message }, { status });
  }
  if (!client) {
    return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  }

  const sortOrder =
    typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)
      ? Math.trunc(body.sort_order)
      : 0;

  const { data, error } = await ctx.service
    .from('client_contacts')
    .insert({
      client_id: clientId,
      ...validated.data,
      sort_order: sortOrder,
      created_by: ctx.userId,
    })
    .select(CLIENT_CONTACT_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ contact: data });
}
