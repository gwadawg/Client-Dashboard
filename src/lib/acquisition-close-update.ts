import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeOfferType } from '@/lib/acquisition-config';
import { normalizeReportingType } from '@/lib/reporting-types';
import { normalizeServiceProgram, serviceProgramApplies } from '@/lib/service-program';

export type PatchCloseInput = {
  lead_id?: string | null;
  client_id?: string | null;
  offer_id?: string | null;
  call_id?: string | null;
  closed_at?: string;
  cash_collected?: number | null;
  offer_type?: string | null;
  reporting_type?: string | null;
  service_program?: string | null;
  setter_name?: string | null;
  offered_by?: string | null;
  mapping_status?: 'mapped' | 'pending_client' | 'dismissed';
};

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function parseCash(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export async function assignClientToClose(
  service: SupabaseClient,
  closeId: string,
  clientId: string,
): Promise<void> {
  const { data: close, error: closeErr } = await service
    .from('acquisition_closes')
    .select('lead_id, closed_at, reporting_type, service_program, client_id, mapping_status')
    .eq('id', closeId)
    .single();
  if (closeErr || !close) throw new Error('Close not found');

  if (close.client_id === clientId && close.mapping_status === 'mapped') return;

  const { data: conflict } = await service
    .from('acquisition_closes')
    .select('id')
    .eq('client_id', clientId)
    .neq('id', closeId)
    .maybeSingle();
  if (conflict) throw new Error('That client is already linked to another close');

  const clientPatch: Record<string, unknown> = {};
  if (close.reporting_type) clientPatch.reporting_type = close.reporting_type;
  if (close.service_program) clientPatch.service_program = close.service_program;
  if (Object.keys(clientPatch).length) {
    await service.from('clients').update(clientPatch).eq('id', clientId);
  }

  const { error: closeUpdateErr } = await service
    .from('acquisition_closes')
    .update({
      client_id: clientId,
      mapping_status: 'mapped',
    })
    .eq('id', closeId);
  if (closeUpdateErr) throw new Error(closeUpdateErr.message);

  if (close.lead_id) {
    const { error: leadErr } = await service
      .from('acquisition_leads')
      .update({ converted_client_id: clientId, updated_at: new Date().toISOString() })
      .eq('id', close.lead_id);
    if (leadErr) throw new Error(leadErr.message);
  }
}

async function syncLinkedOffer(
  service: SupabaseClient,
  offerId: string,
  patch: {
    cash_collected?: number | null;
    offer_type?: string | null;
    setter_name?: string | null;
    offered_by?: string | null;
    is_closed?: boolean;
  },
): Promise<void> {
  const offerPatch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    is_closed: patch.is_closed ?? true,
  };
  if (patch.cash_collected !== undefined) offerPatch.cash_collected = patch.cash_collected;
  if (patch.offer_type) offerPatch.offer_type = patch.offer_type;
  if (patch.setter_name !== undefined) offerPatch.setter_name = patch.setter_name;
  if (patch.offered_by !== undefined) offerPatch.offered_by = patch.offered_by;

  const { error } = await service.from('acquisition_offers').update(offerPatch).eq('id', offerId);
  if (error) throw new Error(error.message);
}

