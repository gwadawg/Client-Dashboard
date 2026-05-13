import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';

export async function POST(req: Request) {
  try {
    if (!validateWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = await req.json();
    const { date, platform, amount } = payload;
    const service = createServiceClient();

    if (!date || !platform || amount === undefined) {
      return NextResponse.json({ error: 'date, platform, and amount are required' }, { status: 400 });
    }
    if (!['meta', 'google', 'local_services'].includes(platform)) {
      return NextResponse.json({ error: 'platform must be "meta", "google", or "local_services"' }, { status: 400 });
    }

    let client_id = payload.client_id as string | undefined;

    if (!client_id && payload.client_name) {
      const { data: client } = await service
        .from('clients')
        .select('id')
        .eq('name', payload.client_name)
        .single();
      if (!client) {
        return NextResponse.json({ error: `Client "${payload.client_name}" not found` }, { status: 400 });
      }
      client_id = client.id;
    }

    if (!client_id) {
      return NextResponse.json({ error: 'client_id or client_name is required' }, { status: 400 });
    }

    const { error } = await service.from('ad_spend').upsert(
      { client_id, spend_date: date, platform, amount: Number(amount) },
      { onConflict: 'client_id,spend_date,platform' }
    );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
