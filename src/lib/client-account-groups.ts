import type { SupabaseClient } from '@supabase/supabase-js';
import { deriveServiceProgram, normalizeSalesPackage } from '@/lib/offer-catalog';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import { normalizeReportingType, type ReportingType } from '@/lib/reporting-types';

export const ENGAGEMENT_KINDS = ['initial', 'upsell', 'cross_sell'] as const;
export type EngagementKind = (typeof ENGAGEMENT_KINDS)[number];

export type AccountGroupRow = {
  id: string;
  display_name: string;
  primary_email: string | null;
  created_at: string;
  updated_at: string;
};

export type SiblingClientRow = {
  id: string;
  name: string;
  reporting_type: string | null;
  lifecycle_status: string | null;
  mrr: number | null;
  ghl_location_id: string | null;
  engagement_kind: string | null;
  created_at: string;
};

export type EngagementRow = {
  id: string;
  engagement_kind: string;
  reporting_type: string;
  sales_package: string | null;
  mrr_snapshot: number | null;
  closed_at: string | null;
  created_at: string;
  from_client_id: string | null;
  to_client_id: string;
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

export function accountDisplayName(input: {
  primary_contact_name?: string | null;
  primary_contact?: string | null;
  name?: string | null;
}): string {
  return (
    str(input.primary_contact_name) ??
    str(input.primary_contact) ??
    str(input.name) ??
    'Unknown account'
  );
}

export function deriveEngagementKind(
  fromReportingType: ReportingType | null,
  toReportingType: ReportingType,
  explicit?: unknown,
): EngagementKind {
  const raw = str(explicit);
  if (raw && ENGAGEMENT_KINDS.includes(raw as EngagementKind)) {
    return raw as EngagementKind;
  }
  if (!fromReportingType) return 'initial';
  return fromReportingType === toReportingType ? 'upsell' : 'cross_sell';
}

export async function createAccountGroup(
  service: SupabaseClient,
  input: { display_name: string; primary_email?: string | null },
): Promise<AccountGroupRow> {
  const { data, error } = await service
    .from('client_account_groups')
    .insert({
      display_name: input.display_name.trim(),
      primary_email: input.primary_email ? input.primary_email.trim().toLowerCase() : null,
    })
    .select('id, display_name, primary_email, created_at, updated_at')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'Failed to create account group');
  return data as AccountGroupRow;
}

export async function getAccountGroupForClient(
  service: SupabaseClient,
  clientId: string,
): Promise<AccountGroupRow | null> {
  const { data: client, error: clientErr } = await service
    .from('clients')
    .select('account_group_id')
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!client?.account_group_id) return null;

  const { data: group, error: groupErr } = await service
    .from('client_account_groups')
    .select('id, display_name, primary_email, created_at, updated_at')
    .eq('id', client.account_group_id)
    .maybeSingle();
  if (groupErr) throw new Error(groupErr.message);
  return (group as AccountGroupRow | null) ?? null;
}

