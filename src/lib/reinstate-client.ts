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

/** Recent sibling row used to reuse an orphaned new_offer create. */
export type ReinstateSiblingCandidate = {
  id: string;
  name?: string | null;
  created_at?: string | null;
  lifecycle_status?: string | null;
  reinstated_at?: string | null;
  welcome_back_token?: string | null;
};

/**
 * Prefer a partially-applied reinstate sibling (token / reinstated_at), else a
 * same-named onboarding sibling created in the idempotency window.
 */
export function pickReusableNewOfferSibling(
  siblings: ReinstateSiblingCandidate[],
  opts: { cutoffIso: string; expectedName?: string | null },
): string | null {
  const eligible = siblings.filter((s) => {
    if (!s.id) return false;
    if (s.lifecycle_status !== 'onboarding') return false;
    if (!s.created_at || s.created_at < opts.cutoffIso) return false;
    if (s.reinstated_at || s.welcome_back_token) return true;
    if (opts.expectedName && s.name === opts.expectedName) return true;
    return false;
  });
  return eligible[0]?.id ?? null;
}

export type ReinstateCloseCandidate = {
  id: string;
  form_submission_id?: string | null;
  /** acquisition_closes insert timestamp (no created_at column). */
  inserted_at?: string | null;
  close_kind?: string | null;
};

/** Match an existing winback close for this reinstate submission / window. */
export function findExistingReinstateClose(
  rows: ReinstateCloseCandidate[],
  opts: { formSubmissionId: string; submittedAt?: string | null },
): string | null {
  for (const row of rows) {
    if (row.close_kind !== 'reinstate') continue;
    if (row.form_submission_id === opts.formSubmissionId) return row.id;
    if (
      opts.submittedAt &&
      row.inserted_at &&
      row.inserted_at >= opts.submittedAt
    ) {
      return row.id;
    }
  }
  return null;
}

