import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import {
  createClickUpTask,
  fmtMoney,
  getClientHubListId,
  getClickUpToken,
} from '@/lib/clickup';

const ONBOARD_FIELDS =
  'id, name, is_live, reporting_type, lifecycle_status, clickup_task_id, ghl_location_id, email, billing_email, primary_contact_name, phone, mrr, billing_type, contract_term_months, date_signed, offer, nmls, brokerage_name, ghl_subaccount_url, source, slack_id, created_at';

const SIGNING_BILLING_REF = 'onboard-signing';

type OnboardPayload = Record<string, unknown>;

function trimString(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function numberField(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}

function normalizeBillingType(v: unknown): string | null {
  const s = trimString(v);
  if (!s) return null;
  const lower = s.toLowerCase().replace(/\s+/g, '_');
  if (lower === 'monthly' || lower === 'mrr') return 'monthly';
  if (lower === 'pif') return 'pif';
  if (lower.includes('pif') && lower.includes('month')) return 'pif_monthly';
  return lower;
}

function normalizeOffer(v: unknown): 'RM' | 'HE' | null {
  const s = trimString(v);
  if (!s) return null;
  const upper = s.toUpperCase();
  if (upper === 'RM' || upper === 'HE') return upper;
  if (upper.includes('HE') || upper.includes('HOME EQUITY')) return 'HE';
  if (upper.includes('RM') || upper.includes('REVERSE')) return 'RM';
  return null;
}

function reportingTypeFromOffer(offer: 'RM' | 'HE' | null, explicit: unknown): 'RM' | 'HE' {
  if (explicit === 'HE' || explicit === 'RM') return explicit;
  if (offer) return offer;
  return normalizeReportingType(explicit);
}

export function parseOnboardPayload(body: OnboardPayload) {
  const name =
    trimString(body.name) ??
    trimString(body.agency_name) ??
    trimString(body.business_name);
  if (!name) throw new Error('name is required (or agency_name / business_name)');

  const email = trimString(body.email);
  const billingEmail = trimString(body.billing_email) ?? email;
  const offer = normalizeOffer(body.offer) ?? normalizeOffer(body.reporting_type);
  const dateSigned = trimString(body.date_signed);
  const contactName =
    trimString(body.primary_contact_name) ??
    trimString(body.client_name) ??
    trimString(body.primary_contact);

  return {
    name,
    email,
    billing_email: billingEmail,
    primary_contact_name: contactName ?? name,
    phone: trimString(body.phone),
    mrr: numberField(body.mrr),
    billing_type: normalizeBillingType(body.billing_type),
    contract_term_months: numberField(body.contract_term_months),
    date_signed: dateSigned,
    offer,
    reporting_type: reportingTypeFromOffer(offer, body.reporting_type),
    nmls: trimString(body.nmls),
    brokerage_name: trimString(body.brokerage_name),
    ghl_location_id: trimString(body.ghl_location_id) ?? trimString(body.location_id),
    ghl_subaccount_url: trimString(body.ghl_subaccount_url),
    source: trimString(body.source),
    slack_id: trimString(body.slack_id) ?? trimString(body.slackId),
    lifecycle_status: trimString(body.lifecycle_status) ?? 'onboarding',
    is_live: body.is_live === true,
    clickup_task_id:
      trimString(body.clickup_task_id) ??
      trimString(body.clickup_id) ??
      trimString(body.clickup_client_id),
    cash_collected:
      numberField(body.cash_collected) ??
      numberField(body.cash_collected_amount),
    sales_call_recording:
      trimString(body.sales_call_recording) ??
      trimString(body.sales_call_recording_url) ??
      trimString(body.sales_call_url),
  };
}

export type ParsedOnboard = ReturnType<typeof parseOnboardPayload>;

async function findExistingClient(
  service: SupabaseClient,
  parsed: ParsedOnboard,
): Promise<{ id: string } | null> {
  if (parsed.clickup_task_id) {
    const { data } = await service
      .from('clients')
      .select('id')
      .eq('clickup_task_id', parsed.clickup_task_id)
      .maybeSingle();
    if (data) return data;
  }

  if (parsed.email) {
    const { data } = await service
      .from('clients')
      .select('id')
      .eq('email', parsed.email)
      .maybeSingle();
    if (data) return data;
  }

  if (parsed.name && parsed.date_signed) {
    const { data } = await service
      .from('clients')
      .select('id')
      .eq('name', parsed.name)
      .eq('date_signed', parsed.date_signed)
      .maybeSingle();
    if (data) return data;
  }

  const { data } = await service
    .from('clients')
    .select('id')
    .eq('name', parsed.name)
    .maybeSingle();
  return data;
}

function buildClientRecord(parsed: ParsedOnboard): Record<string, unknown> {
  const record: Record<string, unknown> = {
    name: parsed.name,
    reporting_type: parsed.reporting_type,
    lifecycle_status: parsed.lifecycle_status,
    is_live: parsed.is_live,
  };
  const optional: (keyof ParsedOnboard)[] = [
    'email', 'billing_email', 'primary_contact_name', 'phone', 'mrr',
    'billing_type', 'contract_term_months', 'date_signed', 'offer', 'nmls',
    'brokerage_name', 'ghl_location_id', 'ghl_subaccount_url', 'source',
    'clickup_task_id', 'slack_id',
  ];
  for (const k of optional) {
    const v = parsed[k];
    if (v != null && v !== '') record[k] = v;
  }
  return record;
}

function buildClickUpDescription(parsed: ParsedOnboard, clientId: string): string {
  return [
    `Mr. Waiz client id: ${clientId}`,
    `Contact: ${parsed.primary_contact_name ?? 'n/a'}`,
    `Email: ${parsed.email ?? parsed.billing_email ?? 'n/a'}`,
    `Phone: ${parsed.phone ?? 'n/a'}`,
    `Offer: ${parsed.offer ?? parsed.reporting_type}`,
    `MRR: ${fmtMoney(parsed.mrr)}`,
    `Billing type: ${parsed.billing_type ?? 'n/a'}`,
    `Date signed: ${parsed.date_signed ?? 'n/a'}`,
    `NMLS: ${parsed.nmls ?? 'n/a'}`,
    `Brokerage: ${parsed.brokerage_name ?? 'n/a'}`,
    `GHL location: ${parsed.ghl_location_id ?? 'n/a'}`,
    `Source: ${parsed.source ?? 'n/a'}`,
    `Slack: ${parsed.slack_id ?? 'n/a'}`,
    `Cash collected: ${fmtMoney(parsed.cash_collected)}`,
  ].join('\n');
}

async function upsertSigningBilling(
  service: SupabaseClient,
  clientId: string,
  parsed: ParsedOnboard,
): Promise<string | null> {
  if (parsed.cash_collected == null || parsed.cash_collected <= 0) return null;

  const billedOn = parsed.date_signed ?? new Date().toISOString().slice(0, 10);
  const revenueType =
    parsed.billing_type === 'pif' ? 'pif' : parsed.billing_type ? 'mrr' : null;
  const { data: existing } = await service
    .from('client_billings')
    .select('id')
    .eq('client_id', clientId)
    .eq('invoice_ref', SIGNING_BILLING_REF)
    .maybeSingle();

  const row = {
    client_id: clientId,
    billed_on: billedOn,
    due_date: billedOn,
    base_amount: parsed.cash_collected,
    performance_amount: 0,
    late_fee: 0,
    discount: 0,
    amount: parsed.cash_collected,
    amount_paid: parsed.cash_collected,
    status: 'paid',
    paid_on: billedOn,
    method: 'manual',
    invoice_ref: SIGNING_BILLING_REF,
    note: 'New cash collected at sign',
    ...(revenueType ? { revenue_type: revenueType } : {}),
  };

  if (existing?.id) {
    const { data, error } = await service
      .from('client_billings')
      .update(row)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return data.id as string;
  }

  const { data, error } = await service
    .from('client_billings')
    .insert(row)
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

async function upsertSalesCall(
  service: SupabaseClient,
  clientId: string,
  parsed: ParsedOnboard,
): Promise<string | null> {
  if (!parsed.sales_call_recording) return null;

  const { data: existing } = await service
    .from('client_calls')
    .select('id')
    .eq('client_id', clientId)
    .eq('recording_url', parsed.sales_call_recording)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const calledAt = parsed.date_signed
    ? new Date(`${parsed.date_signed}T12:00:00`).toISOString()
    : new Date().toISOString();

  const { data, error } = await service
    .from('client_calls')
    .insert({
      client_id: clientId,
      call_type: 'other',
      called_at: calledAt,
      recording_url: parsed.sales_call_recording,
      notes: 'Sales call (signed)',
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

export async function onboardClient(
  service: SupabaseClient,
  body: OnboardPayload,
): Promise<{
  client: Record<string, unknown>;
  clickup_task_id: string | null;
  created: boolean;
  billing_id: string | null;
  sales_call_id: string | null;
}> {
  const parsed = parseOnboardPayload(body);
  const existing = await findExistingClient(service, parsed);
  const record = buildClientRecord(parsed);

  let client: Record<string, unknown>;
  let created: boolean;

  if (existing) {
    const { data, error } = await service
      .from('clients')
      .update(record)
      .eq('id', existing.id)
      .select(ONBOARD_FIELDS)
      .single();
    if (error) throw new Error(error.message);
    client = data as Record<string, unknown>;
    created = false;
  } else {
    const { data, error } = await service
      .from('clients')
      .insert(record)
      .select(ONBOARD_FIELDS)
      .single();
    if (error) throw new Error(error.message);
    client = data as Record<string, unknown>;
    created = true;
  }

  let clickupTaskId = trimString(client.clickup_task_id);

  if (!clickupTaskId) {
    const token = getClickUpToken();
    const listId = getClientHubListId();
    if (!token) {
      throw new Error('CLICKUP_API_TOKEN must be set to create Client Hub tasks');
    }

    const task = await createClickUpTask(listId, token, {
      name: parsed.name,
      description: buildClickUpDescription(parsed, String(client.id)),
      status: 'onboarding',
    });
    clickupTaskId = task.id;

    const { data: updated, error: upErr } = await service
      .from('clients')
      .update({ clickup_task_id: clickupTaskId })
      .eq('id', client.id)
      .select(ONBOARD_FIELDS)
      .single();
    if (upErr) throw new Error(upErr.message);
    client = updated as Record<string, unknown>;
  }

  const billing_id = await upsertSigningBilling(service, String(client.id), parsed);
  const sales_call_id = await upsertSalesCall(service, String(client.id), parsed);

  return { client, clickup_task_id: clickupTaskId, created, billing_id, sales_call_id };
}