export async function getSiblingClients(
  service: SupabaseClient,
  clientId: string,
): Promise<SiblingClientRow[]> {
  const { data: client, error: clientErr } = await service
    .from('clients')
    .select('account_group_id')
    .eq('id', clientId)
    .maybeSingle();
  if (clientErr) throw new Error(clientErr.message);
  if (!client?.account_group_id) return [];

  const { data, error } = await service
    .from('clients')
    .select('id, name, reporting_type, lifecycle_status, mrr, ghl_location_id, engagement_kind, created_at')
    .eq('account_group_id', client.account_group_id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SiblingClientRow[];
}

export async function getEngagementHistory(
  service: SupabaseClient,
  accountGroupId: string,
): Promise<EngagementRow[]> {
  const { data, error } = await service
    .from('client_engagements')
    .select(
      'id, engagement_kind, reporting_type, sales_package, mrr_snapshot, closed_at, created_at, from_client_id, to_client_id',
    )
    .eq('account_group_id', accountGroupId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as EngagementRow[];
}

export async function logClientEngagement(
  service: SupabaseClient,
  input: {
    account_group_id: string;
    from_client_id?: string | null;
    to_client_id: string;
    engagement_kind: EngagementKind;
    reporting_type: ReportingType;
    sales_package?: string | null;
    mrr_snapshot?: number | null;
    closed_at?: string | null;
    logged_by?: string | null;
    acquisition_close_id?: string | null;
  },
): Promise<void> {
  const { error } = await service.from('client_engagements').insert({
    account_group_id: input.account_group_id,
    from_client_id: input.from_client_id ?? null,
    to_client_id: input.to_client_id,
    engagement_kind: input.engagement_kind,
    reporting_type: input.reporting_type,
    sales_package: input.sales_package ? normalizeSalesPackage(input.sales_package) : null,
    mrr_snapshot: input.mrr_snapshot ?? null,
    closed_at: input.closed_at ?? null,
    logged_by: input.logged_by ?? null,
    acquisition_close_id: input.acquisition_close_id ?? null,
  });
  if (error) throw new Error(error.message);
}

export type CreateOfferInput = {
  origin_client_id: string;
  name: string;
  reporting_type: unknown;
  engagement_kind?: unknown;
  sales_package?: unknown;
  ghl_location_id?: string | null;
  mrr?: number | null;
  billing_type?: string | null;
  billing_day?: number | null;
  lifecycle_status?: string | null;
  launch_date?: string | null;
  date_signed?: string | null;
  logged_by?: string | null;
  acquisition_close_id?: string | null;
};

export async function createOfferForAccount(
  service: SupabaseClient,
  input: CreateOfferInput,
): Promise<{ client: Record<string, unknown>; engagement_kind: EngagementKind }> {
  const { data: origin, error: originErr } = await service
    .from('clients')
    .select('id, account_group_id, reporting_type, email, primary_contact_name, primary_contact')
    .eq('id', input.origin_client_id)
    .single();
  if (originErr || !origin) throw new Error('Origin client not found');

  let accountGroupId = origin.account_group_id as string | null;
  if (!accountGroupId) {
    const group = await createAccountGroup(service, {
      display_name: accountDisplayName(origin),
      primary_email: origin.email,
    });
    accountGroupId = group.id;
    await service
      .from('clients')
      .update({ account_group_id: accountGroupId, engagement_kind: 'initial' })
      .eq('id', origin.id);
  }

  const reportingType = normalizeReportingType(input.reporting_type);
  const originType = origin.reporting_type
    ? normalizeReportingType(origin.reporting_type)
    : null;
  const engagementKind = deriveEngagementKind(originType, reportingType, input.engagement_kind);

  const salesPackage = input.sales_package ? normalizeSalesPackage(input.sales_package) : null;
  const insert: Record<string, unknown> = {
    name: input.name.trim(),
    reporting_type: reportingType,
    offer: reportingType,
    account_group_id: accountGroupId,
    engagement_kind: engagementKind,
    origin_client_id: origin.id,
    service_program: deriveServiceProgram(reportingType, salesPackage ?? 'core_offer'),
  };
  if (salesPackage) insert.sales_package = salesPackage;
  if (input.ghl_location_id) insert.ghl_location_id = str(input.ghl_location_id);
  if (input.mrr != null) insert.mrr = input.mrr;
  if (input.billing_type) insert.billing_type = input.billing_type;
  if (input.billing_day != null) insert.billing_day = input.billing_day;
  if (input.lifecycle_status) {
    insert.lifecycle_status = input.lifecycle_status;
    insert.is_live = syncIsLiveWithLifecycle(input.lifecycle_status);
  }
  if (input.launch_date) insert.launch_date = input.launch_date;
  if (input.date_signed) insert.date_signed = input.date_signed;

  const { data: client, error: insertErr } = await service
    .from('clients')
    .insert(insert)
    .select()
    .single();
  if (insertErr || !client) throw new Error(insertErr?.message ?? 'Failed to create offer');

  await logClientEngagement(service, {
    account_group_id: accountGroupId,
    from_client_id: origin.id,
    to_client_id: client.id as string,
    engagement_kind: engagementKind,
    reporting_type: reportingType,
    sales_package: salesPackage,
    mrr_snapshot: input.mrr ?? null,
    closed_at: input.date_signed ?? null,
    logged_by: input.logged_by ?? null,
    acquisition_close_id: input.acquisition_close_id ?? null,
  });

  return { client, engagement_kind: engagementKind };
}

export async function ensureAccountGroupForNewClient(
  service: SupabaseClient,
  input: {
    primary_contact_name?: string | null;
    primary_contact?: string | null;
    name: string;
    email?: string | null;
    account_group_id?: string | null;
    origin_client_id?: string | null;
    engagement_kind?: EngagementKind;
    reporting_type?: ReportingType | null;
  },
): Promise<{ account_group_id: string; engagement_kind: EngagementKind; origin_client_id: string | null }> {
  if (input.account_group_id) {
    return {
      account_group_id: input.account_group_id,
      engagement_kind: input.engagement_kind ?? 'initial',
      origin_client_id: input.origin_client_id ?? null,
    };
  }

  if (input.origin_client_id) {
    const { data: origin, error: originErr } = await service
      .from('clients')
      .select('id, account_group_id, reporting_type')
      .eq('id', input.origin_client_id)
      .single();
    if (originErr || !origin) {
      throw new Error('Origin client not found');
    }
    if (!origin.account_group_id) {
      const group = await createAccountGroup(service, {
        display_name: accountDisplayName(input),
        primary_email: input.email,
      });
      await service
        .from('clients')
        .update({ account_group_id: group.id, engagement_kind: 'initial' })
        .eq('id', origin.id);
      const rt = input.reporting_type ?? null;
      const originRt = origin.reporting_type ? normalizeReportingType(origin.reporting_type) : null;
      return {
        account_group_id: group.id,
        engagement_kind: rt ? deriveEngagementKind(originRt, rt, input.engagement_kind) : 'cross_sell',
        origin_client_id: origin.id,
      };
    }
    const rt = input.reporting_type ?? null;
    const originRt = origin.reporting_type ? normalizeReportingType(origin.reporting_type) : null;
    return {
      account_group_id: origin.account_group_id,
      engagement_kind: rt
        ? deriveEngagementKind(originRt, rt, input.engagement_kind)
        : (input.engagement_kind ?? 'cross_sell'),
      origin_client_id: origin.id,
    };
  }

  const group = await createAccountGroup(service, {
    display_name: accountDisplayName(input),
    primary_email: input.email,
  });
  return {
    account_group_id: group.id,
    engagement_kind: 'initial',
    origin_client_id: null,
  };
}
