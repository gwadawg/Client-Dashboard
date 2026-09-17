import { randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createOfferForAccount } from '@/lib/client-account-groups';
import { insertFormSubmission } from '@/lib/form-submissions';
import { syncIsLiveWithLifecycle } from '@/lib/lifecycle-sync';
import {
  reinstateDraftToResponses,
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

export function buildWelcomeBackUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, '')}/onboard/welcome-back/${encodeURIComponent(token)}`;
}

export function buildSameFileClientPatch(
  draft: ReinstateFormDraft,
  reinstatedAtIso: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    lifecycle_status: 'onboarding',
    reinstated_at: reinstatedAtIso,
    churned_at: null,
    is_live: syncIsLiveWithLifecycle('onboarding'),
    offer: draft.offer || draft.reporting_type,
    reporting_type: draft.reporting_type || draft.offer,
    mrr: draft.mrr,
  };
  if (draft.sales_package) patch.sales_package = draft.sales_package;
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

function mintWelcomeBackToken(): string {
  return randomBytes(24).toString('hex');
}

function closedAtIso(closedAt: string): string {
  const trimmed = closedAt.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `${trimmed}T12:00:00.000Z`;
  return trimmed;
}

export async function reinstateClient(
  service: SupabaseClient,
  opts: ReinstateClientOpts,
): Promise<ReinstateClientResult> {
  const { draft, submittedBy, appOrigin } = opts;
  const clientId = draft.client_id.trim();

  const { data: origin, error: loadErr } = await service
    .from('clients')
    .select('id, name, lifecycle_status, welcome_back_token')
    .eq('id', clientId)
    .maybeSingle();

  if (loadErr) throw new ReinstateClientError(loadErr.message, 500);
  if (!origin) throw new ReinstateClientError('Client not found', 404);

  const lifecycle = (origin.lifecycle_status as string | null) ?? null;

  if (lifecycle === 'onboarding' && origin.welcome_back_token) {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recent, error: recentErr } = await service
      .from('client_form_submissions')
      .select('id, responses, submitted_at')
      .eq('client_id', origin.id)
      .eq('form_type', 'reinstate')
      .gte('submitted_at', cutoff)
      .order('submitted_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (recentErr) throw new ReinstateClientError(recentErr.message, 500);
    if (recent) {
      const engagement =
        (recent.responses as { engagement?: ReinstateFormDraft['engagement'] } | null)
          ?.engagement === 'new_offer'
          ? 'new_offer'
          : 'same_file';
      const welcome_back_url = buildWelcomeBackUrl(
        appOrigin,
        String(origin.welcome_back_token),
      );
      throw new ReinstateClientError('Client was already reinstated recently', 409, {
        client_id: origin.id,
        welcome_back_url,
        engagement,
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
    const { client: sibling } = await createOfferForAccount(service, {
      origin_client_id: origin.id as string,
      name: String(origin.name),
      reporting_type: draft.reporting_type || draft.offer,
      sales_package: draft.sales_package || null,
      mrr: draft.mrr,
      lifecycle_status: 'onboarding',
      date_signed: draft.closed_at || null,
      logged_by: submittedBy,
      // intentionally omit ghl_location_id — new offer must not reuse old GHL
    });

    targetClientId = sibling.id as string;
    appliedPatch = {
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

  const responses = reinstateDraftToResponses(draft);
  const submission = await insertFormSubmission(service, {
    client_id: targetClientId,
    form_type: 'reinstate',
    status: 'applied',
    submitted_by: submittedBy,
    responses,
    applied_patch: {
      ...appliedPatch,
      engagement: draft.engagement,
      origin_client_id: origin.id,
    },
  });

  const offerType = draft.sales_package || draft.offer || draft.reporting_type || null;
  const reportingType = draft.reporting_type || draft.offer || null;

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
      raw: {
        closer_name: draft.closer_name,
        engagement: draft.engagement,
        ghl_reuse: draft.ghl_reuse,
        origin_client_id: origin.id,
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
