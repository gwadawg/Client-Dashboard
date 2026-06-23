import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase';
import { validateWebhookSecret } from '@/lib/api-auth';

type JsonObject = Record<string, unknown>;

function stringField(payload: JsonObject, key: string): string | null {
  const value = payload[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function numberField(payload: JsonObject, key: string, fallback = 0): number {
  const value = payload[key];
  if (value == null || value === '') return fallback;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : fallback;
}

function nullableNumberField(payload: JsonObject, key: string): number | null {
  const value = payload[key];
  if (value == null || value === '') return null;
  const number = typeof value === 'number' ? value : Number(String(value).trim());
  return Number.isFinite(number) ? number : null;
}

function jsonField(payload: JsonObject, key: string): unknown | null {
  const value = payload[key];
  if (value == null || value === '') return null;
  return value;
}

function insightDate(payload: JsonObject): string | null {
  const value =
    stringField(payload, 'date') ??
    stringField(payload, 'insight_date') ??
    stringField(payload, 'date_start');

  if (!value) return null;

  const dateOnly = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return null;
  if (Number.isNaN(Date.parse(`${dateOnly}T00:00:00.000Z`))) return null;
  return dateOnly;
}

function buildRow(payload: JsonObject): { row: Record<string, unknown> } | { error: string } {
  const date = insightDate(payload);
  if (!date) return { error: 'date, insight_date, or date_start is required as YYYY-MM-DD' };

  const accountId = stringField(payload, 'account_id');
  const campaignId = stringField(payload, 'campaign_id');
  const adsetId = stringField(payload, 'adset_id');
  const adId = stringField(payload, 'ad_id');

  const missing = [
    ['account_id', accountId],
    ['campaign_id', campaignId],
    ['adset_id', adsetId],
    ['ad_id', adId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    return { error: `${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} required` };
  }

  return {
    row: {
      insight_date: date,
      account_id: accountId,
      campaign_id: campaignId,
      campaign_name: stringField(payload, 'campaign_name'),
      adset_id: adsetId,
      adset_name: stringField(payload, 'adset_name'),
      ad_id: adId,
      ad_name: stringField(payload, 'ad_name'),
      spend: numberField(payload, 'spend') || numberField(payload, 'amount_spent'),
      impressions: Math.trunc(numberField(payload, 'impressions')),
      clicks: Math.trunc(numberField(payload, 'clicks')),
      ctr: nullableNumberField(payload, 'ctr'),
      cpc: nullableNumberField(payload, 'cpc'),
      cpm: nullableNumberField(payload, 'cpm'),
      actions: jsonField(payload, 'actions'),
      cost_per_action_type: jsonField(payload, 'cost_per_action_type'),
      raw: payload,
      updated_at: new Date().toISOString(),
    },
  };
}

export async function POST(req: Request) {
  try {
    if (!validateWebhookSecret(req)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await req.json();
    let payloads: unknown[] = [];

    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Array.isArray((parsed as JsonObject).rows)
    ) {
      const wrapper = parsed as JsonObject;
      payloads = (wrapper.rows as unknown[]).map((row) =>
        row !== null && typeof row === 'object' && !Array.isArray(row)
          ? { ...wrapper, rows: undefined, ...(row as JsonObject) }
          : row,
      );
    } else {
      payloads = Array.isArray(parsed) ? parsed : [parsed];
    }

    if (
      payloads.length === 0 ||
      payloads.some((payload) => payload === null || typeof payload !== 'object' || Array.isArray(payload))
    ) {
      return NextResponse.json({ error: 'Body must be one object or an array of objects' }, { status: 400 });
    }

    const service = createServiceClient();
    const rows = [];

    for (const payload of payloads as JsonObject[]) {
      const built = buildRow(payload);
      if ('error' in built) return NextResponse.json(built, { status: 400 });
      rows.push(built.row);
    }

    const { error } = await service.from('acquisition_meta_ad_insights').upsert(rows, {
      onConflict: 'insight_date,account_id,campaign_id,adset_id,ad_id',
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, upserted: rows.length });
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
}