export async function patchAcquisitionClose(
  service: SupabaseClient,
  closeId: string,
  input: PatchCloseInput,
): Promise<void> {
  const { data: existing, error: loadErr } = await service
    .from('acquisition_closes')
    .select('id, lead_id, offer_id, client_id, mapping_status, reporting_type, offer_type')
    .eq('id', closeId)
    .single();
  if (loadErr || !existing) throw new Error('Close not found');

  const closePatch: Record<string, unknown> = {};
  if (input.lead_id !== undefined) closePatch.lead_id = input.lead_id;
  if (input.offer_id !== undefined) closePatch.offer_id = input.offer_id;
  if (input.call_id !== undefined) closePatch.call_id = input.call_id;
  if (input.closed_at) closePatch.closed_at = input.closed_at;
  if (input.cash_collected !== undefined) closePatch.cash_collected = input.cash_collected;
  if (input.offer_type !== undefined) {
    closePatch.offer_type = input.offer_type ? normalizeOfferType(input.offer_type) : null;
  }
  if (input.reporting_type !== undefined) {
    closePatch.reporting_type = input.reporting_type
      ? normalizeReportingType(input.reporting_type)
      : null;
  }
  if (input.service_program !== undefined) {
    const rt = input.reporting_type ?? existing.reporting_type;
    closePatch.service_program =
      input.service_program && serviceProgramApplies(rt)
        ? normalizeServiceProgram(input.service_program)
        : input.service_program
          ? normalizeServiceProgram(input.service_program)
          : null;
  }
  if (input.setter_name !== undefined) closePatch.setter_name = str(input.setter_name);
  if (input.mapping_status) closePatch.mapping_status = input.mapping_status;

  const nextClientId =
    input.client_id !== undefined ? input.client_id : (existing.client_id as string | null);
  const clientChanging =
    input.client_id !== undefined && input.client_id !== existing.client_id;

  if (Object.keys(closePatch).length > 0) {
    const { error } = await service.from('acquisition_closes').update(closePatch).eq('id', closeId);
    if (error) throw new Error(error.message);
  }

  const offerId = (input.offer_id ?? existing.offer_id) as string | null;
  if (offerId) {
    await syncLinkedOffer(service, offerId, {
      cash_collected: input.cash_collected,
      offer_type: input.offer_type ? normalizeOfferType(input.offer_type) : undefined,
      setter_name: input.setter_name,
      offered_by: input.offered_by,
      is_closed: true,
    });
  } else if (input.offered_by !== undefined || input.setter_name !== undefined) {
    const leadId = (input.lead_id ?? existing.lead_id) as string | null;
    const offerType = input.offer_type
      ? normalizeOfferType(input.offer_type)
      : existing.offer_type
        ? normalizeOfferType(existing.offer_type as string)
        : null;
    if (leadId && offerType) {
      const { data: found } = await service
        .from('acquisition_offers')
        .select('id')
        .eq('lead_id', leadId)
        .eq('offer_type', offerType)
        .order('offered_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (found?.id) {
        await service.from('acquisition_closes').update({ offer_id: found.id }).eq('id', closeId);
        await syncLinkedOffer(service, found.id, {
          cash_collected: input.cash_collected,
          offer_type: offerType,
          setter_name: input.setter_name,
          offered_by: input.offered_by,
          is_closed: true,
        });
      }
    }
  }

  if (clientChanging && nextClientId) {
    await assignClientToClose(service, closeId, nextClientId);
  } else if (input.mapping_status === 'dismissed') {
    // already applied above
  } else if (input.mapping_status === 'pending_client' && !nextClientId) {
  } else if (input.client_id === null && input.client_id !== undefined) {
    await service
      .from('acquisition_closes')
      .update({ client_id: null, mapping_status: 'pending_client' })
      .eq('id', closeId);
  }
}

export function parsePatchCloseBody(body: Record<string, unknown>): PatchCloseInput {
  const mapping = str(body.mapping_status);
  const mappingStatus =
    mapping === 'mapped' || mapping === 'pending_client' || mapping === 'dismissed'
      ? mapping
      : undefined;

  return {
    lead_id: body.lead_id === null ? null : str(body.lead_id) ?? undefined,
    client_id: body.client_id === null ? null : str(body.client_id) ?? undefined,
    offer_id: body.offer_id === null ? null : str(body.offer_id) ?? undefined,
    call_id: body.call_id === null ? null : str(body.call_id) ?? undefined,
    closed_at: str(body.closed_at) ?? undefined,
    cash_collected: body.cash_collected === null ? null : parseCash(body.cash_collected),
    offer_type: body.offer_type === null ? null : str(body.offer_type) ?? undefined,
    reporting_type: body.reporting_type === null ? null : str(body.reporting_type) ?? undefined,
    service_program: body.service_program === null ? null : str(body.service_program) ?? undefined,
    setter_name: body.setter_name === null ? null : str(body.setter_name) ?? undefined,
    offered_by: body.offered_by === null ? null : str(body.offered_by) ?? undefined,
    mapping_status: mappingStatus,
  };
}
