import type { SupabaseClient } from '@supabase/supabase-js';
import { assignClientToClose } from '@/lib/acquisition-close-update';

export type CloseDismissedSnapshot = {
  dismissed_at: string;
  lead_id: string | null;
  client_id: string | null;
  offer_id: string | null;
  call_id: string | null;
  form_submission_id: string | null;
  lead_name: string | null;
  client_name: string | null;
  offer_type: string | null;
  cash_collected: number | null;
  closed_at: string;
};

type CloseRow = {
  id: string;
  lead_id: string | null;
  client_id: string | null;
  offer_id: string | null;
  call_id: string | null;
  form_submission_id: string | null;
  mapping_status: string;
  deleted_at: string | null;
  offer_type: string | null;
  cash_collected: number | null;
  closed_at: string;
  raw: Record<string, unknown> | null;
  acquisition_leads?: { lead_name: string | null } | { lead_name: string | null }[] | null;
  clients?: { name: string | null } | { name: string | null }[] | null;
};

const CLOSE_LIFECYCLE_SELECT = `
  id,
  lead_id,
  client_id,
  offer_id,
  call_id,
  form_submission_id,
  mapping_status,
  deleted_at,
  offer_type,
  cash_collected,
  closed_at,
  raw,
  acquisition_leads(lead_name),
  clients(name)
`;

function embedName(
  embed: { lead_name?: string | null; name?: string | null } | { lead_name?: string | null; name?: string | null }[] | null | undefined,
  field: 'lead_name' | 'name',
): string | null {
  if (!embed) return null;
  const row = Array.isArray(embed) ? embed[0] : embed;
  const value = row?.[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function loadClose(service: SupabaseClient, closeId: string): Promise<CloseRow> {
  const { data, error } = await service
    .from('acquisition_closes')
    .select(CLOSE_LIFECYCLE_SELECT)
    .eq('id', closeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Close not found');
  return data as CloseRow;
}

function readSnapshot(raw: Record<string, unknown> | null): CloseDismissedSnapshot | null {
  const snapshot = raw?.dismissed_snapshot;
  if (!snapshot || typeof snapshot !== 'object') return null;
  return snapshot as CloseDismissedSnapshot;
}

async function unlinkOfferIfOrphaned(
  service: SupabaseClient,
  offerId: string,
  excludingCloseId: string,
): Promise<void> {
  const { data: other } = await service
    .from('acquisition_closes')
    .select('id')
    .eq('offer_id', offerId)
    .neq('id', excludingCloseId)
    .is('deleted_at', null)
    .neq('mapping_status', 'dismissed')
    .limit(1);
  if (other?.length) return;

  await service
    .from('acquisition_offers')
    .update({ is_closed: false, updated_at: new Date().toISOString() })
    .eq('id', offerId);
}

async function unlinkLeadConversionIfOrphaned(
  service: SupabaseClient,
  leadId: string,
  clientId: string,
  excludingCloseId: string,
): Promise<void> {
  const { data: other } = await service
    .from('acquisition_closes')
    .select('id')
    .eq('lead_id', leadId)
    .eq('client_id', clientId)
    .neq('id', excludingCloseId)
    .is('deleted_at', null)
    .neq('mapping_status', 'dismissed')
    .limit(1);
  if (other?.length) return;

  await service
    .from('acquisition_leads')
    .update({ converted_client_id: null, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .eq('converted_client_id', clientId);
}

function buildSnapshot(close: CloseRow): CloseDismissedSnapshot {
  return {
    dismissed_at: new Date().toISOString(),
    lead_id: close.lead_id,
    client_id: close.client_id,
    offer_id: close.offer_id,
    call_id: close.call_id,
    form_submission_id: close.form_submission_id,
    lead_name: embedName(close.acquisition_leads, 'lead_name'),
    client_name: embedName(close.clients, 'name'),
    offer_type: close.offer_type,
    cash_collected: close.cash_collected,
    closed_at: close.closed_at,
  };
}

/** Exclude from reporting and detach all live links. Snapshot kept in raw for audit/restore. */
export async function excludeAcquisitionClose(service: SupabaseClient, closeId: string): Promise<void> {
  const close = await loadClose(service, closeId);
  if (close.deleted_at) throw new Error('Close has been deleted');

  const snapshot = readSnapshot(close.raw) ?? buildSnapshot(close);
  if (!readSnapshot(close.raw)) {
    snapshot.dismissed_at = new Date().toISOString();
  }

  if (close.offer_id) {
    await unlinkOfferIfOrphaned(service, close.offer_id, closeId);
  }
  if (close.lead_id && close.client_id) {
    await unlinkLeadConversionIfOrphaned(service, close.lead_id, close.client_id, closeId);
  }

  const nextRaw = {
    ...(close.raw ?? {}),
    dismissed_snapshot: snapshot,
  };

  const { error } = await service
    .from('acquisition_closes')
    .update({
      mapping_status: 'dismissed',
      lead_id: null,
      client_id: null,
      offer_id: null,
      call_id: null,
      form_submission_id: null,
      raw: nextRaw,
    })
    .eq('id', closeId);
  if (error) throw new Error(error.message);
}

/** Soft-delete an excluded close. Row stays in DB for audit but disappears from all UI. */
export async function deleteAcquisitionClose(service: SupabaseClient, closeId: string): Promise<void> {
  const close = await loadClose(service, closeId);
  if (close.deleted_at) return;
  if (close.mapping_status !== 'dismissed') {
    await excludeAcquisitionClose(service, closeId);
  }

  const { error } = await service
    .from('acquisition_closes')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', closeId);
  if (error) throw new Error(error.message);
}

/** Restore a dismissed close and re-link from snapshot when possible. */
export async function restoreAcquisitionClose(service: SupabaseClient, closeId: string): Promise<void> {
  const close = await loadClose(service, closeId);
  if (close.deleted_at) throw new Error('Deleted closes cannot be restored');
  if (close.mapping_status !== 'dismissed') return;

  const snapshot = readSnapshot(close.raw);
  if (!snapshot) {
    const { error } = await service
      .from('acquisition_closes')
      .update({ mapping_status: 'pending_client' })
      .eq('id', closeId);
    if (error) throw new Error(error.message);
    return;
  }

  const patch: Record<string, unknown> = {
    lead_id: snapshot.lead_id,
    offer_id: snapshot.offer_id,
    call_id: snapshot.call_id,
    form_submission_id: snapshot.form_submission_id,
    mapping_status: snapshot.client_id ? 'mapped' : 'pending_client',
    client_id: null,
  };

  const { error: patchErr } = await service.from('acquisition_closes').update(patch).eq('id', closeId);
  if (patchErr) throw new Error(patchErr.message);

  if (snapshot.offer_id) {
    await service
      .from('acquisition_offers')
      .update({ is_closed: true, updated_at: new Date().toISOString() })
      .eq('id', snapshot.offer_id);
  }

  if (snapshot.client_id) {
    await assignClientToClose(service, closeId, snapshot.client_id);
  }
}

export function closeDisplayFromSnapshot(raw: Record<string, unknown> | null | undefined): {
  lead_name: string | null;
  client_name: string | null;
} {
  const snapshot = readSnapshot(raw ?? null);
  return {
    lead_name: snapshot?.lead_name ?? null,
    client_name: snapshot?.client_name ?? null,
  };
}
