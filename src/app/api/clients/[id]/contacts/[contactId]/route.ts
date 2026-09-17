import { NextResponse } from 'next/server';
import { getAuthContext, isAuthError, requireAnyPermission } from '@/lib/api-auth';
import {
  CLIENT_CONTACT_FIELDS,
  type ContactType,
  validateContactPatch,
} from '@/lib/client-contacts';
import { notifyMrWaizActivity, resolveClientName } from '@/lib/mr-waiz-activity-notify';

// PATCH /api/clients/[id]/contacts/[contactId] — update an additional contact.
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId, contactId } = await params;
  const body = await req.json();

  const { data: existing, error: fetchError } = await ctx.service
    .from('client_contacts')
    .select('id, contact_type, states_licensed')
    .eq('id', contactId)
    .eq('client_id', clientId)
    .single();

  if (fetchError) {
    const status = fetchError.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: fetchError.message }, { status });
  }

  const validated = validateContactPatch(body, {
    contact_type: existing.contact_type as ContactType,
    states_licensed: existing.states_licensed,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { data, error } = await ctx.service
    .from('client_contacts')
    .update({
      ...validated.updates,
      updated_at: new Date().toISOString(),
      updated_by: ctx.userId,
    })
    .eq('id', contactId)
    .eq('client_id', clientId)
    .select(CLIENT_CONTACT_FIELDS)
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const clientName = await resolveClientName(ctx.service, clientId);
  void notifyMrWaizActivity(ctx.service, {
    eventKey: 'client.contact_changed',
    actor: { userId: ctx.userId },
    fields: {
      action: 'updated',
      client_name: clientName,
      contact_name: data.name ?? null,
      role: data.contact_type ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
    },
  });

  return NextResponse.json({ contact: data });
}

// DELETE /api/clients/[id]/contacts/[contactId] — remove an additional contact.
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; contactId: string }> },
) {
  const ctx = await getAuthContext();
  if (isAuthError(ctx)) return ctx;
  const denied = requireAnyPermission(ctx, ['admin_clients', 'admin_billing']);
  if (denied) return denied;

  const { id: clientId, contactId } = await params;

  const { data: prior } = await ctx.service
    .from('client_contacts')
    .select(CLIENT_CONTACT_FIELDS)
    .eq('id', contactId)
    .eq('client_id', clientId)
    .maybeSingle();

  const { data, error } = await ctx.service
    .from('client_contacts')
    .delete()
    .eq('id', contactId)
    .eq('client_id', clientId)
    .select('id')
    .single();

  if (error) {
    const status = error.code === 'PGRST116' ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  const clientName = await resolveClientName(ctx.service, clientId);
  void notifyMrWaizActivity(ctx.service, {
    eventKey: 'client.contact_changed',
    actor: { userId: ctx.userId },
    fields: {
      action: 'removed',
      client_name: clientName,
      contact_name: prior?.name ?? null,
      role: prior?.contact_type ?? null,
      email: prior?.email ?? null,
      phone: prior?.phone ?? null,
    },
  });

  return NextResponse.json({ deleted: true, id: data.id });
}
