import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { buildContactKey } from '@/lib/contact-key';
import { resolveLoanLogToken } from '@/lib/loan-log-form';

const INVALID = 'This link isn’t valid. Ask your Waiz contact for a new one.';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const service = createServiceClient();
  const client = await resolveLoanLogToken(service, decodeURIComponent(token));
  if (!client) {
    return NextResponse.json({ error: INVALID }, { status: 404 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (q.length < 2) {
    return NextResponse.json({ leads: [] });
  }

  const safe = q.replace(/[%_,]/g, ' ').trim();
  const { data, error } = await service
    .from('events')
    .select('lead_name, lead_phone, ghl_contact_id, occurred_at')
    .eq('client_id', client.client_id)
    .not('lead_name', 'is', null)
    .ilike('lead_name', `%${safe}%`)
    .order('occurred_at', { ascending: false })
    .limit(80);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const seen = new Set<string>();
  const leads: { lead_name: string; lead_phone: string; ghl_contact_id: string }[] = [];
  for (const row of data ?? []) {
    const name = typeof row.lead_name === 'string' ? row.lead_name.trim() : '';
    if (!name) continue;
    const phone = typeof row.lead_phone === 'string' ? row.lead_phone : '';
    const ghl = typeof row.ghl_contact_id === 'string' ? row.ghl_contact_id : '';
    const key = buildContactKey(client.client_id, phone, ghl || null);
    if (key.endsWith(':unknown') && !ghl) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    leads.push({
      lead_name: name,
      lead_phone: phone,
      ghl_contact_id: ghl || buildContactKey(client.client_id, phone),
    });
    if (leads.length >= 12) break;
  }

  return NextResponse.json({ leads });
}
