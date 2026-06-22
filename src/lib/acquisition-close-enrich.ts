import type { SupabaseClient } from '@supabase/supabase-js';
import { CLOSER_FORM_TYPES } from '@/lib/acquisition-closer-form';
import {
  assessCloseCompleteness,
  type CloseCompleteness,
  type CloseCompletenessInput,
} from '@/lib/acquisition-close-completeness';
import { flattenRawCloseRow } from '@/lib/acquisition-raw-enriched';

type CloseRow = Record<string, unknown>;

export type EnrichedCloseRow = Record<string, unknown> & {
  offered_by: string | null;
  setter_name: string | null;
  client_name: string | null;
  offer_is_closed: boolean | null;
  has_closer_form: boolean;
  completeness: CloseCompleteness;
};

export async function enrichClosesWithCompleteness(
  service: SupabaseClient,
  rows: CloseRow[],
): Promise<EnrichedCloseRow[]> {
  if (rows.length === 0) return [];

  const flat = rows.map(flattenRawCloseRow);
  const callIds = flat.map(r => r.call_id as string | null).filter((id): id is string => !!id);
  const offerIds = flat.map(r => r.offer_id as string | null).filter((id): id is string => !!id);
  const leadIds = flat.map(r => r.lead_id as string | null).filter((id): id is string => !!id);

  const [{ data: calls }, { data: offers }, { data: subsByLead }] = await Promise.all([
    callIds.length > 0
      ? service
          .from('acquisition_calls')
          .select('id, form_submission_id')
          .in('id', callIds)
      : Promise.resolve({ data: [] as { id: string; form_submission_id: string | null }[] }),
    offerIds.length > 0
      ? service.from('acquisition_offers').select('id, is_closed').in('id', offerIds)
      : Promise.resolve({ data: [] as { id: string; is_closed: boolean }[] }),
    leadIds.length > 0
      ? service
          .from('acquisition_form_submissions')
          .select('lead_id')
          .in('form_type', [...CLOSER_FORM_TYPES])
          .in('lead_id', leadIds)
      : Promise.resolve({ data: [] as { lead_id: string | null }[] }),
  ]);

  const callHasForm = new Set(
    (calls ?? []).filter(c => c.form_submission_id).map(c => c.id),
  );
  const offerClosedById = new Map((offers ?? []).map(o => [o.id, o.is_closed]));
  const leadHasCloserForm = new Set(
    (subsByLead ?? []).map(s => s.lead_id).filter((id): id is string => !!id),
  );

  return flat.map(row => {
    const callId = row.call_id as string | null;
    const offerId = row.offer_id as string | null;
    const leadId = row.lead_id as string | null;
    const hasCloserForm =
      (!!callId && callHasForm.has(callId)) || (!!leadId && leadHasCloserForm.has(leadId));

    const input: CloseCompletenessInput = {
      lead_id: leadId,
      offer_id: offerId,
      client_id: row.client_id as string | null,
      mapping_status: row.mapping_status as string | null,
      cash_collected: row.cash_collected as number | null,
      offer_type: row.offer_type as string | null,
      reporting_type: row.reporting_type as string | null,
      setter_name: row.setter_name as string | null,
      offered_by: row.offered_by as string | null,
      call_id: callId,
      has_closer_form: hasCloserForm,
      offer_is_closed: offerId ? (offerClosedById.get(offerId) ?? null) : null,
    };

    return {
      ...row,
      offered_by: (row.offered_by as string | null) ?? null,
      setter_name: (row.setter_name as string | null) ?? null,
      client_name: (row.client_name as string | null) ?? null,
      offer_is_closed: input.offer_is_closed ?? null,
      has_closer_form: hasCloserForm,
      completeness: assessCloseCompleteness(input),
    } as EnrichedCloseRow;
  });
}
