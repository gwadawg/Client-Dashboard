import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import {
  createClickUpTask,
  fmtMoney,
  getClientHubListId,
  getClickUpToken,
} from '@/lib/clickup';

const ONBOARD_FIELDS =
  'id, name, is_live, reporting_type, lifecycle_status, clickup_task_id, ghl_location_id, email, billing_email, primary_contact_name, phone, mrr, billing_type, contract_term_months, date_signed, offer, nmls, brokerage_name, ghl_subaccount_url, source, created_at';

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

function reportingTypeFromOffer(offer: string | null, explicit: unknown): 'RM' | 'HE' {
  if (explicit === 'HE' || explicit === 'RM') return explicit;
  if (offer?.toUpperCase().includes('HE')) return 'HE';
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
  const offer = trimString(body.offer);
  const dateSigned = trimString(body.date_signed);

  return {
    name,
    email,
    billing_email: billingEmail,
    primary_contact_name:
      trimString(body.primary_contact_name) ??
      trimString(body.client_name) ??
      trimString(body.primary_contact),
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
    lifecycle_status: trimString(body.lifecycle_status) ?? 'new_account',
    is_live: body.is_live === true,
    clickup_task_id: trimString(body.clickup_task_id),
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
    'clickup_task_id',
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
  ].join('\n');
}

export async function onboardClient(
  service: SupabaseClient,
  body: OnboardPayload,
): Promise<{ client: Record<string, unknown>; clickup_task_id: string | null; created: boolean }> {
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
      status: 'new account',
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

  return { client, clickup_task_id: clickupTaskId, created };
}
