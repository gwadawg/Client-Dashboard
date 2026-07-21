import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { CLIENT_CONTACT_FIELDS, validateContactInput } from '@/lib/client-contacts';
import { resolveTeamInvite } from '@/lib/team-invite';

function tokenFromRequest(req: Request, body?: Record<string, unknown>): string | null {
  const { searchParams } = new URL(req.url);
  const fromQuery = searchParams.get('token')?.trim();
  if (fromQuery) return fromQuery;
  if (body && typeof body.token === 'string') return body.token.trim() || null;
  return null;
}

// GET /api/onboard/team?token=… — resolve invite for the public form.
export async function GET(req: Request) {
  const token = tokenFromRequest(req);
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const service = createServiceClient();
  const invite = await resolveTeamInvite(service, token);
  if (!invite) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 });
  }

  return NextResponse.json({
    client_name: invite.client_name,
    primary_contact_name: invite.primary_contact_name,
  });
}

// POST /api/onboard/team — public submit; adds a row to client_contacts.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const token = tokenFromRequest(req, body);
  if (!token) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 });
  }

  const service = createServiceClient();
  const invite = await resolveTeamInvite(service, token);
  if (!invite) {
    return NextResponse.json({ error: 'Invalid or expired invite link' }, { status: 404 });
  }

  const validated = validateContactInput(body);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const { data, error } = await service
    .from('client_contacts')
    .insert({
      client_id: invite.client_id,
      ...validated.data,
      sort_order: 0,
    })
    .select(CLIENT_CONTACT_FIELDS)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    contact: data,
    client_name: invite.client_name,
  });
}
