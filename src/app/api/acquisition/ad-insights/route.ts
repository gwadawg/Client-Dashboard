import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';

type JsonObject = Record<string, unknown>;

function str(payload: JsonObject, key: string): string | null {
  const v = payload[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function num(payload: JsonObject, key: string, fallback = 0): number {
  const v = payload[key];
  if (v == null || v === '') return fallback;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : fallback;
}

function insightDate(payload: JsonObject): string | null {
  const value = str(payload, 'date') ?? str(payload, 'insight_date') ?? str(payload, 'date_start');
  if (!value) return null;
  const dateOnly = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(dateOnly) ? dateOnly : null;
}

export async function POST(req: NextRequest) {
  if (!validateWebhookSecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const p = payload as JsonObject;
  const date = insightDate(p);
  if (!date) return NextResponse.json({ error: 'date required as YYYY-MM-DD' }, { status: 400 });

  const adset_name = str(p, 'adset_name') ?? str(p, 'adset') ?? '';
  const ad_name = str(p, 'ad_name') ?? str(p, 'ad') ?? '';
  const spend = num(p, 'amount_spent') || num(p, 'spend');
  const adsetKey = `${adset_name}:${ad_name}`;

  // Legacy thin webhook — upsert into full insights table with synthetic IDs.
  const row = {
    insight_date: date,
    account_id: str(p, 'account_id') ?? 'import',
    campaign_id: str(p, 'campaign_id') ?? `legacy:${adsetKey}`,
    campaign_name: str(p, 'campaign_name'),
    adset_id: str(p, 'adset_id') ?? `legacy-adset:${adsetKey}`,
    adset_name,
    ad_id: str(p, 'ad_id') ?? `legacy-ad:${adsetKey}`,
    ad_name,
    spend,
    impressions: Math.trunc(num(p, 'impressions')),
    clicks: Math.trunc(num(p, 'unique_outbound_clicks') || num(p, 'clicks')),
    cpm: num(p, 'cpm') || null,
    raw: p,
    updated_at: new Date().toISOString(),
  };

  const service = createServiceClient();
  const { data, error } = await service
    .from('acquisition_meta_ad_insights')
    .upsert(row, { onConflict: 'insight_date,account_id,campaign_id,adset_id,ad_id' })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