/** Close insert payload — closer lives in raw only (never setter_name). */
export function buildReinstateCloseRow(opts: {
  clientId: string;
  formSubmissionId: string;
  draft: ReinstateFormDraft;
  originClientId: string;
  targetClientId: string;
}): Record<string, unknown> {
  const closerName = opts.draft.closer_name.trim();
  const offerType = opts.draft.sales_package.trim()
    ? normalizeSalesPackage(opts.draft.sales_package)
    : null;
  const reportingType = normalizeReportingType(
    opts.draft.reporting_type || opts.draft.offer,
  );
  return {
    client_id: opts.clientId,
    form_submission_id: opts.formSubmissionId,
    closed_at: closedAtIso(opts.draft.closed_at),
    close_source: 'manual',
    close_kind: 'reinstate',
    cash_collected: opts.draft.cash_collected,
    offer_type: offerType,
    reporting_type: reportingType,
    mapping_status: 'mapped',
    raw: {
      closer_name: closerName,
      close_kind: 'reinstate',
      engagement: opts.draft.engagement,
      ghl_reuse: opts.draft.ghl_reuse,
      origin_client_id: opts.originClientId,
      target_client_id: opts.targetClientId,
      reinstate: true,
    },
  };
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
 * Recent reinstate rows for this origin.
 * same_file lives on origin.client_id; new_offer lives on the sibling and is
 * found via responses.origin_client_id (Client File CS checklist stays on target).
 */
async function loadRecentOriginReinstates(
  service: SupabaseClient,
  originClientId: string,
): Promise<RecentReinstateSubmission[]> {
  const cutoff = reinstateCutoffIso();
  const select = 'id, client_id, responses, submitted_at';

  const onOrigin = await service
    .from('client_form_submissions')
    .select(select)
    .eq('client_id', originClientId)
    .eq('form_type', 'reinstate')
    .in('status', ['applied', 'submitted'])
    .gte('submitted_at', cutoff)
    .order('submitted_at', { ascending: false })
    .limit(5);

  if (onOrigin.error) throw new ReinstateClientError(onOrigin.error.message, 500);

  const newOffer = await service
    .from('client_form_submissions')
    .select(select)
    .eq('form_type', 'reinstate')
    .in('status', ['applied', 'submitted'])
    .gte('submitted_at', cutoff)
    .filter('responses->>engagement', 'eq', 'new_offer')
    .or(
      `client_id.eq.${originClientId},responses->>origin_client_id.eq.${originClientId}`,
    )
    .order('submitted_at', { ascending: false })
    .limit(5);

  if (newOffer.error) throw new ReinstateClientError(newOffer.error.message, 500);

  const byId = new Map<string, RecentReinstateSubmission>();
  for (const row of [...(onOrigin.data ?? []), ...(newOffer.data ?? [])]) {
    const typed = row as RecentReinstateSubmission;
    if (!typed.id) continue;
    if (!reinstateSubmissionMatchesOrigin(typed, originClientId)) continue;
    byId.set(typed.id, typed);
  }
  return [...byId.values()].sort((a, b) =>
    String(b.submitted_at ?? '').localeCompare(String(a.submitted_at ?? '')),
  );
}

async function throwIdempotentConflict(opts: {
  appOrigin: string;
  engagement: ReinstateEngagement;
  clientId: string;
  welcomeBackToken: string | null | undefined;
  closeId?: string | null;
}): Promise<never> {
  const token = opts.welcomeBackToken ? String(opts.welcomeBackToken) : '';
  const payload: Record<string, unknown> = {
    client_id: opts.clientId,
    engagement: opts.engagement,
  };
  if (opts.closeId) payload.close_id = opts.closeId;
  if (!token) {
    throw new ReinstateClientError('Client was already reinstated recently', 409, payload);
  }
  payload.welcome_back_url = buildWelcomeBackUrl(opts.appOrigin, token);
  throw new ReinstateClientError('Client was already reinstated recently', 409, payload);
}

/**
 * Ensure a winback close exists for this reinstate. Safe to call on success and
 * on idempotent retries when client+submission succeeded but close insert failed.
 */
export async function ensureReinstateClose(
  service: SupabaseClient,
  opts: {
    clientId: string;
    draft: ReinstateFormDraft;
    formSubmissionId: string;
    originClientId: string;
    targetClientId: string;
    submissionSubmittedAt?: string | null;
  },
): Promise<string> {
  const { data: existingRows, error: loadErr } = await service
    .from('acquisition_closes')
    .select('id, form_submission_id, inserted_at, close_kind')
    .eq('client_id', opts.clientId)
    .eq('close_kind', 'reinstate')
    .is('deleted_at', null)
    .order('inserted_at', { ascending: false })
    .limit(5);

  if (loadErr) throw new ReinstateClientError(loadErr.message, 500);

  const existingId = findExistingReinstateClose(
    (existingRows ?? []) as ReinstateCloseCandidate[],
    {
      formSubmissionId: opts.formSubmissionId,
      submittedAt: opts.submissionSubmittedAt ?? null,
    },
  );
  if (existingId) return existingId;

  const row = buildReinstateCloseRow({
    clientId: opts.clientId,
    formSubmissionId: opts.formSubmissionId,
    draft: opts.draft,
    originClientId: opts.originClientId,
    targetClientId: opts.targetClientId,
  });

  const { data: closeRow, error: closeErr } = await service
    .from('acquisition_closes')
    .insert(row)
    .select('id')
    .single();

  if (closeErr || !closeRow) {
    throw new ReinstateClientError(
      closeErr?.message ?? 'Failed to insert reinstate close',
      500,
    );
  }
  return closeRow.id as string;
}

async function loadReusableNewOfferSibling(
  service: SupabaseClient,
  originClientId: string,
  expectedName: string,
): Promise<{ id: string; welcome_back_token: string | null } | null> {
  const cutoff = reinstateCutoffIso();
  const { data, error } = await service
    .from('clients')
    .select('id, name, created_at, lifecycle_status, reinstated_at, welcome_back_token')
    .eq('origin_client_id', originClientId)
    .eq('lifecycle_status', 'onboarding')
    .gte('created_at', cutoff)
    .order('created_at', { ascending: false })
    .limit(5);

  if (error) throw new ReinstateClientError(error.message, 500);

  const siblingId = pickReusableNewOfferSibling(
    (data ?? []) as ReinstateSiblingCandidate[],
    { cutoffIso: cutoff, expectedName },
  );
  if (!siblingId) return null;

  const match = (data ?? []).find((row) => row.id === siblingId);
  return {
    id: siblingId,
    welcome_back_token: (match?.welcome_back_token as string | null | undefined) ?? null,
  };
}

async function healIdempotentReinstate(opts: {
  service: SupabaseClient;
  appOrigin: string;
  draft: ReinstateFormDraft;
  engagement: ReinstateEngagement;
  clientId: string;
  welcomeBackToken: string | null | undefined;
  submission: RecentReinstateSubmission;
  originClientId: string;
}): Promise<never> {
  const submissionId = opts.submission.id;
  if (!submissionId) {
    return throwIdempotentConflict({
      appOrigin: opts.appOrigin,
      engagement: opts.engagement,
      clientId: opts.clientId,
      welcomeBackToken: opts.welcomeBackToken,
    });
  }

  const closeId = await ensureReinstateClose(opts.service, {
    clientId: opts.clientId,
    draft: opts.draft,
    formSubmissionId: submissionId,
    originClientId: opts.originClientId,
    targetClientId: opts.clientId,
    submissionSubmittedAt: opts.submission.submitted_at ?? null,
  });

  return throwIdempotentConflict({
    appOrigin: opts.appOrigin,
    engagement: opts.engagement,
    clientId: opts.clientId,
    welcomeBackToken: opts.welcomeBackToken,
    closeId,
  });
}

export async function reinstateClient(
  service: SupabaseClient,
  opts: ReinstateClientOpts,
): Promise<ReinstateClientResult> {
  const { draft, submittedBy, appOrigin } = opts;
  const clientId = draft.client_id.trim();

  const { data: originRaw, error: loadErr } = await service
    .from('clients')
    .select(ORIGIN_SELECT)
    .eq('id', clientId)
    .maybeSingle();

  if (loadErr) throw new ReinstateClientError(loadErr.message, 500);
  if (!originRaw) throw new ReinstateClientError('Client not found', 404);

  // Dynamic select string → Supabase infers GenericStringError; narrow explicitly.
  const origin = originRaw as unknown as Record<string, unknown>;
  const lifecycle = (origin.lifecycle_status as string | null) ?? null;

  // Idempotency before sibling create / same-file update — origin lifecycle
  // does not matter (new_offer leaves the origin churned).
  {
    const recent = await loadRecentOriginReinstates(service, origin.id as string);
    if (draft.engagement === 'new_offer') {
      const targetId = findRecentNewOfferTargetClientId(recent);
      if (targetId) {
        const matched =
          recent.find((row) => readTargetClientId(row.responses) === targetId) ??
          recent.find((row) => readReinstateEngagement(row.responses) === 'new_offer');
        const { data: sibling, error: siblingLoadErr } = await service
          .from('clients')
          .select('id, welcome_back_token')
          .eq('id', targetId)
          .maybeSingle();
        if (siblingLoadErr) throw new ReinstateClientError(siblingLoadErr.message, 500);
        const clientIdForConflict =
          (sibling?.id as string | undefined) ?? targetId;
        if (matched?.id) {
          return healIdempotentReinstate({
            service,
            appOrigin,
            draft,
            engagement: 'new_offer',
            clientId: clientIdForConflict,
            welcomeBackToken:
              (sibling?.welcome_back_token as string | null | undefined) ?? null,
            submission: matched,
            originClientId: origin.id as string,
          });
        }
        return throwIdempotentConflict({
          appOrigin,
          engagement: 'new_offer',
          clientId: clientIdForConflict,
          welcomeBackToken:
            (sibling?.welcome_back_token as string | null | undefined) ?? null,
        });
      }
    } else if (
      hasRecentSameFileReinstate(recent) ||
      (lifecycle === 'onboarding' && origin.welcome_back_token && recent.length > 0)
    ) {
      const matched =
        recent.find((row) => readReinstateEngagement(row.responses) === 'same_file') ??
        recent[0];
      if (matched?.id) {
        return healIdempotentReinstate({
          service,
          appOrigin,
          draft,
          engagement: 'same_file',
          clientId: origin.id as string,
          welcomeBackToken: origin.welcome_back_token as string | null,
          submission: matched,
          originClientId: origin.id as string,
        });
      }
      return throwIdempotentConflict({
        appOrigin,
        engagement: 'same_file',
        clientId: origin.id as string,
        welcomeBackToken: origin.welcome_back_token as string | null,
      });
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
    const expectedSiblingName = `${originName} — ${reportingType}`;

    // Reuse an orphaned sibling from a prior partial reinstate instead of
    // creating another offer under the same origin.
    const reusable = await loadReusableNewOfferSibling(
      service,
      origin.id as string,
      expectedSiblingName,
    );

    let siblingId: string;
    if (reusable) {
      siblingId = reusable.id;
    } else {
      try {
        const created = await createOfferForAccount(service, {
          origin_client_id: origin.id as string,
          name: expectedSiblingName,
          reporting_type: reportingType,
          sales_package: draft.sales_package || null,
          mrr: draft.mrr,
          lifecycle_status: 'onboarding',
          date_signed: draft.closed_at || null,
          logged_by: submittedBy,
          // intentionally omit ghl_location_id — new offer must not reuse old GHL
        });
        siblingId = created.client.id as string;
      } catch (e) {
        if (e instanceof ReinstateClientError) throw e;
        throw new ReinstateClientError(e instanceof Error ? e.message : String(e), 500);
      }
    }

    targetClientId = siblingId;
    appliedPatch = {
      ...buildNewOfferIdentityPatch(origin),
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
  // Write this immediately after sibling create/reuse so retries can find
  // responses.target_client_id before another createOfferForAccount.
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

  const closeId = await ensureReinstateClose(service, {
    clientId: targetClientId,
    draft,
    formSubmissionId: submission.id,
    originClientId: origin.id as string,
    targetClientId,
    submissionSubmittedAt: submission.submitted_at ?? reinstatedAtIso,
  });

  return {
    client_id: targetClientId,
    welcome_back_url: buildWelcomeBackUrl(appOrigin, token),
    engagement: draft.engagement,
    close_id: closeId,
    submission_id: submission.id,
  };
}
