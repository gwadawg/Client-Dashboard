import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOfferForAccount } from '@/lib/client-account-groups';
import { insertFormSubmission } from '@/lib/form-submissions';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import { normalizeSalesPackage } from '@/lib/offer-catalog';
import { normalizeReportingType } from '@/lib/reporting-types';
import {
  reinstateDraftToResponses,
  type ReinstateEngagement,
  type ReinstateFormDraft,
} from '@/lib/reinstate-form';

export class ReinstateClientError extends Error {
  constructor(
    message: string,
    public status: number,
    public payload?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ReinstateClientError';
  }
}

export type ReinstateClientResult = {
  client_id: string;
  welcome_back_url: string;
  engagement: ReinstateFormDraft['engagement'];
  close_id: string;
  submission_id: string;
};

export type ReinstateClientOpts = {
  draft: ReinstateFormDraft;
  submittedBy: string | null;
  appOrigin: string;
};

/** Contact / business fields copied onto a new-offer sibling for welcome-back prefill. */
export const REINSTATE_NEW_OFFER_IDENTITY_FIELDS = [
  'email',
  'billing_email',
  'phone',
  'primary_contact',
  'primary_contact_name',
  'brokerage_name',
  'legal_business_name',
  'nmls',
  'city',
  'state',
  'zip_code',
  'street_address',
  'states_licensed',
  'timezone',
  'website',
  'facebook_page_name',
  'contact_role',
  'biography',
  'headshot_url',
] as const;

/** Integrations stay on the churned origin — never copy onto a new-offer sibling. */
export const REINSTATE_NEW_OFFER_NEVER_COPY_FIELDS = [
  'ghl_location_id',
  'ghl_contact_id',
  'clickup_task_id',
  'slack_id',
] as const;

const ORIGIN_SELECT = [
  'id',
  'name',
  'lifecycle_status',
  'welcome_back_token',
  ...REINSTATE_NEW_OFFER_IDENTITY_FIELDS,
].join(', ');

export function buildWelcomeBackUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/onboard/welcome-back/${encodeURIComponent(token)}`;
}

export function buildSameFileClientPatch(
  draft: ReinstateFormDraft,
  reinstatedAtIso: string,
): Record<string, unknown> {
  const reportingType = normalizeReportingType(draft.reporting_type || draft.offer);
  const patch: Record<string, unknown> = {
    lifecycle_status: 'onboarding',
    reinstated_at: reinstatedAtIso,
    churned_at: null,
    is_live: syncIsLiveWithLifecycle('onboarding'),
    offer: draft.offer.trim() || reportingType,
    reporting_type: reportingType,
  };
  if (draft.mrr != null) patch.mrr = draft.mrr;
  if (draft.sales_package.trim()) {
    patch.sales_package = normalizeSalesPackage(draft.sales_package);
  }
  if (draft.contract_term_months != null) {
    patch.contract_term_months = draft.contract_term_months;
  }
  if (draft.contract_end_date) patch.contract_end_date = draft.contract_end_date;
  if (!draft.leave_billing_paused) {
    patch.billing_paused = false;
    patch.billing_paused_at = null;
    patch.billing_paused_note = null;
  }
  if (!draft.leave_ads_paused) {
    patch.ads_paused = false;
    patch.ads_paused_at = null;
    patch.ads_paused_note = null;
  }
  // date_signed intentionally omitted — preserve original tenure start
  return patch;
}

/** Copy identity onto sibling; never include GHL / ClickUp / Slack ids. */
export function buildNewOfferIdentityPatch(
  origin: Record<string, unknown>,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const key of REINSTATE_NEW_OFFER_IDENTITY_FIELDS) {
    if (!(key in origin)) continue;
    const value = origin[key];
    if (value === undefined) continue;
    patch[key] = value;
  }
  for (const key of REINSTATE_NEW_OFFER_NEVER_COPY_FIELDS) {
    delete patch[key];
  }
  return patch;
}

export type RecentReinstateSubmission = {
  id?: string;
  client_id?: string | null;
  responses?: Record<string, unknown> | null;
  submitted_at?: string;
};

export function reinstateSubmissionMatchesOrigin(
  row: RecentReinstateSubmission,
  originClientId: string,
): boolean {
  if (row.client_id === originClientId) return true;
  const linked = row.responses?.origin_client_id;
  return typeof linked === 'string' && linked === originClientId;
}

export function findRecentNewOfferTargetClientId(
  rows: RecentReinstateSubmission[],
): string | null {
  for (const row of rows) {
    if (readReinstateEngagement(row.responses) !== 'new_offer') continue;
    const targetId = readTargetClientId(row.responses);
    if (targetId) return targetId;
  }
  return null;
}

export function hasRecentSameFileReinstate(rows: RecentReinstateSubmission[]): boolean {
  return rows.some((row) => readReinstateEngagement(row.responses) === 'same_file');
}

export function readReinstateEngagement(
  responses: Record<string, unknown> | null | undefined,
): ReinstateEngagement | null {
  const engagement = responses?.engagement;
  return engagement === 'same_file' || engagement === 'new_offer' ? engagement : null;
}

export function readTargetClientId(
  responses: Record<string, unknown> | null | undefined,
): string | null {
  const id = responses?.target_client_id;
  return typeof id === 'string' && id.trim() ? id.trim() : null;
}

function mintWelcomeBackToken(): string {
  return randomBytes(24).toString('hex');
}

function closedAtIso(closedAt: string): string {
  const trimmed = closedAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T12:00:00.000Z`;
  return trimmed;
}

function reinstateCutoffIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Find a recent reinstate tied to this origin.
 * same_file rows use client_id=origin; new_offer rows live on the sibling but
 * store origin_client_id in responses (so Client File CS checklist stays on target).
 */
async function loadRecentOriginReinstate(
  service: SupabaseClient,
  originClientId: string,
): Promise<{
  id: string;
  client_id: string | null;
  responses: Record<string, unknown> | null;
  submitted_at: string;
} | null> {
  const { data, error } = await service
    .from('client_form_submissions')
    .select('id, client_id, responses, submitted_at')
    .eq('form_type', 'reinstate')
    .in('status', ['applied', 'submitted'])
    .gte('submitted_at', reinstateCutoffIso())
    .or(
      `client_id.eq.${originClientId},responses->>origin_client_id.eq.${originClientId}`,
    )
    .order('submitted_at', { ascending: false })
    .limit(5);
  if (error) throw new ReinstateClientError(error.message, 500);

  const match = (data ?? [])[0];
  return (match as {
    id: string;
    client_id: string | null;
    responses: Record<string, unknown> | null;
    submitted_at: string;
  } | undefined) ?? null;
}

async function throwIdempotentConflict(opts: {
  appOrigin: string;
  engagement: ReinstateEngagement;
  clientId: string;
  welcomeBackToken: string | null | undefined;
}): Promise<never> {
  const token = opts.welcomeBackToken ? String(opts.welcomeBackToken) : '';
  if (!token) {
    throw new ReinstateClientError('Client was already reinstated recently', 409, {
      client_id: opts.clientId,
      engagement: opts.engagement,
    });
  }
  throw new ReinstateClientError('Client was already reinstated recently', 409, {
    client_id: opts.clientId,
    welcome_back_url: buildWelcomeBackUrl(opts.appOrigin, token),
    engagement: opts.engagement,
  });
}

