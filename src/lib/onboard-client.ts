import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeReportingType } from '@/lib/kpi-layouts';
import type { ReportingType } from '@/lib/reporting-types';
import { deriveServiceProgram, normalizeSalesPackage } from '@/lib/offer-catalog';
import { findClientConflicts } from '@/lib/client-duplicate-check';
import { clientNamesMatch } from '@/lib/client-name-match';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import {
  createClickUpTask,
  fmtMoney,
  getClientHubListId,
  getClickUpToken,
} from '@/lib/clickup';
import { insertFormSubmission } from '@/lib/form-submissions';
import { linkAcquisitionCloseFromClient } from '@/lib/acquisition-ingest';

const ONBOARD_FIELDS =
  'id, name, is_live, reporting_type, lifecycle_status, clickup_task_id, ghl_location_id, ghl_contact_id, email, billing_email, primary_contact_name, phone, mrr, billing_type, contract_term_months, date_signed, offer, nmls, brokerage_name, ghl_subaccount_url, source, slack_id, created_at';

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

function normalizeOffer(v: unknown): ReportingType | null {
  const s = trimString(v);
  if (!s) return null;
  return normalizeReportingType(s);
}

function reportingTypeFromOffer(offer: ReportingType | null, explicit: unknown): ReportingType {
  if (explicit === 'HE' || explicit === 'RM' || explicit === 'DSCR' || explicit === 'CALL_CENTER') {
    return normalizeReportingType(explicit);
  }
  if (offer) return offer;
  return normalizeReportingType(explicit);
}

export function parseOnboardPayload(body: OnboardPayload) {
  const personName =
    trimString(body.primary_contact_name) ??
    trimString(body.client_name) ??
    trimString(body.name) ??
    trimString(body.agency_name) ??
    trimString(body.business_name);
  const subAccountName =
    trimString(body.sub_account_name) ??
    trimString(body.ghl_subaccount_name);
  const name = subAccountName ?? personName;
  if (!name) {
    throw new Error(
      'primary_contact_name is required (or client_name / name / agency_name / sub_account_name)',
    );
  }

  const email = trimString(body.email);
  const billingEmail = trimString(body.billing_email) ?? email;
  const offer = normalizeOffer(body.offer) ?? normalizeOffer(body.reporting_type);
  const reporting_type = reportingTypeFromOffer(offer, body.reporting_type);
  const sales_package = normalizeSalesPackage(
    body.sales_package ?? body.offer_type ?? body.salesPackage,
  );
  const service_program = deriveServiceProgram(reporting_type, sales_package);
  const dateSigned = trimString(body.date_signed);

  const lifecycleStatus = trimString(body.lifecycle_status) ?? 'new_account';

  return {
    name,
    email,
    billing_email: billingEmail,
    primary_contact_name: personName ?? name,
    phone: trimString(body.phone),
    mrr: numberField(body.mrr),
    billing_type: normalizeBillingType(body.billing_type),
    contract_term_months: numberField(body.contract_term_months),
    date_signed: dateSigned,
    offer,
    reporting_type,
    service_program,
    sales_package,
    nmls: trimString(body.nmls),
    brokerage_name: trimString(body.brokerage_name),
    ghl_location_id: trimString(body.ghl_location_id) ?? trimString(body.location_id),
    ghl_subaccount_url: trimString(body.ghl_subaccount_url),
    source: trimString(body.source),
    slack_id: trimString(body.slack_id) ?? trimString(body.slackId),
    lifecycle_status: lifecycleStatus,
    is_live: syncIsLiveWithLifecycle(lifecycleStatus),
    clickup_task_id:
      trimString(body.clickup_task_id) ??
      trimString(body.clickup_id) ??
      trimString(body.clickup_client_id),
    ghl_contact_id:
      trimString(body.ghl_contact_id) ??
      trimString(body.contact_id),
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

  if (parsed.ghl_contact_id) {
    const { data } = await service
      .from('clients')
      .select('id')
      .eq('ghl_contact_id', parsed.ghl_contact_id)
      .maybeSingle();
    if (data) return data;
  }

  if (parsed.ghl_location_id) {
    const { data } = await service
      .from('clients')
      .select('id')
      .eq('ghl_location_id', parsed.ghl_location_id)
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

  const { data: all } = await service.from('clients').select('id, name, primary_contact_name');
  const person = parsed.primary_contact_name?.trim();
  for (const c of all ?? []) {
    if (clientNamesMatch(c.name, parsed.name)) return { id: c.id };
    if (person && c.primary_contact_name && clientNamesMatch(c.primary_contact_name, person)) {
      return { id: c.id };
    }
    if (person && clientNamesMatch(c.name, person)) return { id: c.id };
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
    'billing_type', 'contract_term_months', 'date_signed', 'offer', 'service_program', 'sales_package', 'nmls',
    'brokerage_name', 'ghl_location_id', 'ghl_contact_id',
    'ghl_subaccount_url', 'source',
    'clickup_task_id', 'slack_id',
  ];
  for (const k of optional) {
    const v = parsed[k];
    if (v != null && v !== '') record[k] = v;
  }
  if (record.primary_contact_name) {
    record.primary_contact = record.primary_contact_name;
  }
  return record;
}

function shouldAutoCreateClickUpTask(parsed: ParsedOnboard): boolean {
  if (parsed.clickup_task_id) return false;
  const flag = process.env.CLICKUP_AUTO_CREATE_ON_ONBOARD?.trim().toLowerCase();
  if (flag === 'false' || flag === '0' || flag === 'no') return false;
  return true;
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
    const conflicts = await findClientConflicts(service, {
      name: parsed.name,
      email: parsed.email,
      ghl_location_id: parsed.ghl_location_id,
      primary_contact_name: parsed.primary_contact_name,
    });
    if (conflicts.blocked) {
      const match = conflicts.conflicts[0];
      throw new Error(
        `Client already exists as "${match?.name}". Re-send the form to update that record, or set sub_account_name when the GHL sub-account is ready.`,
      );
    }

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

  if (!clickupTaskId && shouldAutoCreateClickUpTask(parsed)) {
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

  let formSubmissionId: string | null = null;
  try {
    const submission = await insertFormSubmission(service, {
      client_id: String(client.id),
      form_type: 'new_client',
      status: 'applied',
      submitted_by: 'webhook',
      match_email: parsed.email,
      match_phone: parsed.phone,
      responses: body,
      applied_patch: record,
    });
    formSubmissionId = submission.id;
  } catch (e) {
    console.error('[onboard] form submission log failed', e);
  }

  try {
    await linkAcquisitionCloseFromClient(service, String(client.id), {
      formSubmissionId: formSubmissionId ?? undefined,
      closedAt: parsed.date_signed ? `${parsed.date_signed}T12:00:00.000Z` : undefined,
    });
  } catch (e) {
    console.error('[onboard] acquisition link failed', e);
  }

  return { client, clickup_task_id: clickupTaskId, created, billing_id, sales_call_id };
}