export async function reinstateClient(
  service: SupabaseClient,
  opts: ReinstateClientOpts,
): Promise<ReinstateClientResult> {
  const { draft, submittedBy, appOrigin } = opts;
  const clientId = draft.client_id.trim();

  const { data: origin, error: loadErr } = await service
    .from('clients')
    .select(ORIGIN_SELECT)
    .eq('id', clientId)
    .maybeSingle();

  if (loadErr) throw new ReinstateClientError(loadErr.message, 500);
  if (!origin) throw new ReinstateClientError('Client not found', 404);

  const lifecycle = (origin.lifecycle_status as string | null) ?? null;

  // Idempotency before create: any recent reinstate on the origin (regardless of
  // current lifecycle) with a resolvable welcome-back target → 409.
  {
    const recent = await loadRecentOriginReinstate(service, origin.id as string);
    if (recent) {
      const engagement = readReinstateEngagement(recent.responses) ?? 'same_file';
      if (engagement === 'new_offer') {
        const targetId = readTargetClientId(recent.responses);
        if (targetId) {
          const { data: sibling, error: siblingLoadErr } = await service
            .from('clients')
            .select('id, welcome_back_token')
            .eq('id', targetId)
            .maybeSingle();
          if (siblingLoadErr) throw new ReinstateClientError(siblingLoadErr.message, 500);
          if (sibling?.welcome_back_token) {
            await throwIdempotentConflict({
              appOrigin,
              engagement: 'new_offer',
              clientId: sibling.id as string,
              welcomeBackToken: sibling.welcome_back_token as string,
            });
          }
        }
      } else if (lifecycle === 'onboarding' && origin.welcome_back_token) {
        await throwIdempotentConflict({
          appOrigin,
          engagement: 'same_file',
          clientId: origin.id as string,
          welcomeBackToken: origin.welcome_back_token as string,
        });
      } else if (engagement === 'same_file') {
        // Origin may still be churned if a prior attempt wrote the submission
        // then failed mid-flight; prefer existing token when present.
        if (origin.welcome_back_token) {
          await throwIdempotentConflict({
            appOrigin,
            engagement: 'same_file',
            clientId: origin.id as string,
            welcomeBackToken: origin.welcome_back_token as string,
          });
        }
      }
    }
  }

  if (lifecycle !== 'churned') {
    throw new ReinstateClientError('Client must be churned to reinstate', 409);
  }

  const reinstatedAtIso = new Date().toISOString();
  const token = mintWelcomeBackToken();
  const tokenCreatedAt = reinstatedAtIso;

  let targetClientId = origin.id as string;
  let appliedPatch: Record<string, unknown>;

  if (draft.engagement === 'new_offer') {
    const reportingType = normalizeReportingType(draft.reporting_type || draft.offer);
    const originName = String(origin.name ?? '').trim() || 'Client';
    let sibling: Record<string, unknown>;
    try {
      const created = await createOfferForAccount(service, {
        origin_client_id: origin.id as string,
        name: `${originName} — ${reportingType}`,
        reporting_type: reportingType,
        sales_package: draft.sales_package || null,
        mrr: draft.mrr,
        lifecycle_status: 'onboarding',
        date_signed: draft.closed_at || null,
        logged_by: submittedBy,
        // intentionally omit ghl_location_id — new offer must not reuse old GHL
      });
      sibling = created.client;
    } catch (e) {
      if (e instanceof ReinstateClientError) throw e;
      throw new ReinstateClientError(e instanceof Error ? e.message : String(e), 500);
    }

    targetClientId = sibling.id as string;
    appliedPatch = {
      ...buildNewOfferIdentityPatch(origin as Record<string, unknown>),
      ...buildSameFileClientPatch(draft, reinstatedAtIso),
      welcome_back_token: token,
      welcome_back_token_created_at: tokenCreatedAt,
    };

    const { error: siblingErr } = await service
      .from('clients')
      .update(appliedPatch)
      .eq('id', targetClientId);
    if (siblingErr) throw new ReinstateClientError(siblingErr.message, 500);
  } else {
    appliedPatch = {
      ...buildSameFileClientPatch(draft, reinstatedAtIso),
      welcome_back_token: token,
      welcome_back_token_created_at: tokenCreatedAt,
    };

    const { error: updateErr } = await service
      .from('clients')
      .update(appliedPatch)
      .eq('id', targetClientId);
    if (updateErr) throw new ReinstateClientError(updateErr.message, 500);
  }

  // Always attach the reinstate submission to the welcome-back target (sibling for
  // new_offer). Idempotency finds new_offer rows via responses.origin_client_id.
  const responses = {
    ...reinstateDraftToResponses(draft),
    target_client_id: targetClientId,
    origin_client_id: origin.id,
  };

  let submission;
  try {
    submission = await insertFormSubmission(service, {
      client_id: targetClientId,
      form_type: 'reinstate',
      status: 'applied',
      submitted_by: submittedBy,
      responses,
      applied_patch: {
        ...appliedPatch,
        engagement: draft.engagement,
        origin_client_id: origin.id,
        target_client_id: targetClientId,
      },
    });
  } catch (e) {
    if (e instanceof ReinstateClientError) throw e;
    throw new ReinstateClientError(e instanceof Error ? e.message : String(e), 500);
  }

  const offerType = draft.sales_package.trim()
    ? normalizeSalesPackage(draft.sales_package)
    : null;
  const reportingType = normalizeReportingType(draft.reporting_type || draft.offer);
  const closerName = draft.closer_name.trim();

  // Closer-stats resolve closers via demo calls / offers, not close.setter_name.
  // Still set setter_name (first-class text on acquisition_closes) + raw.closer_name
  // so payroll / team-stats / raw tables can attribute the winback.
  const { data: closeRow, error: closeErr } = await service
    .from('acquisition_closes')
    .insert({
      client_id: targetClientId,
      form_submission_id: submission.id,
      closed_at: closedAtIso(draft.closed_at),
      close_source: 'manual',
      close_kind: 'reinstate',
      cash_collected: draft.cash_collected,
      offer_type: offerType,
      reporting_type: reportingType,
      mapping_status: 'mapped',
      setter_name: closerName || null,
      raw: {
        closer_name: closerName,
        engagement: draft.engagement,
        ghl_reuse: draft.ghl_reuse,
        origin_client_id: origin.id,
        target_client_id: targetClientId,
        reinstate: true,
      },
    })
    .select('id')
    .single();

  if (closeErr || !closeRow) {
    throw new ReinstateClientError(closeErr?.message ?? 'Failed to insert reinstate close', 500);
  }

  return {
    client_id: targetClientId,
    welcome_back_url: buildWelcomeBackUrl(appOrigin, token),
    engagement: draft.engagement,
    close_id: closeRow.id as string,
    submission_id: submission.id,
  };
}
